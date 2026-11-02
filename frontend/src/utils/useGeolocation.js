import { useState } from 'react';

const GEO_ERRORS = {
  1: 'تم رفض إذن الموقع. اسمح للمتصفح بالوصول إلى موقعك ثم حاول مرة أخرى.',
  2: 'تعذر تحديد موقعك حالياً. تأكد من تشغيل خدمة الموقع ثم حاول مرة أخرى.',
  3: 'انتهت مهلة تحديد الموقع. حاول مرة أخرى.',
};

// On-demand geolocation fetch (rather than watching continuously) so we grab
// a fresh, accurate reading at the exact moment of punch in/out.
// Rejects with an Error whose message is ready to show to the user.
export default function useGeolocation() {
  const [location, setLocation] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchLocation = () =>
    new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        const msg = 'هذا المتصفح لا يدعم تحديد الموقع.';
        setError(msg);
        reject(new Error(msg));
        return;
      }
      setLoading(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
          setLocation(loc);
          setLoading(false);
          resolve(loc);
        },
        (err) => {
          const msg = GEO_ERRORS[err.code] || 'تعذر تحديد موقعك. اسمح بالوصول إلى الموقع ثم حاول مرة أخرى.';
          setError(msg);
          setLoading(false);
          reject(new Error(msg));
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });

  return { location, error, loading, fetchLocation };
}
