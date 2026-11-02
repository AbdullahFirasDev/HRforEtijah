import { useEffect, useState } from 'react';
import { useGetGeofenceQuery, useUpdateGeofenceMutation } from '../features/api/settingsApi';
import PageHeader from '../components/PageHeader';
import Field from '../components/Field';
import Alert from '../components/Alert';
import Loading from '../components/Loading';
import useGeolocation from '../utils/useGeolocation';
import { formatDateTime, formatDistance } from '../utils/format';
import { coordsInput, distanceMeters, googleMapsUrl, mapEmbedUrl, parseCoords } from '../utils/geo';
import { hasErrors, validateGeofenceForm } from '../utils/validation';

const formFrom = (fence) => ({
  enabled: !!fence.enabled,
  location: fence.lat != null && fence.lng != null ? coordsInput(fence) : '',
  radius: String(fence.radius),
  maxAccuracy: String(fence.maxAccuracy),
});

// Admin page for the office geofence: where the office is, how far from it
// staff may check in and out, and whether that is enforced at all.
export default function GeofenceSettings() {
  const { data, isLoading, isError } = useGetGeofenceQuery();
  const [save, { isLoading: saving }] = useUpdateGeofenceMutation();
  const { fetchLocation } = useGeolocation();

  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [feedback, setFeedback] = useState(null);
  const [locating, setLocating] = useState(null); // 'set' | 'measure'
  const [reading, setReading] = useState(null);

  const saved = data?.geofence;
  useEffect(() => {
    if (saved && !form) setForm(formFrom(saved));
  }, [saved, form]);

  if (isError) return <Alert type="error">تعذر تحميل إعدادات النطاق الجغرافي. حدّث الصفحة وحاول مرة أخرى.</Alert>;
  if (isLoading || !form) return <Loading />;

  const coords = parseCoords(form.location);
  const radius = Number(form.radius) || saved.radius;

  const update = (patch) => {
    setForm((f) => ({ ...f, ...patch }));
    setErrors((prev) => ({ ...prev, ...Object.fromEntries(Object.keys(patch).map((k) => [k, undefined])) }));
    setFeedback(null);
  };

  const locate = async (mode) => {
    setLocating(mode);
    setReading(null);
    setFeedback(null);
    try {
      const here = await fetchLocation();
      const accuracy = Math.round(here.accuracy);
      if (mode === 'set') {
        update({ location: coordsInput(here) });
        setReading(
          accuracy > 100
            ? {
                type: 'warning',
                text: `حُدّد موقعك بدقة ± ${formatDistance(accuracy)} فقط، وهي ضعيفة لتحديد المقر. استخدم الهاتف داخل المقر مع تشغيل GPS، أو الصق الإحداثيات من خرائط Google.`,
              }
            : { type: 'info', text: `وُضع موقعك الحالي مقراً للعمل (الدقة ± ${formatDistance(accuracy)}). احفظ الإعدادات لاعتماده.` }
        );
      } else {
        const distance = distanceMeters(here, coords);
        const inside = distance <= radius;
        setReading({
          type: inside ? 'success' : 'warning',
          text: `أنت الآن على بعد ${formatDistance(distance)} من المقر (الدقة ± ${formatDistance(accuracy)})، أي ${inside ? 'داخل' : 'خارج'} نطاق ${formatDistance(radius)}.`,
        });
      }
    } catch (err) {
      setReading({ type: 'error', text: err.message });
    } finally {
      setLocating(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const found = validateGeofenceForm({ ...form, coords });
    setErrors(found);
    if (hasErrors(found)) return;
    try {
      const res = await save({
        enabled: form.enabled,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        radius: Number(form.radius),
        maxAccuracy: Number(form.maxAccuracy),
      }).unwrap();
      setForm(formFrom(res.geofence));
      setFeedback({
        type: 'success',
        text: res.geofence.enabled
          ? `تم الحفظ. التحقق من الموقع مفعّل الآن ضمن ${formatDistance(res.geofence.radius)} من المقر.`
          : 'تم الحفظ. التحقق من الموقع معطّل، ويُقبل الحضور من أي مكان.',
      });
    } catch (err) {
      setFeedback({ type: 'error', text: err?.data?.message || 'تعذر حفظ الإعدادات. حاول مرة أخرى.' });
    }
  };

  return (
    <div>
      <PageHeader
        title="النطاق الجغرافي للحضور"
        subtitle="حدّد موقع مقر العمل والمسافة المسموح بها لتسجيل الحضور والانصراف."
      />

      {saved.enabled ? (
        <Alert type="success" title="التحقق من الموقع مفعّل">
          يُقبل تسجيل الحضور والانصراف ضمن {formatDistance(saved.radius)} من مقر العمل فقط.
        </Alert>
      ) : (
        <Alert type="warning" title="التحقق من الموقع معطّل">
          يُقبل تسجيل الحضور والانصراف من أي مكان، وتُسجَّل المسافة عن المقر فقط ليراها المدير في صفحة التحقق.
        </Alert>
      )}
      {saved.source === 'env' && (
        <Alert type="info">هذه القيم مأخوذة من إعدادات الخادم. بعد الحفظ هنا تُعتمد إعدادات هذه الصفحة بدلاً منها.</Alert>
      )}

      <div className="card card-narrow">
        <form onSubmit={handleSubmit} noValidate>
          <label className="check-row" htmlFor="geo-enabled">
            <input
              id="geo-enabled"
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => update({ enabled: e.target.checked })}
            />
            <span>
              <strong>تفعيل التحقق من الموقع</strong>
              <small>يُرفض تسجيل الحضور والانصراف من خارج النطاق، ومن قراءات الموقع غير الدقيقة.</small>
            </span>
          </label>

          <Field
            id="geo-location"
            label="موقع مقر العمل"
            required={form.enabled}
            hint="الصق الإحداثيات أو رابط الموقع من خرائط Google، أو قف داخل المقر واضغط «استخدام موقعي الحالي»."
            error={errors.location}
          >
            <input
              id="geo-location"
              dir="ltr"
              inputMode="decimal"
              placeholder="33.315200, 44.366100"
              value={form.location}
              onChange={(e) => update({ location: e.target.value })}
              aria-invalid={!!errors.location}
            />
          </Field>

          <div className="form-actions geo-actions">
            <button type="button" className="btn secondary" disabled={!!locating} onClick={() => locate('set')}>
              {locating === 'set' ? 'جارٍ تحديد موقعك...' : 'استخدام موقعي الحالي'}
            </button>
            {coords && (
              <>
                <button type="button" className="btn secondary" disabled={!!locating} onClick={() => locate('measure')}>
                  {locating === 'measure' ? 'جارٍ القياس...' : 'قياس بُعدي عن المقر'}
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => window.open(googleMapsUrl(coords), '_blank', 'noopener')}
                >
                  فتح في خرائط Google
                </button>
              </>
            )}
          </div>
          {reading && (
            <Alert type={reading.type} onClose={() => setReading(null)}>
              {reading.text}
            </Alert>
          )}

          {coords && (
            <figure className="map-preview">
              <iframe title="موقع مقر العمل على الخريطة" src={mapEmbedUrl(coords, radius)} loading="lazy" />
              <figcaption>العلامة تمثّل مقر العمل، ويُقبل الحضور ضمن {formatDistance(radius)} حولها.</figcaption>
            </figure>
          )}

          <div className="form-row">
            <Field id="geo-radius" label="نطاق الحضور (متر)" required error={errors.radius}>
              <input
                id="geo-radius"
                type="number"
                dir="ltr"
                min="20"
                max="20000"
                step="10"
                inputMode="numeric"
                value={form.radius}
                onChange={(e) => update({ radius: e.target.value })}
                aria-invalid={!!errors.radius}
              />
            </Field>
            <Field id="geo-accuracy" label="هامش الدقة المقبول (متر)" required error={errors.maxAccuracy}>
              <input
                id="geo-accuracy"
                type="number"
                dir="ltr"
                min="10"
                max="5000"
                step="10"
                inputMode="numeric"
                value={form.maxAccuracy}
                onChange={(e) => update({ maxAccuracy: e.target.value })}
                aria-invalid={!!errors.maxAccuracy}
              />
            </Field>
          </div>
          <p className="field-hint form-row-hint">
            النطاق هو المسافة المسموح بها حول المقر، و100 إلى 300 م تناسب مبنى واحداً. وتُرفض قراءات الموقع الأقل دقة من
            الهامش، مثل تحديد الموقع عبر الإنترنت على حاسوب بلا GPS. القيمة المقترحة للهامش 200 م.
          </p>

          {feedback && <Alert type={feedback.type}>{feedback.text}</Alert>}
          <button type="submit" className="btn" disabled={saving}>
            {saving ? 'جارٍ الحفظ...' : 'حفظ الإعدادات'}
          </button>
          {saved.source === 'settings' && (
            <p className="form-note">
              آخر تعديل: {formatDateTime(saved.updatedAt)}
              {saved.updatedBy ? ` بواسطة ${saved.updatedBy}` : ''}.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
