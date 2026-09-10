import { useEffect, useRef, useState } from 'react';
import { ScreenHeader, Btn } from '../components/ui.jsx';
import PinInput from '../components/PinInput.jsx';
import { Check, Warning } from '../components/Icons.jsx';
import { Pop } from '../components/anim.jsx';
import { CATS } from '../i18n/dict.js';

// eGovMed's own two states, and only those. There is deliberately no government-side status here:
// eReport gates case lookup behind a per-complainant, OTP-minted, time-limited report_view_token
// that a server-side integration cannot hold for an arbitrary patient, so any "Under review" /
// "Assigned" / "Resolved" step we rendered would be invented. See docs/integrations.md.
const STATUS_KEY = { open: 'statusOpen', escalated: 'statusEscalated' };

// The one honest thing we can say about the government side: here is your case number, and here
// is where to take it. Shown on both the just-filed confirmation and the tracking result.
function UpstreamNote({ c }) {
  return (
    <div data-stagger style={{ display: 'flex', gap: 9, marginTop: 12, color: 'var(--muted)', background: 'var(--surface)', border: '1.5px solid var(--line)', borderRadius: 14, padding: '12px 14px', fontSize: '0.85em', fontWeight: 600 }} role="note">
      {c.trackUpstreamNote}
    </div>
  );
}

// Rows come from GET /reports, which returns summaries only (no description) — enough to pick a
// case without having written its number down, which is the whole point of the list.
function MyReportRow({ c, lang, report, active, onPick }) {
  const status = String(report.status || '').toLowerCase();
  const statusLabel = c[STATUS_KEY[status]] || report.status;
  // Categories are stored in English (that's what gets filed upstream), so map back through
  // CATS for display. Falls through to the raw value for anything that isn't one of ours.
  const catIndex = CATS.en.indexOf(report.category);
  const catLabel = catIndex === -1 ? report.category : CATS[lang][catIndex];
  const filed = new Date(report.createdAt);
  const when = Number.isNaN(filed.getTime()) ? '' : filed.toLocaleDateString(lang === 'tl' ? 'fil-PH' : 'en-PH', { day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <button
      onClick={() => onPick(report.caseNumber)}
      aria-label={`${report.caseNumber}, ${catLabel}, ${statusLabel}`}
      style={{
        width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 14px', borderRadius: 14, background: 'var(--surface)', cursor: 'pointer',
        border: active ? '2px solid var(--primary)' : '1.5px solid var(--line)',
      }}
    >
      <span style={{ minWidth: 0, flex: 1 }}>
        <span className="mono" style={{ display: 'block', fontWeight: 700, letterSpacing: '0.04em', overflowWrap: 'anywhere' }}>{report.caseNumber}</span>
        <span className="sub" style={{ display: 'block', margin: '2px 0 0' }}>
          {catLabel}{when ? ` · ${when}` : ''}
        </span>
      </span>
      <span className={`pill ${status === 'escalated' ? 'amber' : 'blue'}`} style={{ flex: 'none' }}>{statusLabel}</span>
    </button>
  );
}

export default function Report({ c, lang, S, set, A }) {
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [resendSecs, setResendSecs] = useState(30);
  const resendTimer = useRef(null);

  const startResendCountdown = () => {
    if (resendTimer.current) clearInterval(resendTimer.current);
    setResendSecs(30);
    resendTimer.current = setInterval(() => {
      setResendSecs((s) => {
        if (s <= 1) { clearInterval(resendTimer.current); resendTimer.current = null; return 0; }
        return s - 1;
      });
    }, 1000);
  };

  // The countdown tracks a code that actually exists, so it starts when the server confirms one
  // was sent (otpChallengeId appears) rather than when the screen renders. A send that failed
  // leaves the resend button live immediately — there is nothing to wait for.
  useEffect(() => {
    if (S.reportStage === 'otp' && S.otpChallengeId) startResendCountdown();
    return () => { if (resendTimer.current) { clearInterval(resendTimer.current); resendTimer.current = null; } };
  }, [S.reportStage, S.otpChallengeId]);

  const handleResend = async () => {
    if (resendSecs > 0 || S.otpSending) return;
    setOtp(['', '', '', '', '', '']);
    // A resend mints a NEW challenge server-side; the previous code stops working. Only claim we
    // texted anything once the server says we did.
    if (await A.sendReportOtp()) A.toast(c.resendSent);
  };

  if (S.reportStage === 'track') {
    const result = S.trackResult;
    const resultStatus = String(result?.status || '').toLowerCase();
    const escalated = resultStatus === 'escalated';
    const resultFiled = result ? new Date(result.createdAt) : null;
    const resultWhen = resultFiled && !Number.isNaN(resultFiled.getTime())
      ? resultFiled.toLocaleDateString(lang === 'tl' ? 'fil-PH' : 'en-PH', { day: 'numeric', month: 'short', year: 'numeric' })
      : '';
    return (
      <div className="screen" key={S.reportStage}>
        <ScreenHeader onBack={() => set({ reportStage: 'form' })} label={c.trackTitle} />
        <h1 className="h1" data-stagger>{c.trackTitle}</h1>
        <p className="sub" data-stagger>{c.trackSub}</p>

        <div className="overline" data-stagger style={{ marginTop: 20, marginBottom: 10 }}>{c.myReportsLabel}</div>
        {/* One data-stagger wrapper that is always present, so the list arriving asynchronously
            never changes the set of elements the screen-entry stagger is animating. */}
        <div data-stagger>
          {S.myReportsLoading ? (
            <div className="sub" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="spinner" /> {c.myReportsLoadingText}
            </div>
          ) : S.myReports.length === 0 ? (
            <div className="sub">{c.myReportsEmpty}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {S.myReports.map((r) => (
                <MyReportRow
                  key={r.id} c={c} lang={lang} report={r}
                  active={r.caseNumber === S.trackCaseNo}
                  onPick={A.trackMyReport}
                />
              ))}
            </div>
          )}
        </div>

        <div className="overline" data-stagger style={{ marginTop: 20, marginBottom: 10 }}>{c.trackManualLabel}</div>
        <input
          data-stagger className="field mono" value={S.trackCaseNo}
          onChange={(e) => A.setTrackCaseNo(e.target.value)}
          placeholder={c.caseNumberPlaceholder} aria-label={c.caseNumberLabel}
          style={{ letterSpacing: '0.04em' }}
        />
        {S.trackError && (
          <div data-stagger style={{ display: 'flex', gap: 9, marginTop: 10, color: 'var(--red)', background: 'var(--red-50)', borderRadius: 14, padding: '12px 14px', fontSize: '0.85em', fontWeight: 600 }} role="alert">
            <Warning size={18} />
            <span>{S.trackError === 'invalid' ? c.trackInvalid : c.trackNotFound}</span>
          </div>
        )}

        <div style={{ marginTop: 18 }}>
          <Btn disabled={!S.trackCaseNo.trim() || S.trackLoading} onClick={A.submitTrackCase}>
            {S.trackLoading ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}><span className="spinner white" /> {c.trackChecking}</span> : c.trackButton}
          </Btn>
        </div>

        {result && (
          <>
            <div data-stagger className="card" style={{ marginTop: 18, textAlign: 'center' }}>
              <div className="overline">{c.caseLabel}</div>
              <div className="mono" style={{ fontSize: '1.3em', fontWeight: 700, letterSpacing: '0.06em', marginTop: 6 }}>{result.caseNumber}</div>
              {resultWhen && <div className="sub" style={{ margin: '6px 0 0' }}>{c.filedOnLabel} {resultWhen}</div>}
              <span className={`pill ${escalated ? 'amber' : 'blue'}`} style={{ marginTop: 10 }}>
                {c[STATUS_KEY[resultStatus]] || result.status}
              </span>
            </div>
            <UpstreamNote c={c} />
            <button
              data-stagger onClick={() => set({ trackCaseNo: '', trackResult: null, trackError: null })}
              style={{ background: 'none', border: 'none', padding: 0, marginTop: 4, color: 'var(--primary)', fontWeight: 700, fontSize: '0.9em', textDecoration: 'underline' }}
            >
              {c.trackAnother}
            </button>
          </>
        )}
      </div>
    );
  }

  if (S.reportStage === 'filed') {
    return (
      <div className="screen" key={S.reportStage}>
        <div style={{ textAlign: 'center', marginTop: 12 }} role="status">
          <Pop className="checkdisc"><Check size={40} /></Pop>
          <h1 className="h1" style={{ marginTop: 18 }}>{c.caseTitle}</h1>
        </div>

        <div data-stagger className="card" style={{ marginTop: 18, textAlign: 'center' }}>
          <div className="overline">{c.caseLabel}</div>
          <div className="mono" style={{ fontSize: '1.5em', fontWeight: 700, letterSpacing: '0.06em', marginTop: 6 }}>{S.caseNo}</div>
        </div>

        <UpstreamNote c={c} />

        <div data-stagger style={{ display: 'flex', gap: 9, marginTop: 12, color: 'var(--amber)', background: 'var(--amber-50)', borderRadius: 14, padding: '12px 14px', fontSize: '0.85em', fontWeight: 600 }} role="note">
          {c.escalation}
        </div>

        <div style={{ marginTop: 18 }}>
          <Btn variant="secondary" onClick={A.resetToHome}>{c.backHome}</Btn>
        </div>
      </div>
    );
  }

  if (S.reportStage === 'otp') {
    const ready = otp.every((d) => d) && !!S.otpChallengeId && !S.otpVerifying;
    // The mask comes from the patient's own number (server-derived, last 4 digits). Until the send
    // lands we say we are sending rather than naming a number we have not confirmed.
    const sub = S.otpSending || !S.otpMasked ? c.otpSending : c.otpSub.replace('{phone}', S.otpMasked);
    return (
      <div className="screen" key={S.reportStage}>
        <ScreenHeader onBack={() => set({ reportStage: 'form' })} label={c.otpTitle} />
        <h1 className="h1" data-stagger>{c.otpTitle}</h1>
        <p className="sub" data-stagger>{sub}</p>
        {/* The server refuses to file without a verified code, so every failure here is terminal
            for this attempt and has to be readable: wrong digits, expired, too many tries, or no
            mobile number on file (which sends the patient to Account). */}
        {S.otpError && (
          <div data-stagger style={{ display: 'flex', gap: 9, marginTop: 12, color: 'var(--red)', background: 'var(--red-50)', borderRadius: 14, padding: '12px 14px', fontSize: '0.85em', fontWeight: 600 }} role="alert">
            <Warning size={18} />
            <span>{S.otpError}</span>
          </div>
        )}
        <div data-stagger style={{ marginTop: 20 }}>
          <PinInput values={otp} onChange={setOtp} autoFocus ariaLabel={c.otpTitle} />
        </div>
        {/* Mock mode only: the backend returns the code because no SMS actually left the process
            (EMESSAGE_MODE=mock). A live deployment never sends this field, so this never renders. */}
        {S.otpMockCode && (
          <div data-stagger className="sub" style={{ marginTop: 10 }}>
            {c.otpMockHint.replace('{code}', S.otpMockCode)}
          </div>
        )}
        <button className="btn ghost" style={{ marginTop: 14 }} disabled={resendSecs > 0 || S.otpSending} onClick={handleResend}>
          {resendSecs > 0 ? `${c.resendPrefix} 0:${String(resendSecs).padStart(2, '0')}` : c.resendReady}
        </button>
        <div style={{ marginTop: 12 }}>
          <Btn disabled={!ready} onClick={() => A.verifyOtp(CATS.en[S.reportCat], otp.join(''))}>
            {S.otpVerifying ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}><span className="spinner white" /> {c.otpVerifying}</span> : c.verifyOtp}
          </Btn>
        </div>
      </div>
    );
  }

  // form stage
  const canSubmit = S.reportCat != null && S.reportDesc.trim();
  return (
    <div className="screen" key={S.reportStage}>
      <ScreenHeader onBack={A.back} label={c.reportTitle} />
      <h1 className="h1" data-stagger>{c.reportTitle}</h1>
      <p className="sub" data-stagger>{c.reportSub}</p>
      <button
        data-stagger onClick={A.openTrackReport}
        style={{ background: 'none', border: 'none', padding: 0, marginTop: 4, color: 'var(--primary)', fontWeight: 700, fontSize: '0.9em', textDecoration: 'underline' }}
      >
        {c.reportTrackLink}
      </button>

      <div className="overline" data-stagger style={{ marginTop: 20, marginBottom: 10 }}>{c.reportCatLabel}</div>
      <div data-stagger style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {CATS[lang].map((label, i) => {
          const sel = S.reportCat === i;
          return (
            <button
              key={i}
              onClick={() => A.setCat(i)}
              aria-pressed={sel}
              style={{ borderRadius: 999, padding: '10px 16px', fontWeight: 700, fontSize: '0.9em', border: sel ? '2px solid var(--primary)' : '1.5px solid var(--line)', background: sel ? 'var(--blue-50)' : 'var(--surface)', color: sel ? 'var(--primary)' : 'var(--ink)' }}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="overline" data-stagger style={{ marginTop: 20, marginBottom: 10 }}>{c.descLabel}</div>
      <textarea data-stagger className="field" style={{ minHeight: 130 }} value={S.reportDesc} onChange={(e) => A.setDesc(e.target.value)} placeholder={c.descPlaceholder} aria-label={c.descLabel} />

      <div style={{ marginTop: 18 }}>
        <Btn disabled={!canSubmit} onClick={A.submitReport}>{c.submitReport}</Btn>
      </div>
    </div>
  );
}
