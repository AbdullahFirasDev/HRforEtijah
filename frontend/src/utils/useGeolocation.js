import { useState } from 'react';

// On-demand geolocation fetch (rather than watching continuously) so we grab
// a fresh, accurate reading at the exact moment of punch in/out.
export default function useGeolocation() {
  const [location, setLocation] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchLocation = () =>
    new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        const msg = 'Geolocation is not supported by this browser';
        setError(msg);
        reject(new Error(msg));
        return;
      }
      setLoading(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setLocation(loc);
          setLoading(false);
          resolve(loc);
        },
        (err) => {
          setError('Unable to fetch location. Please allow location access.');
          setLoading(false);
          reject(err);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });

  return { location, error, loading, fetchLocation };
}
