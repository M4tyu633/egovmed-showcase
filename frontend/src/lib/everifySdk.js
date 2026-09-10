// eVerify Face Liveness Web SDK loader.
// Per the eVerify portal's "Face Liveness Web SDK Integration Guide": load this script, then call
// window.eKYC().start({ pubKey }) to run an in-browser liveness capture. On success it resolves
// { status: 'COMPLETED', result: { session_id, photo, photo_url } } — session_id is what the
// backend's POST /identity/liveness/everify-sdk registers, then POST /identity/verify consumes.
const SDK_SRC = 'https://hackathon-everify-face-liveness.e.gov.ph/js/everify-liveness-sdk.min.js';

// The SDK injects a full-screen <div> wrapping an <iframe allow="camera"> pointed here, and only
// resolves for postMessage events whose origin matches. Different host than SDK_SRC — both need
// to be allowed by the CSP (script-src for SDK_SRC, frame-src for this one).
const CAPTURE_ORIGIN = 'https://liveness.everify.gov.ph';

// Ceiling on a single capture. The SDK's message listener calls removeEventListener for ANY
// message it receives but only resolves for ones from CAPTURE_ORIGIN — so one stray postMessage
// (a browser extension, an embedded widget) tears the listener down and its promise then never
// settles. Without this the liveness screen would spin forever with no way out.
const CAPTURE_TIMEOUT_MS = 3 * 60_000;

/** err.code values callers branch on. A cancel is a user choice, NOT a failed identity check. */
export const EVERIFY_CANCELLED = 'EVERIFY_CANCELLED';
export const EVERIFY_TIMEOUT = 'EVERIFY_TIMEOUT';

/**
 * Whether this session verifies through the eVerify Web SDK — i.e. whether the camera belongs to
 * the SDK's iframe rather than to us.
 *
 * Every screen that touches the camera has to agree on this, and the answer moved from a
 * build-time flag to the backend's VERIFICATION_METHOD. When the two call sites each carried
 * their own copy of the check, the Liveness preview kept testing only the stale build-time half
 * and grabbed the front camera out from under the SDK. One predicate, one source of truth.
 */
export function usesEverifySdk(state) {
  // The Login as eGov widget's public test accounts are fictional identities. Matching a real
  // tester's face against them in PhilSys is impossible, so they use the separate hosted Face
  // Liveness service instead; the backend still validates that result server-to-server. The flag
  // is supplied by the authenticated patient response and cannot be enabled by editing contact
  // details in the browser.
  if (state?.sandboxAccount) return false;
  return import.meta.env.VITE_EVERIFY_SDK_ENABLED === 'true' || state?.verificationMethod === 'everify';
}

function livenessError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

let loadPromise = null;

function loadScript() {
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    if (window.eKYC) { resolve(); return; }
    const script = document.createElement('script');
    script.src = SDK_SRC;
    script.async = true;
    script.onload = () => (window.eKYC ? resolve() : reject(new Error('eVerify SDK loaded but window.eKYC is missing')));
    script.onerror = () => reject(new Error('Failed to load the eVerify Face Liveness SDK'));
    document.body.appendChild(script);
  });
  return loadPromise;
}

// The SDK tears its own overlay down on completion and on its X button, and hands us no handle to
// it — so the only case we clean up after is our own timeout bail-out, where the SDK is still
// waiting and its z-index:9999 full-screen div would otherwise cover the error we just raised.
function dismissOverlay() {
  const frame = document.querySelector(`iframe[src^="${CAPTURE_ORIGIN}"]`);
  if (frame && frame.parentElement) frame.parentElement.remove();
}

/** Rejects with EVERIFY_TIMEOUT if the SDK's promise hasn't settled within CAPTURE_TIMEOUT_MS. */
function withTimeout(promise) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      dismissOverlay();
      reject(livenessError(EVERIFY_TIMEOUT, 'The face check timed out before it finished'));
    }, CAPTURE_TIMEOUT_MS);
    const settle = (fn) => (value) => { window.clearTimeout(timer); fn(value); };
    promise.then(settle(resolve), settle(reject));
  });
}

/** Runs the eVerify Web SDK's in-browser liveness capture. Returns the session_id on success. */
export async function runEverifyLivenessCapture(pubKey) {
  if (!pubKey) throw new Error('eVerify pubKey is not configured');
  await loadScript();

  let response;
  try {
    response = await withTimeout(window.eKYC().start({ pubKey }));
  } catch (err) {
    // The X button rejects with a PLAIN OBJECT — { status: 'CANCELLED', result: undefined } — not
    // an Error. Left as-is its `message` is undefined, so every `err.message || 'fallback'` above
    // us reports a deliberate cancel as a generic verification failure. Normalize it, and any
    // other non-Error rejection with it, so callers always get a real Error with a real message.
    if (err && err.status === 'CANCELLED') throw livenessError(EVERIFY_CANCELLED, 'Face check cancelled');
    if (err instanceof Error) throw err;
    throw new Error('The eVerify face check failed');
  }

  const sessionId = response?.result?.session_id;
  if (!sessionId) throw new Error('eVerify SDK did not return a session_id');
  return sessionId;
}
