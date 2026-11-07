// The face models themselves. This runs inside a Web Worker (faceWorker.js)
// or, where a worker can't use the GPU, on the page (faceEngine.js). The
// models, settings and pixels are the same either way, so a print comes out
// identical to the ones employees registered with.
import * as faceapi from '@vladmandic/face-api';

const MODELS_URL = '/models';
// tfjs-backend-wasm 4.22.0 binaries, the version bundled in face-api 1.7.15
const WASM_URL = '/tfjs-wasm/4.22.0/';
const DETECTOR_INPUT = 320;
const MIN_DETECTION_SCORE = 0.5;

let options = null;

const newCanvas = (width, height) => {
  if (typeof document === 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

// face-api only knows the page's canvas; in a worker it gets OffscreenCanvas.
// Inputs are always canvases, so images and video are never needed there.
const useWorkerCanvas = () => {
  const missing = () => {
    throw new Error('not available in a worker');
  };
  faceapi.env.setEnv({
    Canvas: OffscreenCanvas,
    CanvasRenderingContext2D: OffscreenCanvasRenderingContext2D,
    Image: class NoImage {},
    ImageData,
    Video: class NoVideo {},
    createCanvasElement: () => new OffscreenCanvas(1, 1),
    createImageElement: missing,
    createVideoElement: missing,
    fetch: (...args) => fetch(...args),
    readFile: missing,
  });
};

const pickBackend = async (backends) => {
  for (const name of backends) {
    try {
      if (name === 'wasm') faceapi.tf.setWasmPaths(WASM_URL);
      if (await faceapi.tf.setBackend(name)) {
        await faceapi.tf.ready();
        return name;
      }
    } catch {
      // try the next one
    }
  }
  throw new Error('no usable backend');
};

const runAllModels = async (canvas) => {
  await faceapi.nets.tinyFaceDetector.locateFaces(canvas, options);
  await faceapi.nets.faceLandmark68Net.detectLandmarks(canvas);
  await faceapi.nets.faceRecognitionNet.computeFaceDescriptor(canvas);
};

// The first run prepares the GPU programs, which takes seconds. Asking for
// all of them at once lets the browser build them in parallel; the next run
// then only waits for what is left.
const warmUp = async (backend) => {
  const blank = newCanvas(150, 150);
  const tf = faceapi.tf;
  if (backend === 'webgl') {
    tf.env().set('ENGINE_COMPILE_ONLY', true);
    try {
      await runAllModels(blank);
    } finally {
      tf.env().set('ENGINE_COMPILE_ONLY', false);
    }
    await tf.backend().checkCompileCompletionAsync();
    tf.backend().getUniformLocations();
  }
  await runAllModels(blank);
};

// backends: in order of preference, e.g. ['webgl'] or ['wasm', 'cpu']
export async function prepareFaceModels({ inWorker = false, backends }) {
  if (inWorker) useWorkerCanvas();
  const backend = await pickBackend(backends);
  options = new faceapi.TinyFaceDetectorOptions({ inputSize: DETECTOR_INPUT, scoreThreshold: MIN_DETECTION_SCORE });
  // A second start on the page (after a failure) keeps the weights it has
  const nets = [faceapi.nets.tinyFaceDetector, faceapi.nets.faceLandmark68Net, faceapi.nets.faceRecognitionNet];
  await Promise.all(nets.map((net) => (net.isLoaded ? null : net.loadFromUri(MODELS_URL))));
  await warmUp(backend);
  return { backend };
}

// How far the head is turned: where the nose sits between the two sides of the
// jaw, 0.5 when facing the camera. A flat picture hardly changes this when
// moved, which is what makes turning the head a check for a real person.
const headTurn = (landmarks) => {
  const points = landmarks.positions;
  const [left, right, nose] = [points[0], points[16], points[30]];
  return (nose.x - left.x) / (right.x - left.x);
};

// Looks at one frame: how many faces, how large and turned the single face is
// and its 128-number print (Float32Array), but only when the face is at least
// printWhen.minSize and its turn is inside one of printWhen.turns ([low, high]
// pairs): a print takes about as long as everything else, and only frames
// that can move the check forward need one. Every step reads the same
// canvas, so the box, landmarks and print all come from one moment.
export async function readFaceFrom(canvas, printWhen) {
  const faces = await faceapi.detectAllFaces(canvas, options).withFaceLandmarks();
  if (faces.length !== 1) return { count: faces.length };
  const [face] = faces;
  const size = face.detection.box.width / canvas.width;
  const turn = headTurn(face.landmarks);
  let print = null;
  if (printWhen && size >= printWhen.minSize && printWhen.turns.some(([low, high]) => turn >= low && turn <= high)) {
    // Exactly the steps of face-api's withFaceDescriptors() for this face
    const [crop] = await faceapi.extractFaces(canvas, [face.landmarks.align(null, { useDlibAlignment: true })]);
    print = await faceapi.nets.faceRecognitionNet.computeFaceDescriptor(crop);
  }
  return { count: 1, size, turn, print };
}
