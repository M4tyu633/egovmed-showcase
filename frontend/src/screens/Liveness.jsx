import { useEffect, useRef, useState } from 'react';
import { ScreenHeader, Btn } from '../components/ui.jsx';
import { User, Check } from '../components/Icons.jsx';
import { Pop } from '../components/anim.jsx';
import { usesEverifySdk } from '../lib/everifySdk.js';
import { copyAppLink } from '../lib/inAppBrowser.js';

export default function Liveness({ c, S, A }) {
  const verified = S.liveness === 'verified';
  const verifying = S.liveness === 'verifying';
  const failed = S.liveness === 'failed';
  // The patient closed the eVerify SDK's capture window themselves. Deliberately NOT `failed`:
  // nothing was checked and rejected, so this gets a calm status card, not the red alert.
  const cancelled = S.liveness === 'cancelled';
  // Open inside a chat app's built-in browser, where the camera cannot work at all.
  const blocked = S.liveness === 'blocked';
  const capturing = !verified && !failed && !cancelled && !blocked; // camera circle + "hold still" copy
  const videoRef = useRef(null);
  // The live stream, held outside React state: the <video> it belongs to is mounted by the very
  // render that `camera === 'live'` triggers, so it cannot be attached at capture time.
  const streamRef = useRef(null);
  const [camera, setCamera] = useState('idle'); // 'idle' | 'live' | 'denied' | 'unavailable'
  const [copied, setCopied] = useState('idle'); // 'idle' | 'ok' | 'fail'

  // Real camera preview during the liveness capture (works in mock too, so the flow feels live).
  // In LIVE Face Liveness mode the browser will instead redirect to Amazon's hosted UI which
  // opens its own camera — this preview short-circuits before that redirect anyway.
  //
  // The eVerify Web SDK, in contrast, captures right here, in a cross-origin iframe with its own
  // permission prompt. Running this preview alongside it asks the patient for the camera twice
  // and — on a phone, where the front camera has a single consumer — leaves the SDK staring at a
  // device we are already holding: "Camera is not accessible… another application using the
  // camera", with no way past it. So this has to reach the same verdict App.jsx reaches before
  // launching the SDK, which is why both go through usesEverifySdk(). It used to test only
  // import.meta.env.VITE_EVERIFY_SDK_ENABLED, and once the provider switch moved to the backend's
  // VERIFICATION_METHOD that build-time flag was false in production while the SDK path was live
  // — so this preview ran every time, and every phone hit exactly that error.
  //
  // One boolean rather than the raw state, so the dependency does not change between 'capturing'
  // and 'verifying': keying the effect on S.liveness tore the stream down and re-acquired it
  // halfway through the capture, a visible stall and one more chance for the grant to be refused.
  const wantsPreview = (S.liveness === 'capturing' || S.liveness === 'verifying') && !usesEverifySdk(S);
  useEffect(() => {
    if (!wantsPreview) return undefined;
    if (!navigator.mediaDevices?.getUserMedia) { setCamera('unavailable'); return undefined; }
    let stream, cancelledEffect = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 480 } }, audio: false });
        if (cancelledEffect) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        setCamera('live');
      } catch (err) {
        setCamera(err && err.name === 'NotAllowedError' ? 'denied' : 'unavailable');
      }
    })();
    return () => {
      cancelledEffect = true;
      if (stream) stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setCamera('idle');
    };
  }, [wantsPreview]);

  // Attaching the stream lives here rather than beside getUserMedia because the <video> is only
  // mounted while `capturing`, and on iOS a srcObject alone does not start playback — the element
  // needs an explicit play(), which browsers permit because the video is muted and inline.
  useEffect(() => {
    const video = videoRef.current;
    if (camera !== 'live' || !video || !streamRef.current) return;
    video.srcObject = streamRef.current;
    video.play().catch(() => {}); // Autoplay refusal just leaves the placeholder up; not fatal.
  }, [camera]);

  // Origin only. The current path can carry a one-time eGovPH exchange code or a liveness
  // callback, and neither survives being pasted into another browser later — the bare app URL
  // lands the patient on sign-in, which is where they need to be anyway.
  const appUrl = typeof window === 'undefined' ? '' : window.location.origin;
  const onCopyLink = async () => {
    // Both outcomes have to show. Some of these webviews refuse clipboard writes outright, and a
    // button that reports nothing when tapped reads as broken — the fallback is to tell the
    // patient to take the link off the screen by hand.
    setCopied(await copyAppLink(appUrl) ? 'ok' : 'fail');
  };

  return (
    <div className="screen" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
      <div style={{ width: '100%' }}>
        <ScreenHeader onBack={A.back} step={3} label={c.stepVerify} />
      </div>

      {capturing && (
        <>
          <h1 className="h1" style={{ textAlign: 'center', marginTop: 8 }}>{c.livenessLook}</h1>
          <p className="sub" style={{ textAlign: 'center' }}>{c.livenessSubLook}</p>
        </>
      )}

      <div className="spacer" style={{ minHeight: 20 }} />

      {verified ? (
        <div style={{ textAlign: 'center' }} role="status" aria-live="polite">
          <Pop className="checkdisc"><Check size={40} /></Pop>
          <h2 className="h2" style={{ marginTop: 18 }}>{c.verified}</h2>
          <p className="sub">{c.verifiedSub}</p>
        </div>
      ) : cancelled ? (
        <div role="status" aria-live="polite" className="card" style={{ width: '100%', textAlign: 'center' }}>
          <h2 className="h2">{c.livenessCancelled}</h2>
          <p className="sub" style={{ marginTop: 8 }}>{c.livenessCancelledSub}</p>
          <div style={{ marginTop: 18 }}><Btn onClick={A.retryLiveness}>{c.livenessTryAgain}</Btn></div>
          <div style={{ marginTop: 10 }}><Btn variant="secondary" onClick={A.declineConsent}>{c.consentDecline}</Btn></div>
        </div>
      ) : blocked ? (
        <div role="status" aria-live="polite" className="card" style={{ width: '100%', textAlign: 'center' }}>
          <h2 className="h2">{c.livenessBlocked}</h2>
          <p className="sub" style={{ marginTop: 8 }}>{c.livenessBlockedSub(S.livenessBrowserName || 'This app')}</p>
          <p className="sub" style={{ marginTop: 10, fontWeight: 600 }}>{c.livenessBlockedHow}</p>
          {/* The link is on screen as well as on the clipboard: copy silently fails in some of
              these webviews, and a link you can read out is still a link you can retype. */}
          <p className="sub" style={{ marginTop: 10, wordBreak: 'break-all', fontSize: '0.85em' }}>{appUrl}</p>
          <div style={{ marginTop: 18 }}>
            <Btn onClick={onCopyLink}>{copied === 'ok' ? c.livenessLinkCopied : c.livenessCopyLink}</Btn>
          </div>
          {copied === 'fail' && (
            <p className="sub" style={{ marginTop: 8, fontSize: '0.85em', color: 'var(--amber)' }}>{c.livenessCopyFailed}</p>
          )}
          <div style={{ marginTop: 10 }}><Btn variant="secondary" onClick={A.forceLiveness}>{c.livenessTryAnyway}</Btn></div>
        </div>
      ) : failed ? (
        <div role="alert" className="card" style={{ width: '100%', textAlign: 'center' }}>
          <h2 className="h2">Verification was not completed</h2>
          <p className="sub" style={{ color: 'var(--red)', marginTop: 8 }}>{S.flowError || 'Please try the liveness check again.'}</p>
          <div style={{ marginTop: 18 }}><Btn onClick={A.retryLiveness}>{c.livenessTryAgain}</Btn></div>
        </div>
      ) : (
        <div role="status" aria-live="polite" style={{ position: 'relative', width: 230, height: 230, borderRadius: '50%', background: '#D3E0F5', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', boxShadow: `0 0 0 4px ${verifying ? 'var(--blue-50)' : 'var(--teal-50)'}` }}>
          {/* Mounted whatever the camera state, because the stream can only be attached to an
              element that already exists — see the effect above. Hidden until it has pixels. */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)', display: camera === 'live' ? 'block' : 'none' }}
          />
          {camera !== 'live' && <User size={120} color="#9db6da" />}
          {verifying ? (
            <span className="spinner lg" style={{ position: 'absolute' }} />
          ) : (
            <span style={{ position: 'absolute', left: '8%', right: '8%', height: 3, background: 'var(--teal)', borderRadius: 3, boxShadow: '0 0 12px var(--teal)', animation: 'scanline 1.6s ease-in-out infinite alternate' }} />
          )}
        </div>
      )}
      {camera === 'denied' && capturing && (
        <p className="sub" style={{ textAlign: 'center', marginTop: 8, fontSize: '0.85em', color: 'var(--amber)' }}>
          Camera permission was blocked. The flow will continue in demo mode.
        </p>
      )}

      {capturing && (
        <p className="sub" style={{ textAlign: 'center', marginTop: 18, fontWeight: 600 }}>{verifying ? c.livenessVerifying : c.livenessHold}</p>
      )}

      <div className="spacer" style={{ minHeight: 20 }} />
      {verified && (
        <div style={{ width: '100%' }}>
          <Btn onClick={A.continueAfterVerify}>{S.verifyReturnTo === 'records' ? c.recordsLockedBackToRecords : c.continue}</Btn>
        </div>
      )}
    </div>
  );
}
