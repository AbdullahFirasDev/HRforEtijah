import { useState, useSyncExternalStore } from 'react';
import { getInstallPrompt, isIos, isStandalone, promptInstall, subscribeInstall } from '../utils/installPrompt';
import { IconShare } from './icons';

const DISMISS_KEY = 'installBannerDismissed';

const readDismissed = () => {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
};

// Invites employees to install the app: an install button where the browser
// supports it, Share-menu steps on iPhone. Hidden once installed or dismissed
// (the profile menu still offers "تثبيت التطبيق" after dismissing).
export default function InstallBanner() {
  const canPrompt = !!useSyncExternalStore(subscribeInstall, getInstallPrompt);
  const [dismissed, setDismissed] = useState(readDismissed);

  if (dismissed || isStandalone() || (!canPrompt && !isIos())) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // private mode: just hide it for this visit
    }
    setDismissed(true);
  };

  return (
    <div className="install-banner" role="region" aria-label="تثبيت التطبيق">
      <img src="/pwa-192x192.png" alt="" width="48" height="48" />
      <div className="install-banner-text">
        <strong>ثبّت تطبيق الاتجاه على جهازك</strong>
        {canPrompt ? (
          <span>يُفتح من الشاشة الرئيسية مثل أي تطبيق، دون الحاجة إلى متجر التطبيقات.</span>
        ) : (
          <span>
            اضغط زر المشاركة <IconShare size={15} className="inline-icon" aria-hidden="true" /> في Safari، ثم اختر
            «إضافة إلى الشاشة الرئيسية».
          </span>
        )}
      </div>
      <div className="install-banner-actions">
        {canPrompt && (
          <button type="button" className="btn btn-sm" onClick={promptInstall}>
            تثبيت
          </button>
        )}
        <button type="button" className="btn secondary btn-sm" onClick={dismiss}>
          لاحقاً
        </button>
      </div>
    </div>
  );
}
