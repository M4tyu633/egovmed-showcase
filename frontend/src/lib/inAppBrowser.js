// In-app browser detection, for the one thing these browsers reliably break: the camera.
//
// Most citizens reach eGovMed from a link in Messenger, Facebook or Viber, and those apps open it
// in their own embedded webview rather than in Safari or Chrome. On iOS that webview is a
// WKWebView the host app configures, and Meta's does not carry a usable camera grant — the face
// check comes up as Amplify's "Camera is not accessible. Check that a camera is connected and
// there is not another application using the camera." with no permission prompt to accept.
// Nothing we can do inside the page fixes that; the page has to be opened outside the app.
//
// Deliberately UA-sniffing. Feature detection cannot help here: navigator.mediaDevices.getUserMedia
// is present in these webviews and only fails once it is called, which is already too late — by
// then the SDK has taken over the screen and the patient is looking at an error they cannot act on.

// Meta's webviews (FBAN/FBAV/FB_IAB on Facebook and Messenger, Instagram) are the ones that
// actually block the camera. Line and the in-app browsers that follow it are included on the same
// evidence. Chrome's WebView marker (`; wv`) covers Android apps that embed a plain WebView.
const IN_APP_PATTERNS = [
  { re: /FBAN|FBAV|FB_IAB|FB4A|Messenger/i, name: 'Messenger' },
  { re: /Instagram/i, name: 'Instagram' },
  { re: /\bLine\//i, name: 'LINE' },
  { re: /Viber/i, name: 'Viber' },
  { re: /TikTok|musical_ly|BytedanceWebview/i, name: 'TikTok' },
  { re: /Twitter|TwitterAndroid/i, name: 'X' },
  { re: /\bwv\b/i, name: 'an in-app browser' },
];

/**
 * The app whose embedded browser is showing this page, or null when it is a real browser.
 * Returns a display name so the guidance can say "Messenger" rather than "your app".
 */
export function detectInAppBrowser(ua = typeof navigator === 'undefined' ? '' : navigator.userAgent) {
  if (!ua) return null;
  const hit = IN_APP_PATTERNS.find(({ re }) => re.test(ua));
  return hit ? hit.name : null;
}

/**
 * True when the camera is very unlikely to work here. Desktop webviews are not the problem — an
 * Electron-ish UA on a laptop still has a working camera — so this stays scoped to mobile, where
 * the link-from-a-chat-app path lives.
 */
export function cameraLikelyBlocked(ua = typeof navigator === 'undefined' ? '' : navigator.userAgent) {
  return Boolean(detectInAppBrowser(ua)) && /Android|iPhone|iPad|iPod/i.test(ua);
}

/**
 * Puts the app's URL on the clipboard so the patient can paste it into Safari or Chrome.
 * navigator.clipboard is unavailable on insecure origins and in some webviews, hence the
 * execCommand fallback. Resolves false when neither path worked, so the caller can leave the
 * link on screen to be copied by hand instead of claiming a copy that never happened.
 */
export async function copyAppLink(url = window.location.href) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return true;
    }
  } catch {
    // Fall through — a rejected clipboard permission is not a reason to give up on the copy.
  }
  try {
    const field = document.createElement('textarea');
    field.value = url;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(field);
    return ok;
  } catch {
    return false;
  }
}
