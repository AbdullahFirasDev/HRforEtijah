// Face detection and face prints, computed entirely on the device: no image
// leaves it. This module decides where the models run and keeps them ready:
//   1. a Web Worker on the GPU (WebGL), so the page never freezes;
//   2. the page itself on the GPU, where a worker can't use it (Safari/iOS);
//   3. WebAssembly on the CPU (worker first) when there is no WebGL at all.
// The models load once and are reused for every check until they sit unused.

const INIT_TIMEOUT_MS = 120000; // first start on a slow connection downloads ~8 MB
const READ_TIMEOUT_MS = 15000; // one frame; longer means the GPU or worker is stuck
const IDLE_RELEASE_MS = 5 * 60 * 1000;

export class FaceEngineStalled extends Error {}

// Safari and every iOS browser (all WebKit): tfjs keeps WebGL out of workers
// there, and a worker without the GPU would be slower than the page with it
const isWebKit = () => /Apple/.test(navigator.vendor || '');

const workerSupported = () =>
  typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap === 'function' && !isWebKit();

const pageHasWebgl = () => {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
};

// One reused canvas holds the frame being analysed. It is drawn exactly as
// face-api draws a <video> (CPU-backed 2D canvas at the camera's own size), so
// prints are unchanged from before; it is cleared when a check ends.
let frameCanvas = null;
let frameContext = null;

const grabFrame = (video) => {
  const { videoWidth: width, videoHeight: height } = video;
  frameCanvas ??= document.createElement('canvas');
  if (frameCanvas.width !== width || frameCanvas.height !== height) {
    frameCanvas.width = width;
    frameCanvas.height = height;
  }
  frameContext ??= frameCanvas.getContext('2d', { willReadFrequently: true });
  frameContext.drawImage(video, 0, 0, width, height);
  return frameCanvas;
};

export const clearFrame = () => {
  if (frameCanvas) frameCanvas.width = frameCanvas.height = 0;
};

const startWorker = (backends) =>
  new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(new URL('./faceWorker.js', import.meta.url), { type: 'module' });
    } catch (err) {
      reject(err);
      return;
    }
    const pending = new Map();
    let seq = 0;
    let dead = null;
    const kill = (err) => {
      if (dead) return;
      dead = err;
      worker.terminate();
      pending.forEach(({ fail, timer }) => {
        clearTimeout(timer);
        fail(err);
      });
      pending.clear();
    };
    worker.onmessage = ({ data }) => {
      const call = pending.get(data.id);
      if (!call) return;
      pending.delete(data.id);
      clearTimeout(call.timer);
      if (data.ok) call.done(data);
      else call.fail(new Error(data.error));
    };
    worker.onerror = (event) => {
      event.preventDefault?.();
      kill(new Error('face worker failed'));
    };
    worker.onmessageerror = () => kill(new Error('face worker message failed'));

    const send = (message, transfer, timeoutMs) =>
      new Promise((done, fail) => {
        if (dead) {
          fail(dead);
          return;
        }
        const id = ++seq;
        try {
          worker.postMessage({ ...message, id }, transfer);
        } catch (err) {
          fail(err);
          return;
        }
        const timer = setTimeout(() => kill(new FaceEngineStalled('face worker stopped responding')), timeoutMs);
        pending.set(id, { done, fail, timer });
      });

    send({ type: 'init', backends }, [], INIT_TIMEOUT_MS).then(
      ({ backend }) =>
        resolve({
          where: 'worker',
          backend,
          get broken() {
            return !!dead;
          },
          async read(canvas, printWhen) {
            const bitmap = await createImageBitmap(canvas);
            try {
              return (await send({ type: 'read', bitmap, printWhen }, [bitmap], READ_TIMEOUT_MS)).face;
            } finally {
              bitmap.close(); // no-op once handed to the worker
            }
          },
          dispose: () => kill(new Error('face engine released')),
        }),
      (err) => {
        kill(err);
        reject(err);
      }
    );
  });

const startPage = async (backends) => {
  const core = await import('./faceCore');
  const { backend } = await core.prepareFaceModels({ backends });
  let broken = false;
  return {
    where: 'page',
    backend,
    get broken() {
      return broken;
    },
    async read(canvas, printWhen) {
      let timer;
      const stalled = new Promise((_, fail) => {
        timer = setTimeout(() => fail(new FaceEngineStalled('face models stopped responding')), READ_TIMEOUT_MS);
      });
      try {
        return await Promise.race([core.readFaceFrom(canvas, printWhen), stalled]);
      } catch (err) {
        broken = true;
        throw err;
      } finally {
        clearTimeout(timer);
      }
    },
    dispose: () => {}, // the page keeps its models; they can't be unloaded
  };
};

const plans = ({ preload }) => {
  const list = [];
  const worker = workerSupported();
  if (worker) list.push(() => startWorker(['webgl']));
  // Loading on the page freezes it for a moment, so never in the background
  if (preload) return list;
  if (pageHasWebgl()) list.push(() => startPage(['webgl']));
  if (worker) list.push(() => startWorker(['wasm']));
  list.push(() => startPage(['wasm', 'cpu']));
  return list;
};

const start = async (options) => {
  let lastError = new Error('no face engine available');
  for (const plan of plans(options)) {
    try {
      return await plan();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
};

let engine = null; // Promise of the engine in use
let enginePreloaded = false; // started by preloadFaceEngine (worker only)
let users = 0;
let idleTimer = null;
// One frame at a time across all checks: the frame is grabbed only once the
// engine is free, so a result is never for an old frame
let chain = Promise.resolve();

const forget = (current) => {
  if (engine !== current) return;
  engine = null;
  current.then((e) => e.dispose(), () => {});
};

const scheduleRelease = () => {
  clearTimeout(idleTimer);
  const current = engine;
  idleTimer = setTimeout(() => {
    if (!users && current) forget(current);
  }, IDLE_RELEASE_MS);
};

const getEngine = (options = {}) => {
  if (!engine) {
    const current = start(options);
    engine = current;
    enginePreloaded = !!options.preload;
    current.catch(() => {
      if (engine === current) engine = null; // the next check starts again
    });
  }
  return engine;
};

// Starts the models in the background (worker only) so the first check
// doesn't wait for them. Errors are left for the check itself to report.
export const preloadFaceEngine = () => {
  if (engine || !workerSupported() || navigator.connection?.saveData) return;
  getEngine({ preload: true }).catch(() => {});
  scheduleRelease();
};

// For one face check: the ready engine, with read(video, printWhen) that
// analyses the current frame. Call release() when the check ends.
export const openFaceEngine = async () => {
  clearTimeout(idleTimer);
  users++;
  let current = getEngine();
  const preloaded = enginePreloaded;
  let ready;
  try {
    ready = await current.catch((err) => {
      // The background start only tries the worker: now try everything
      if (!preloaded) throw err;
      current = getEngine();
      return current;
    });
    if (ready.broken) {
      forget(current);
      current = getEngine();
      ready = await current;
    }
  } catch (err) {
    users--;
    throw err;
  }
  let released = false;
  return {
    where: ready.where,
    backend: ready.backend,
    read(video, printWhen) {
      if (released) return Promise.reject(new Error('face engine released'));
      const run = chain.then(() => ready.read(grabFrame(video), printWhen));
      chain = run.catch(() => {});
      run.catch(() => {
        if (ready.broken) forget(current);
      });
      return run;
    },
    release() {
      if (released) return;
      released = true;
      users--;
      if (users) return;
      // After any frame still being analysed, so it isn't read half-cleared
      chain = chain.then(() => {
        if (!users) clearFrame();
      });
      scheduleRelease();
    },
  };
};
