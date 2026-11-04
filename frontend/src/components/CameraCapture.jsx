import { useEffect, useRef, useState } from 'react';
import Alert from './Alert';

// If the camera gives no frame to draw by then, show the video element itself
const FIRST_FRAME_TIMEOUT_MS = 3000;

// Captures a live selfie straight from the device camera using
// getUserMedia + a canvas snapshot. There is deliberately no <input type="file">
// anywhere in this component, satisfying the "no file upload" requirement.
// Some phone browsers mirror the front camera in a <video> element but not in
// what is drawn from it, so the preview is that same canvas: what the employee
// sees is exactly the photo that gets saved.
export default function CameraCapture({ onCapture, capturedImage, onRetake }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const frameRef = useRef(null);
  const fallbackTimerRef = useRef(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [showVideo, setShowVideo] = useState(false);

  useEffect(() => {
    if (capturedImage) return; // don't open camera if we already have a shot
    startCamera();
    return stopCamera;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturedImage]);

  const drawFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video && canvas && video.readyState >= 2 && video.videoWidth) {
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      clearTimeout(fallbackTimerRef.current);
      setReady(true);
    }
    frameRef.current = requestAnimationFrame(drawFrame);
  };

  const startCamera = async () => {
    setError('');
    setShowVideo(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 480, height: 360 },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
        frameRef.current = requestAnimationFrame(drawFrame);
        fallbackTimerRef.current = setTimeout(() => {
          setShowVideo(true);
          setReady(true);
        }, FIRST_FRAME_TIMEOUT_MS);
      }
    } catch (err) {
      setError('تعذر الوصول إلى الكاميرا. اسمح للمتصفح باستخدام الكاميرا ثم اضغط "إعادة المحاولة".');
    }
  };

  const stopCamera = () => {
    cancelAnimationFrame(frameRef.current);
    clearTimeout(fallbackTimerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setReady(false);
  };

  const handleCapture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    // The preview already holds the latest frame; the video only as a fallback
    if (showVideo) {
      canvas.width = video.videoWidth || 480;
      canvas.height = video.videoHeight || 360;
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    }
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    stopCamera();
    onCapture(dataUrl);
  };

  const handleRetake = () => {
    onRetake();
  };

  if (capturedImage) {
    return (
      <div className="camera-box">
        <img src={capturedImage} alt="الصورة الملتقطة" />
        <div className="camera-actions">
          <button type="button" className="btn secondary" onClick={handleRetake}>
            إعادة الالتقاط
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className={`camera-box camera-live${showVideo ? ' show-video' : ''}`}>
        <video ref={videoRef} autoPlay playsInline muted />
        <canvas ref={canvasRef} role="img" aria-label="معاينة الكاميرا" />
      </div>
      {error && (
        <div style={{ marginTop: 'var(--space-3)' }}>
          <Alert type="warning">{error}</Alert>
        </div>
      )}
      <div className="camera-controls">
        <button type="button" className="btn" disabled={!ready} onClick={handleCapture}>
          التقاط الصورة
        </button>
        {error && (
          <button type="button" className="btn secondary" onClick={startCamera}>
            إعادة المحاولة
          </button>
        )}
      </div>
    </div>
  );
}
