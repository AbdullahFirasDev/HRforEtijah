import { useEffect, useRef, useState } from 'react';
import Alert from './Alert';
import { FaceEngineStalled, openFaceEngine } from '../utils/faceEngine';

const SCAN_TIMEOUT_MS = 40000;
const FIRST_FRAME_TIMEOUT_MS = 10000;
// Frames are analysed 5 to 10 times a second: a pause of half the time the
// last frame took, within these bounds; a slow device simply goes slower
const FRAME_INTERVAL_MS = [100, 200];
// Share of the frame the face must fill for a reliable print
const MIN_FACE_SIZE = 0.2;
// Head position from readFace(): facing the camera, and turned to a side
const FACING = [0.4, 0.6];
const TURNED_LOW = 0.36;
const TURNED_HIGH = 0.64;
// Prints averaged into one, for a steadier result
const SAMPLES = { verify: 3, enroll: 5 };
// Every frame that moves the check on after the first look at the camera
// (the turned head, the prints at the end) must show the same face as that
// first look, so nobody can do the head turn for a photo of someone else.
// This is the library's own same-person limit, looser than the server's 0.5
// match, because a turned face reads a little apart.
const SAME_PERSON_DISTANCE = 0.6;
// Camera settings, best first; later ones for devices that refuse the first
const CAMERA_REQUESTS = [{ facingMode: 'user', width: 640, height: 480 }, { facingMode: 'user' }, true];

const STEP_TEXT = {
  camera: 'جارٍ تشغيل الكاميرا...',
  loading: 'جارٍ تجهيز التحقق من الوجه...',
  center: 'انظر مباشرة إلى الكاميرا',
  back: 'عد بوجهك إلى الأمام وثبّت رأسك',
  done: 'تم التحقق من وجهك',
};

const RETRY = 'ثم اضغط "إعادة المحاولة".';
const ERROR_TEXT = {
  denied: `لم يُسمح باستخدام الكاميرا. اسمح للمتصفح باستخدام الكاميرا من إعدادات الموقع ${RETRY}`,
  missing: 'لم يُعثر على كاميرا في هذا الجهاز. استخدم جهازاً فيه كاميرا أمامية.',
  busy: `الكاميرا مشغولة بتطبيق آخر. أغلق التطبيقات التي تستخدمها ${RETRY}`,
  camera: `تعذر الوصول إلى الكاميرا. اسمح للمتصفح باستخدام الكاميرا ${RETRY}`,
  unsupported: 'هذا المتصفح لا يتيح الكاميرا هنا. افتح التطبيق من رابطه الآمن (https) في متصفح حديث.',
  interrupted: 'توقفت الكاميرا قبل اكتمال التحقق. اضغط "إعادة المحاولة" للمتابعة.',
  noVideo: 'لم تصل صورة من الكاميرا. اضغط "إعادة المحاولة"، وإن تكرر ذلك فأعد تشغيل المتصفح.',
  engine: 'تعذر تشغيل التحقق من الوجه. تأكد من اتصالك بالإنترنت ثم أعد المحاولة.',
  stalled: 'توقف التحقق من الوجه عن الاستجابة. اضغط "إعادة المحاولة"، وإن تكرر ذلك فأعد فتح التطبيق.',
  timeout: 'لم يكتمل التحقق من الوجه في الوقت المحدد. تأكد من الإضاءة ثم أعد المحاولة.',
  wrongWay: `أدرت رأسك إلى الجهة الأخرى. اضغط "إعادة المحاولة" ثم أدر رأسك نحو السهم.`,
  changed: `تغيّر الوجه أثناء التحقق. يجب أن يُكمل الشخص نفسه كل الخطوات أمام الكاميرا. اضغط "إعادة المحاولة".`,
};

const HINT_TEXT = {
  none: 'لا يظهر وجه. تأكد من الإضاءة واجعل وجهك داخل الإطار',
  many: 'يجب أن يظهر وجه واحد فقط أمام الكاميرا',
  far: 'اقترب من الكاميرا قليلاً',
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const cameraErrorKind = (err) => {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'denied';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'missing';
    case 'NotReadableError':
    case 'AbortError':
      return 'busy';
    default:
      return 'camera';
  }
};

// Tries the preferred settings first; a device that can't give them (some
// phones refuse even an "ideal" size) gets the plainer requests after it
const openCamera = async () => {
  let lastError;
  for (const video of CAMERA_REQUESTS) {
    try {
      return await navigator.mediaDevices.getUserMedia({ video, audio: false });
    } catch (err) {
      lastError = err;
      if (['NotAllowedError', 'SecurityError', 'NotFoundError'].includes(err?.name)) break;
    }
  }
  throw lastError;
};

const firstFrame = (video) =>
  new Promise((resolve, reject) => {
    if (video.readyState >= 2 && video.videoWidth) {
      resolve();
      return;
    }
    const done = (ok) => {
      clearTimeout(timer);
      video.removeEventListener('loadeddata', onFrame);
      video.removeEventListener('resize', onFrame);
      if (ok) resolve();
      else reject(new Error('no frames'));
    };
    const onFrame = () => video.videoWidth && done(true);
    const timer = setTimeout(() => done(false), FIRST_FRAME_TIMEOUT_MS);
    video.addEventListener('loadeddata', onFrame);
    video.addEventListener('resize', onFrame);
  });

const printDistance = (a, b) => {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
};

const averagePrint = (prints) =>
  Array.from({ length: prints[0].length }, (_, i) => prints.reduce((sum, p) => sum + p[i], 0) / prints.length);

// Checks that a real person is in front of the camera (they turn their head
// to a random side), then reads their face print. Only the print is passed
// on: no frame is saved or sent, and the camera turns off as soon as the
// check ends, whatever the outcome.
export default function FaceCapture({ purpose = 'verify', onCapture, onCancel }) {
  const videoRef = useRef(null);
  const boxRef = useRef(null);
  const [view, setView] = useState({ step: 'camera', side: 'right', hint: '', error: '' });
  const [attempt, setAttempt] = useState(0);

  // On a phone the card sits below the fold, and the employee has to see the
  // instructions while looking at the camera
  useEffect(() => {
    boxRef.current?.scrollIntoView({ block: 'center' });
  }, []);

  useEffect(() => {
    let stopped = false;
    let stream = null;
    let engine = null;
    const video = videoRef.current;

    // Renders only when something on screen actually changes
    const show = (next) =>
      setView((prev) => (Object.keys(next).every((key) => prev[key] === next[key]) ? prev : { ...prev, ...next }));

    const stopCamera = () => {
      stream?.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });
      stream = null;
      video.srcObject = null;
    };

    const end = () => {
      stopped = true;
      stopCamera();
      engine?.release();
      engine = null;
      document.removeEventListener('visibilitychange', onHidden);
    };

    const fail = (kind) => {
      if (stopped) return;
      end();
      show({ error: ERROR_TEXT[kind], hint: '' });
    };

    // A phone that leaves the app mid-check: stop rather than film in the background
    function onHidden() {
      if (document.visibilityState === 'hidden') fail('interrupted');
    }

    const engineReady = openFaceEngine().then((ready) => {
      if (stopped) {
        ready.release();
        return null;
      }
      engine = ready;
      return ready;
    });
    engineReady.catch(() => {});

    const scan = async () => {
      // The employee's right is the left of the camera's unflipped image
      const turnSide = Math.random() < 0.5 ? 'right' : 'left';
      const turnedEnough = (turn) => (turnSide === 'right' ? turn <= TURNED_LOW : turn >= TURNED_HIGH);
      const turnedAway = (turn) => (turnSide === 'right' ? turn >= TURNED_HIGH : turn <= TURNED_LOW);
      const facing = (turn) => turn >= FACING[0] && turn <= FACING[1];
      // The frames that can move the check on (or fail it) get a print, and
      // every print is compared with the first one: a face looking at the
      // camera, and in the turn stage a head turned past either limit
      const printWhen = {
        center: { minSize: MIN_FACE_SIZE, turns: [FACING] },
        turn: { minSize: MIN_FACE_SIZE, turns: [[-1, TURNED_LOW], [TURNED_HIGH, 2]] },
        back: { minSize: MIN_FACE_SIZE, turns: [FACING] },
      };
      const deadline = Date.now() + SCAN_TIMEOUT_MS;
      const prints = [];
      let first = null; // print of the face that looked at the camera before turning
      let stage = 'center';
      show({ step: stage, side: turnSide });

      while (!stopped) {
        if (Date.now() > deadline) return fail('timeout');
        const started = performance.now();
        let face;
        try {
          face = await engine.read(video, printWhen[stage]);
        } catch (err) {
          return fail(err instanceof FaceEngineStalled ? 'stalled' : 'engine');
        }
        if (stopped) return undefined; // cancelled while the frame was analysed

        if (face.count !== 1) {
          // Losing the face restarts the check, so nobody can pass the head
          // turn and then hold up someone else's picture
          stage = 'center';
          prints.length = 0;
          first = null;
          show({ step: stage, hint: face.count ? HINT_TEXT.many : HINT_TEXT.none });
        } else if (face.size < MIN_FACE_SIZE) {
          show({ hint: HINT_TEXT.far });
        } else {
          show({ hint: '' });
          if (face.print && first && printDistance(face.print, first) >= SAME_PERSON_DISTANCE) return fail('changed');
          if (stage === 'center' && facing(face.turn) && face.print) {
            first = face.print;
            stage = 'turn';
            show({ step: stage });
          } else if (stage === 'turn') {
            // A recording that turns both ways fails here half of the time
            if (turnedAway(face.turn)) return fail('wrongWay');
            if (turnedEnough(face.turn) && face.print) {
              stage = 'back';
              show({ step: stage });
            }
          } else if (stage === 'back' && facing(face.turn) && face.print) {
            prints.push(face.print);
            if (prints.length >= SAMPLES[purpose]) {
              const print = averagePrint(prints);
              end();
              show({ step: 'done' });
              onCapture(print);
              return undefined;
            }
          }
        }
        const spent = performance.now() - started;
        const interval = Math.min(FRAME_INTERVAL_MS[1], Math.max(FRAME_INTERVAL_MS[0], spent * 1.5));
        await wait(interval - Math.min(spent, interval));
      }
      return undefined;
    };

    const start = async () => {
      show({ step: 'camera', hint: '', error: '' });
      document.addEventListener('visibilitychange', onHidden);
      if (!navigator.mediaDevices?.getUserMedia) return fail('unsupported');
      try {
        stream = await openCamera();
      } catch (err) {
        return fail(cameraErrorKind(err));
      }
      if (stopped) return stopCamera();
      stream.getVideoTracks().forEach((track) => {
        track.onended = () => fail('interrupted');
      });
      video.srcObject = stream;
      video.play().catch(() => {});
      try {
        await firstFrame(video);
      } catch {
        return fail('noVideo');
      }
      if (stopped) return undefined;
      if (!engine) show({ step: 'loading' }); // the models are still starting
      try {
        if (!(await engineReady)) return undefined;
      } catch {
        return fail('engine');
      }
      if (stopped) return undefined;
      return scan();
    };

    start();
    return end;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, purpose]);

  const { step, side, hint, error } = view;
  const stepText = step === 'turn' ? `أدر رأسك قليلاً نحو ${side === 'right' ? 'اليمين' : 'اليسار'}` : STEP_TEXT[step];

  return (
    <div ref={boxRef}>
      <div className={`camera-box camera-live${error ? ' is-off' : ''}`}>
        <video ref={videoRef} autoPlay playsInline muted aria-label="معاينة الكاميرا" />
        <div className="face-guide" aria-hidden="true" />
        {step === 'turn' && (
          <span className={`face-arrow is-${side}`} aria-hidden="true">
            {side === 'right' ? '→' : '←'}
          </span>
        )}
      </div>
      {!error && (
        <p className="face-step" role="status">
          {stepText}
        </p>
      )}
      {!error && hint && <p className="face-hint">{hint}</p>}
      {error && (
        <div style={{ marginTop: 'var(--space-3)' }}>
          <Alert type="warning">{error}</Alert>
        </div>
      )}
      <div className="camera-controls">
        {error && (
          <button type="button" className="btn" onClick={() => setAttempt((n) => n + 1)}>
            إعادة المحاولة
          </button>
        )}
        <button type="button" className="btn secondary" onClick={onCancel}>
          إلغاء
        </button>
      </div>
    </div>
  );
}
