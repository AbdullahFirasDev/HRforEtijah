import { useEffect, useRef, useState } from 'react';
import Alert from './Alert';

// Captures a live selfie straight from the device camera using
// getUserMedia + a canvas snapshot. There is deliberately no <input type="file">
// anywhere in this component, satisfying the "no file upload" requirement.
export default function CameraCapture({ onCapture, capturedImage, onRetake }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (capturedImage) return; // don't open camera if we already have a shot
    startCamera();
    return stopCamera;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturedImage]);

  const startCamera = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 480, height: 360 },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setReady(true);
      }
    } catch (err) {
      setError('تعذر الوصول إلى الكاميرا. اسمح للمتصفح باستخدام الكاميرا ثم اضغط "إعادة المحاولة".');
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setReady(false);
  };

  const handleCapture = () => {
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 480;
    canvas.height = video.videoHeight || 360;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
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
      <div className="camera-box">
        <video ref={videoRef} autoPlay playsInline muted />
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
