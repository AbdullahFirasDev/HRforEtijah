import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { selectCurrentUser } from '../features/auth/authSlice';
import {
  useDeletePushSubscriptionMutation,
  useGetNotificationSettingsQuery,
  useSavePushSubscriptionMutation,
  useSendTestPushMutation,
  useUpdateNotificationSettingsMutation,
} from '../features/api/notificationApi';
import { NOTIFICATION_CATEGORIES } from '../utils/labels';
import { formatDateLong } from '../utils/format';
import { currentDeviceKey, disablePush, enablePush, pushOptedIn, pushPermission, pushSupport } from '../utils/push';
import Alert from './Alert';
import Loading from './Loading';

// Why device notifications can't be turned on, in plain words
const PUSH_PROBLEMS = {
  'not-configured': 'إشعارات الجهاز غير مفعّلة على الخادم بعد، فتصلك الإشعارات داخل التطبيق فقط.',
  insecure:
    'إشعارات الجهاز تعمل فقط عند فتح النظام عبر رابط آمن يبدأ بـ https. عبر عنوان الشبكة المحلية دون https تصلك الإشعارات داخل التطبيق فقط.',
  'ios-install':
    'على iPhone وiPad تعمل إشعارات الجهاز بعد إضافة التطبيق إلى الشاشة الرئيسية (iOS 16.4 أو أحدث): من Safari اضغط «مشاركة» ثم «إضافة إلى الشاشة الرئيسية»، وافتح التطبيق من أيقونته ثم فعّلها من هنا.',
  unsupported: 'هذا المتصفح لا يدعم إشعارات الجهاز. تصلك الإشعارات داخل التطبيق.',
  denied:
    'الإشعارات ممنوعة لهذا الموقع في إعدادات المتصفح. اسمح بها من إعدادات الموقع (رمز القفل بجانب العنوان) ثم حاول مرة أخرى.',
  dismissed: 'لم تُمنح الموافقة على الإشعارات. اضغط «تفعيل إشعارات الجهاز» مرة أخرى واختر «سماح».',
  'no-sw': 'تعذر تجهيز التطبيق لاستقبال الإشعارات على هذا الجهاز. حدّث الصفحة ثم حاول مرة أخرى.',
  'update-needed': 'يلزم تحديث التطبيق أولاً: اضغط «تحديث الآن» أسفل الشاشة (أو أعد فتح التطبيق)، ثم فعّل الإشعارات.',
};

const errorText = (err) =>
  PUSH_PROBLEMS[err?.reason] || err?.data?.message || 'تعذر تفعيل إشعارات الجهاز. حاول مرة أخرى بعد قليل.';

function PushDevice({ push, devices }) {
  const user = useSelector(selectCurrentUser);
  const [savePush] = useSavePushSubscriptionMutation();
  const [removePush] = useDeletePushSubscriptionMutation();
  const [sendTest, { isLoading: testing }] = useSendTestPushMutation();
  // This browser's fingerprint (undefined while checking, null: not subscribed)
  const [thisKey, setThisKey] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const deviceKeys = devices.map((d) => d.key).join();
  useEffect(() => {
    let live = true;
    currentDeviceKey().then((key) => live && setThisKey(key));
    return () => {
      live = false;
    };
  }, [deviceKeys]);

  const support = pushSupport();
  const permission = pushPermission();
  // On only if the server still has this browser (it drops ones that fail)
  const on = !!thisKey && devices.some((d) => d.key === thisKey) && pushOptedIn(user.id) && permission === 'granted';
  const problem = !push.configured ? 'not-configured' : support !== 'supported' ? support : permission === 'denied' ? 'denied' : null;

  const turnOn = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await enablePush({ userId: user.id, publicKey: push.publicKey, save: savePush });
      setThisKey(await currentDeviceKey());
      setNotice({ type: 'success', text: 'فُعّلت إشعارات الجهاز. ستصلك حتى عندما يكون التطبيق مغلقاً.' });
    } catch (err) {
      setNotice({ type: err?.reason === 'dismissed' ? 'warning' : 'error', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    setNotice(null);
    await disablePush({ userId: user.id, remove: removePush });
    setThisKey(null);
    setBusy(false);
    setNotice({ type: 'info', text: 'أُوقفت إشعارات الجهاز على هذا الجهاز. ستبقى الإشعارات داخل التطبيق.' });
  };

  const test = async () => {
    setNotice(null);
    try {
      const result = await sendTest().unwrap();
      setNotice(
        result.sent
          ? { type: 'success', text: 'أُرسل إشعار تجريبي. إن لم يظهر خلال دقيقة فتحقق من إعدادات الإشعارات في جهازك.' }
          : { type: 'warning', text: 'تعذر الوصول إلى جهازك الآن. تأكد من اتصاله بالإنترنت ثم حاول مرة أخرى.' }
      );
    } catch (err) {
      setNotice({ type: 'error', text: err?.data?.message || 'تعذر إرسال الإشعار التجريبي.' });
    }
  };

  return (
    <section className="notif-settings-section" aria-labelledby="push-device-title">
      <h3 id="push-device-title">إشعارات الجهاز</h3>
      <p className="form-note">
        تظهر على شاشة الجهاز حتى عندما يكون التطبيق في الخلفية أو مغلقاً، ولا تعرض أسماء أو أوقاتاً أو قرارات: التفاصيل تراها
        داخل التطبيق فقط.
      </p>
      {problem ? (
        <Alert type={problem === 'denied' ? 'warning' : 'info'}>{PUSH_PROBLEMS[problem]}</Alert>
      ) : thisKey === undefined ? (
        <Loading />
      ) : on ? (
        <div className="notif-device-actions">
          <span className="badge success">مفعّلة على هذا الجهاز</span>
          <button type="button" className="btn secondary btn-sm" onClick={test} disabled={testing || busy}>
            {testing ? 'جارٍ الإرسال...' : 'إرسال إشعار تجريبي'}
          </button>
          <button type="button" className="btn secondary btn-sm" onClick={turnOff} disabled={busy}>
            إيقاف على هذا الجهاز
          </button>
        </div>
      ) : (
        <div className="notif-device-actions">
          <button type="button" className="btn" onClick={turnOn} disabled={busy}>
            {busy ? 'جارٍ التفعيل...' : 'تفعيل إشعارات الجهاز'}
          </button>
        </div>
      )}
      {notice && <Alert type={notice.type}>{notice.text}</Alert>}

      {devices.length > 0 && (
        <div className="notif-devices">
          <strong>الأجهزة التي تصلها إشعاراتك</strong>
          <ul>
            {devices.map((d) => {
              const current = d.key === thisKey;
              return (
                <li key={d.id}>
                  <span>
                    {d.label || 'متصفح'}
                    {current && <span className="notif-this-device"> · هذا الجهاز</span>}
                    <small>منذ {formatDateLong(d.since)}</small>
                  </span>
                  <button
                    type="button"
                    className="link-button"
                    disabled={busy}
                    onClick={current ? turnOff : () => removePush({ id: d.id })}
                  >
                    إزالة
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

// What the person wants to hear about, in the app and on their devices
export default function NotificationSettings() {
  const { data, isLoading, isError } = useGetNotificationSettingsQuery();
  const [save, { isLoading: saving }] = useUpdateNotificationSettingsMutation();
  const [error, setError] = useState(null);

  if (isLoading) return <Loading />;
  if (isError || !data?.enabled) return null;

  const change = async (category, field, value) => {
    setError(null);
    const next = { ...category, [field]: value };
    // Nothing in the app means nothing on the device either
    if (field === 'inApp' && !value) next.push = false;
    if (field === 'inApp' && value) next.push = true;
    try {
      await save([next]).unwrap();
    } catch (err) {
      setError(err?.data?.message || 'تعذر حفظ الإعداد. حاول مرة أخرى.');
    }
  };

  return (
    <div className="card">
      <h2 className="card-title">إعدادات الإشعارات</h2>
      <PushDevice push={data.push} devices={data.devices || []} />

      <section className="notif-settings-section" aria-labelledby="notif-kinds-title">
        <h3 id="notif-kinds-title">أنواع الإشعارات</h3>
        <Alert type="error">{error}</Alert>
        <ul className="notif-kinds">
          {data.categories.map((c) => {
            const info = NOTIFICATION_CATEGORIES[c.id] || { label: c.id };
            return (
              <li key={c.id}>
                <span className="notif-kind-text">
                  <strong>{info.label}</strong>
                  {info.hint && <small>{info.hint}</small>}
                </span>
                <span className="notif-kind-toggles">
                  <label>
                    <input type="checkbox" checked={c.inApp} disabled={saving} onChange={(e) => change(c, 'inApp', e.target.checked)} />
                    داخل التطبيق
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={c.inApp && c.push}
                      disabled={saving || !c.inApp || !data.push.configured}
                      onChange={(e) => change(c, 'push', e.target.checked)}
                    />
                    على الجهاز
                  </label>
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
