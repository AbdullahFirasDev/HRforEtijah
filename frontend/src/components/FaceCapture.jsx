import { useEffect, useRef, useState } from 'react';
import Alert from './Alert';
import { loadFaceEngine, readFace } from '../utils/faceEngine';

const SCAN_TIMEOUT_MS = 40000;
const SCAN_PAUSE_MS = 80;
// Share of the frame the face must fill for a reliable print
const MIN_FACE_SIZE = 0.2;
// Head position from readFace(): facing the camera, and turned to a side
const FACING = [0.4, 0.6];
const TURNED_LOW = 0.36;
const TURNED_HIGH = 0.64;
// Prints averaged into one, for a steadier result
const SAMPLES = { verify: 3, enroll: 5 };

const STEP_TEXT = {
  loading: 'جارٍ تجهيز التحقق من الوجه...',
  center: 'انظر مباشرة إلى الكاميرا',
  back: 'عد بوجهك إلى الأمام وثبّت رأسك',
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const averagePrint = (prints) => prints[0].map((_, i) => prints.reduce((sum, p) => sum + p[i], 0) / prints.length);

// Checks that a real person is in front of the camera (they turn their head
// to a random side), then reads their face print. Only the print is passed
// on: nothing here is saved or sent as an image.
export default function FaceCapture({ purpose = 'verify', onCapture, onCancel }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const boxRef = useRef(null);
  const [step, setStep] = useState('loading');
  const [side, setSide] = useState('right');
  const [hint, setHint] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  // On a phone the card sits below the fold, and the employee has to see the
  // instructions while looking at the camera
  useEffect(() => {
    boxRef.current?.scrollIntoView({ block: 'center' });
  }, []);

  useEffect(() => {
    let stopped = false;
    let stream = null;
    let frame = null;

    // The preview is flipped on screen (see .camera-live canvas) so it moves
    // like a mirror; the frames being read are never flipped.
    const drawFrame = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState >= 2 && video.videoWidth) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      }
      frame = requestAnimationFrame(drawFrame);
    };

    const scan = async (video) => {
      // The employee's right is the left of the camera's unflipped image
      const turnSide = Math.random() < 0.5 ? 'right' : 'left';
      const turnedEnough = (turn) => (turnSide === 'right' ? turn <= TURNED_LOW : turn >= TURNED_HIGH);
      const facing = (turn) => turn >= FACING[0] && turn <= FACING[1];
      const deadline = Date.now() + SCAN_TIMEOUT_MS;
      const prints = [];
      let stage = 'center';
      setSide(turnSide);
      setStep(stage);

      while (!stopped) {
        if (Date.now() > deadline) {
          setError('لم يكتمل التحقق من الوجه في الوقت المحدد. تأكد من الإضاءة ثم أعد المحاولة.');
          return;
        }
        const face = await readFace(video, { withPrint: stage === 'back' });
        if (stopped) return;

        if (face.count !== 1) {
          // Losing the face restarts the check, so nobody can pass the head
          // turn and then hold up someone else's picture
          stage = 'center';
          prints.length = 0;
          setStep(stage);
          setHint(face.count ? 'يجب أن يظهر وجه واحد فقط أمام الكاميرا' : 'لا يظهر وجه. تأكد من الإضاءة واجعل وجهك داخل الإطار');
        } else if (face.size < MIN_FACE_SIZE) {
          setHint('اقترب من الكاميرا قليلاً');
        } else {
          setHint('');
          if (stage === 'center' && facing(face.turn)) {
            stage = 'turn';
            setStep(stage);
          } else if (stage === 'turn' && turnedEnough(face.turn)) {
            stage = 'back';
            setStep(stage);
          } else if (stage === 'back' && facing(face.turn) && face.print) {
            prints.push(face.print);
            if (prints.length >= SAMPLES[purpose]) {
              onCapture(averagePrint(prints));
              return;
            }
          }
        }
        await wait(SCAN_PAUSE_MS);
      }
    };

    const start = async () => {
      setError('');
      setHint('');
      setStep('loading');
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: 640, height: 480 },
          audio: false,
        });
      } catch {
        setError('تعذر الوصول إلى الكاميرا. اسمح للمتصفح باستخدام الكاميرا ثم اضغط "إعادة المحاولة".');
        return;
      }
      if (stopped) return;
      const video = videoRef.current;
      video.srcObject = stream;
      video.play().catch(() => {});
      frame = requestAnimationFrame(drawFrame);
      try {
        await loadFaceEngine();
        while (!stopped && !(video.readyState >= 2 && video.videoWidth)) await wait(SCAN_PAUSE_MS);
        if (!stopped) await scan(video);
      } catch {
        if (!stopped) setError('تعذر تشغيل التحقق من الوجه. تأكد من اتصالك بالإنترنت ثم أعد المحاولة.');
      }
    };

    start();
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, purpose]);

  const stepText = step === 'turn' ? `أدر رأسك قليلاً نحو ${side === 'right' ? 'اليمين' : 'اليسار'}` : STEP_TEXT[step];

  return (
    <div ref={boxRef}>
      <div className="camera-box camera-live">
        <video ref={videoRef} autoPlay playsInline muted />
        <canvas ref={canvasRef} role="img" aria-label="معاينة الكاميرا" />
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
