// Web Worker that runs the face models off the page's main thread, so the
// camera preview and buttons stay responsive while a frame is analysed.
// Frames arrive as ImageBitmaps of the page's frame canvas and are closed as
// soon as they are drawn here; nothing is kept between frames except one
// reused canvas.
import { prepareFaceModels, readFaceFrom } from './faceCore';

let canvas = null;
let context = null;

const drawFrame = (bitmap) => {
  if (!canvas) canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
  }
  // Same CPU-backed 2D canvas face-api makes on the page, so the pixels match
  context ??= canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas;
};

const handle = async (data) => {
  const { id, type } = data;
  try {
    if (type === 'init') {
      const info = await prepareFaceModels({ inWorker: true, backends: data.backends });
      self.postMessage({ id, ok: true, ...info });
    } else if (type === 'read') {
      const face = await readFaceFrom(drawFrame(data.bitmap), data.printWhen);
      // A copy with its own buffer, handed over rather than cloned
      const print = face.print ? new Float32Array(face.print) : null;
      self.postMessage({ id, ok: true, face: { ...face, print } }, print ? [print.buffer] : []);
    }
  } catch (err) {
    data.bitmap?.close?.();
    // Only the error text: never frame or print data
    self.postMessage({ id, ok: false, error: String(err?.message || err).slice(0, 200) });
  }
};

// Strictly one message at a time: frames share the canvas above
let queue = Promise.resolve();
self.onmessage = ({ data }) => {
  queue = queue.then(() => handle(data));
};
