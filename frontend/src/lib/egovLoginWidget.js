// "Login as eGov" widget loader.
//
// eGov SSO was designed for in-app use: eGovPH opens the service with ?exchange_code=... already
// appended, so the citizen arrives authenticated. Outside the super app there is no such link, and
// the only way in used to be pasting a hand-generated code onto the URL — which is not a sign-in
// flow anyone can ship.
//
// The widget is eGovPH's own answer to that. It renders the citizen's mobile/email -> OTP -> eGov
// PIN screens against our gateway using ONLY partner_code, then hands back an exchange_code. From
// there the flow rejoins the documented path: the backend redeems it with partner_secret at
// POST /api/token and pulls the profile. No secret and no access token ever reaches this file.
//
// The widget drops its own test-accounts panel after the first step; this puts one back for the
// OTP and PIN screens. See that module for why it has to be done from outside the widget.
import { keepTestAccountsVisible } from './egovTestAccounts.js';

// Version is pinned in the URL per the integration guide — an unpinned widget is a third-party
// script that can change shape under a running deployment.
const WIDGET_SRC = 'https://widgets.e.gov.ph/v1.0.0/egov-login.min.js';

let loadPromise = null;

function loadScript() {
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    if (window.EgovLogin) { resolve(); return; }
    const script = document.createElement('script');
    script.src = WIDGET_SRC;
    script.async = true;
    script.onload = () => (window.EgovLogin
      ? resolve()
      : reject(new Error('The eGovPH sign-in widget loaded but window.EgovLogin is missing')));
    script.onerror = () => {
      // A failed load must not be cached as a permanent failure: the citizen may just be on a bad
      // connection, and retrying is the whole point of the retry button on the sign-in screen.
      loadPromise = null;
      reject(new Error('Could not load the eGovPH sign-in widget'));
    };
    document.body.appendChild(script);
  });
  return loadPromise;
}

/**
 * Mounts the widget into `target` (an element or selector).
 *
 * Returns a cleanup function. React StrictMode mounts effects twice in development, and the widget
 * writes directly into the DOM node it is given, so without this the second mount stacks a second
 * set of OTP fields on top of the first.
 */
export async function mountEgovLogin({
  target, partnerCode, host, partnerName,
  theme, size, locale, identifierTypes, showTestAccounts, testAccountsCopy,
  onSuccess, onError, onCancel,
}) {
  if (!partnerCode) throw new Error('eGovPH partner code is not configured');
  if (!host) throw new Error('eGovPH gateway host is not configured');
  await loadScript();

  const instance = window.EgovLogin.render({
    target,
    partnerCode,
    host,
    partnerName,
    // Every one of these has a widget-side default, so they are forwarded only when set. They also
    // have to be named explicitly: the widget reads its options off a plain object, so anything not
    // listed in this signature is dropped on the floor without a warning.
    theme,
    size,
    locale,
    // ['mobile'] | ['email'] | both. With one entry the widget drops its Mobile/Email tab strip
    // entirely, which is the supported way to keep a sandbox-only deployment off the email path.
    identifierTypes,
    showTestAccounts,
    // The widget hands back { exchangeCode }. It is single-use and short-lived, so the caller
    // redeems it immediately rather than parking it the way an arrived-by-link code is parked.
    onSuccess: (payload) => onSuccess?.(payload?.exchangeCode || payload?.exchange_code || null),
    onError: (err) => onError?.(err instanceof Error ? err : new Error(err?.message || 'eGovPH sign-in failed')),
    onCancel: () => onCancel?.(),
  });

  // Only worth running when the widget was told to advertise test accounts in the first place: in
  // a production build showTestAccounts is off and this observer must not exist at all.
  const stopTestAccounts = showTestAccounts && testAccountsCopy
    ? keepTestAccountsVisible(testAccountsCopy)
    : null;

  return () => {
    stopTestAccounts?.();
    // destroy() is the documented teardown, but it is the widget's own method on a third-party
    // script — if a future pinned version drops it, clearing the container is what actually
    // prevents a duplicate mount, so do that regardless of whether destroy() worked.
    try { instance?.destroy?.(); } catch { /* widget teardown is best-effort */ }
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (el) el.innerHTML = '';
  };
}
