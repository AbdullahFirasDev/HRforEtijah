// Face detection and face prints, computed entirely in the browser: no image
// leaves the device. The library and its models are large, so they load only
// when a face check starts.

const MODELS_URL = '/models';
const DETECTOR_INPUT = 320;
const MIN_DETECTION_SCORE = 0.5;

const detectorOptions = (faceapi) =>
  new faceapi.TinyFaceDetectorOptions({ inputSize: DETECTOR_INPUT, scoreThreshold: MIN_DETECTION_SCORE });

let engine = null;

export const loadFaceEngine = () => {
  if (!engine) {
    engine = (async () => {
      const faceapi = await import('@vladmandic/face-api');
      await faceapi.tf.ready();
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODELS_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_URL),
      ]);
      // The very first run prepares the models for the device and can take
      // many seconds: do it now, while the "preparing" message is showing
      const blank = document.createElement('canvas');
      blank.width = blank.height = 150;
      await faceapi.nets.tinyFaceDetector.locateFaces(blank, detectorOptions(faceapi));
      await faceapi.nets.faceLandmark68Net.detectLandmarks(blank);
      await faceapi.nets.faceRecognitionNet.computeFaceDescriptor(blank);
      return faceapi;
    })().catch((err) => {
      engine = null; // let the next attempt retry the download
      throw err;
    });
  }
  return engine;
};

// How far the head is turned: where the nose sits between the two sides of the
// jaw, 0.5 when facing the camera. A flat picture hardly changes this when
// moved, which is what makes turning the head a check for a real person.
const headTurn = (landmarks) => {
  const points = landmarks.positions;
  const [left, right, nose] = [points[0], points[16], points[30]];
  return (nose.x - left.x) / (right.x - left.x);
};

// Looks at the current frame: how many faces, how large and turned the single
// face is and, when asked (it is slower), its 128-number print.
export const readFace = async (video, { withPrint = false } = {}) => {
  const faceapi = await loadFaceEngine();
  const found = faceapi.detectAllFaces(video, detectorOptions(faceapi)).withFaceLandmarks();
  const faces = withPrint ? await found.withFaceDescriptors() : await found;
  if (faces.length !== 1) return { count: faces.length };
  const [face] = faces;
  return {
    count: 1,
    size: face.detection.box.width / video.videoWidth,
    turn: headTurn(face.landmarks),
    print: face.descriptor ? Array.from(face.descriptor) : null,
  };
};
