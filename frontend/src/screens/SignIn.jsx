import { useEffect, useRef, useState } from 'react';
import PinInput from '../components/PinInput.jsx';
import { Fingerprint } from '../components/Icons.jsx';
import communityArt from '../assets/signin-filipino-community.png';
import ProfileSetup from '../components/ProfileSetup.jsx';
import { mountEgovLogin } from '../lib/egovLoginWidget.js';

export default function SignIn({ c, S, A }) {
  const live = S.authMode === 'live';
  const loading = S.authMode === 'loading';
  // Set when the landing URL carried an eGovPH exchange code. The code is spent by this button
  // and nowhere else, so a link prefetch can never consume it (see the mount effect in App.jsx).
  const codeReady = !!S.pendingExchangeCode;
  const [mpin, setMpin] = useState(['', '', '', '', '', '']);
  const [editingProfile, setEditingProfile] = useState(false);

  // The widget is the browser sign-in path: it runs eGovPH's own mobile -> OTP -> PIN screens and
  // hands back an exchange code. Skipped when a code is already in hand (arrived via the in-app
  // launch) or when a partner launch URL is configured, since both already have a way in.
  const showWidget = live && !codeReady && !!S.ssoPartnerCode && !S.authLaunchUrl;
  const widgetRef = useRef(null);
  const [widgetError, setWidgetError] = useState(null);
  const [widgetAttempt, setWidgetAttempt] = useState(0);

  useEffect(() => {
    if (!showWidget || !widgetRef.current) return undefined;
    let cleanup = null;
    let cancelled = false;
    setWidgetError(null);

    mountEgovLogin({
      target: widgetRef.current,
      partnerCode: S.ssoPartnerCode,
      host: S.ssoHost,
      partnerName: 'eGovMed',
      // The widget's default theme is 'auto', which follows the OS. eGovMed has no dark mode, so
      // on a dark-mode phone that painted a black eGovPH button into a white app. Pin it to the
      // only theme the app actually has.
      theme: 'light',
      // The widget hard-resets its own subtree with !important under an `egov-armor` cascade layer,
      // so its trigger cannot be restyled from here by design. `size` is the one lever it does
      // offer, and 'lg' is the closest it gets to the 58px full-width buttons around it.
      size: 'lg',
      // The widget speaks en/fil, and the app already has an EN/TL toggle — hand it the same
      // choice so a Tagalog session doesn't hit an English OTP screen halfway through signing in.
      locale: S.lang === 'tl' ? 'fil' : 'en',
      // Mobile only. The widget's Email tab is real, but the hackathon SSO credentials only
      // resolve an identity from a mobile number — every email, sandbox or otherwise, dead-ends on
      // this deployment. With a single entry the widget drops its Mobile/Email tab strip
      // altogether, so nobody is offered a path that cannot work.
      identifierTypes: ['mobile'],
      // Puts eGovPH's sandbox accounts in the widget itself. There is no real PhilSys account to
      // sign in with on this deployment, so without this a tester is staring at a mobile-number
      // field with nothing valid to type into it.
      showTestAccounts: true,
      // The widget only shows that panel on its first step, so it vanishes the moment a number is
      // submitted — taking the one-time code and the PIN off screen on the two steps that ask for
      // them. This copy drives a replacement panel that stays up for the whole flow.
      testAccountsCopy: S.lang === 'tl' ? {
        title: 'Mga test account',
        desc: 'Pang-develop lamang. Gamitin ang alinman sa mga numerong ito.',
        mobile: 'Mobile number',
        otp: 'One-time code',
        pin: 'PIN',
        mobileOnly: 'Mobile number lang muna. Sa hackathon setup, numero lang ang tinatanggap ng eGovPH SSO, hindi email.',
      } : {
        title: 'Test accounts',
        desc: 'Development only. Sign in with any of these.',
        mobile: 'Mobile number',
        otp: 'One-time code',
        pin: 'PIN',
        mobileOnly: 'Mobile number only for now. On the hackathon setup, eGovPH SSO resolves an account from a number, not an email address.',
      },
      // Redeem immediately. Unlike a code lifted off the landing URL, this one was minted by a
      // deliberate act the citizen just performed, so there is no prefetch to guard against and
      // making them tap a second button only gives the short-lived code time to expire.
      onSuccess: (exchangeCode) => A.redeemExchangeCode(exchangeCode),
      onError: (err) => setWidgetError(err.message || 'The eGovPH sign-in failed'),
      onCancel: () => setWidgetError(null),
    }).then((fn) => {
      // The effect can be torn down while the script is still loading; without this the widget
      // mounts into a container React has already discarded.
      if (cancelled) { fn(); return; }
      cleanup = fn;
    }).catch((err) => {
      if (!cancelled) setWidgetError(err.message || 'Could not load the eGovPH sign-in');
    });

    return () => { cancelled = true; if (cleanup) cleanup(); };
  }, [showWidget, S.ssoPartnerCode, S.ssoHost, S.lang, widgetAttempt, A]);
  const onChange = (arr) => {
    setMpin(arr);
    if (arr.every((d) => d)) setTimeout(() => A.doSignIn(), 260);
  };

  return (
    <div className="screen" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <h1 className="h1" style={{ marginTop: 20 }} data-stagger>{c.welcomeBack}</h1>
      <p className="sub" data-stagger>
        {live ? 'Continue securely through your eGovPH account.' : c.mpinPrompt}
      </p>

      {!live && !loading && (
        <>
          <div data-stagger style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 22, marginBottom: 10 }}>
            <span style={{ fontWeight: 700, fontSize: '0.92em' }}>{c.mpinLabel}</span>
            <button className="btn ghost" style={{ width: 'auto' }} onClick={() => setMpin(['', '', '', '', '', ''])}>{c.clearLabel}</button>
          </div>
          <div data-stagger>
            <PinInput values={mpin} onChange={onChange} masked autoFocus ariaLabel={c.mpinLabel} />
          </div>
        </>
      )}

      {S.signingIn ? (
        <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', marginTop: 18, color: 'var(--muted)', fontWeight: 600 }}>
          <span className="spinner" /> <span>{c.signingIn}</span>
        </div>
      ) : !live && !loading ? (
        <button className="btn ghost" style={{ marginTop: 14 }} onClick={() => A.toast(c.forgotMpin)}>{c.forgotMpin}</button>
      ) : null}

      <div className="rowsep" style={{ margin: '20px 0' }} />

      {codeReady && (
        <p className="sub" data-stagger style={{ textAlign: 'center', marginBottom: 12, fontWeight: 650, color: 'var(--ink)' }}>
          {c.ssoCodeReady}
        </p>
      )}

      {/* Hidden while the widget is up. With a partner code and no launch URL this button has
          nothing left to do — doSignIn's live branch returns immediately — so leaving it there
          offered two ways in, one of which silently did nothing. The widget IS the button now. */}
      {!showWidget && (
        <button
          data-stagger
          onClick={A.doSignIn}
          disabled={loading || S.signingIn}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%', minHeight: 56, border: '1.5px solid var(--line)', background: 'var(--canvas)', color: 'var(--ink)', borderRadius: 16, fontWeight: 700 }}
        >
          {loading || S.signingIn ? <span className="spinner" /> : <Fingerprint size={22} color="var(--primary)" />}
          <span>{loading ? 'Checking eGovPH…' : (live || codeReady) ? 'Continue with eGovPH' : c.fingerprint}</span>
        </button>
      )}

      {/* The widget replaces that button, so it takes its spot above the error slot rather than
          appearing under it. */}
      {showWidget && (
        <div data-stagger>
          {/* No test-account note out here. The sign-in screen is the first thing anyone opening
              eGovMed sees, and a sandbox-credentials card is the wrong first impression of a
              citizen-facing app. The same guidance now travels with the numbers themselves, on
              the panel injected into the widget's own modal — see lib/egovTestAccounts.js. */}
          <div className="egov-login-slot" ref={widgetRef} />
          {widgetError && (
            <div role="alert" className="card" style={{ marginTop: 12, color: 'var(--red)', fontWeight: 650, fontSize: '0.9em' }}>
              <div>{widgetError}</div>
              <button
                className="btn ghost"
                style={{ marginTop: 10 }}
                onClick={() => { setWidgetError(null); setWidgetAttempt((n) => n + 1); }}
              >
                {c.tryAgain || 'Try again'}
              </button>
            </div>
          )}
        </div>
      )}

      {S.flowError && (
        <div role="alert" className="card" style={{ marginTop: 14, color: 'var(--red)', fontWeight: 650, fontSize: '0.9em' }}>
          {/* Backend messages arrive in English only, so the ones we have our own wording for
              re-resolve here and follow the EN/TL toggle. The rest show exactly what the server said. */}
          {(S.flowErrorKey && c[S.flowErrorKey]) || S.flowError}
        </div>
      )}

      {live && !codeReady && !S.ssoPartnerCode && !S.authLaunchUrl && !S.flowError && (
        <p className="sub" style={{ textAlign: 'center', marginTop: 14 }}>
          Launch eGovMed from the eGovPH app to sign in.
        </p>
      )}

      {/* "Not you?" is a question, so the answer has to be "then set who I am". It used to toast
          its own label; now it opens the two fields that actually decide whose profile this is.
          Mock mode only — a live eGovPH session brings its own PhilSys-backed identity. */}
      {!live && (editingProfile ? (
        <ProfileSetup
          c={c}
          onCancel={() => setEditingProfile(false)}
          onSaved={(patient) => { setEditingProfile(false); A.onPatientUpdated(patient); A.toast(c.contactSaved); }}
        />
      ) : (
        <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => setEditingProfile(true)}>
          {c.notYou} {c.switchAccount}
        </button>
      ))}

      <div className="spacer" style={{ minHeight: 16 }} />
      <img
        src={communityArt}
        alt=""
        style={{ width: 'calc(100% + 44px)', height: 150, margin: '0 -22px -28px', objectFit: 'cover', display: 'block' }}
      />
    </div>
  );
}
