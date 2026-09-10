import { ScreenHeader, Btn } from '../components/ui.jsx';
import { HeartPulse, Warning, Phone, Pin, Dot } from '../components/Icons.jsx';
import { CONST } from '../i18n/dict.js';

// True on touch-primary devices (mobile/tablet). Desktop returns false so tel: doesn't
// leave a "failed" entry in the DevTools network panel when there's no phone handler.
const isPhoneCapable = () => typeof window !== 'undefined'
  && (('ontouchstart' in window) || navigator.maxTouchPoints > 0 || window.matchMedia?.('(hover: none)').matches);

export default function Triage({ c, lang, S, A }) {
  const dept = S.triage?.specialty || CONST.dept;
  const urgency = ['routine', 'urgent', 'emergency'].includes(S.triage?.urgency) ? S.triage.urgency : 'routine';
  const urgencyLabel = urgency === 'routine' ? c.uRoutine : urgency === 'emergency' ? c.uEmergency : c.uUrgent;
  const reported = String(S.triage?.inputSymptoms || S.symptom || '').trim();
  const excerpt = reported.length > 120 ? `${reported.slice(0, 117)}…` : reported;
  const reasoning = String(S.triage?.reasoning || '').trim();
  const usefulReasoning = reasoning && !/fallback triage|unavailable/i.test(reasoning) ? reasoning : null;
  const why = [
    excerpt ? `${c.reportedSymptoms}: “${excerpt}”` : null,
    ...(S.triage?.redFlags || []),
    usefulReasoning,
    `${c.specialtyMatch} ${dept}.`,
  ].filter(Boolean).slice(0, 4);

  const callEmergency = () => {
    if (isPhoneCapable()) { window.location.href = 'tel:911'; return; }
    A.toast(lang === 'tl' ? 'Tumawag ng 911 mula sa telepono' : 'Please dial 911 from a phone');
  };

  if (S.emergency) {
    return (
      <div className="screen" style={{ background: 'var(--red)', color: '#fff', margin: '-8px -22px -28px', padding: '32px 24px 28px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div className="pulse-red" style={{ width: 84, height: 84, borderRadius: '50%', background: 'rgba(255,255,255,.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '18px auto 0' }}>
          <Warning size={44} color="#fff" />
        </div>
        <h1 style={{ fontSize: '2em', fontWeight: 900, textAlign: 'center', margin: '22px 0 0' }}>{c.emergencyTitle}</h1>
        <p style={{ textAlign: 'center', fontSize: '1.05em', lineHeight: 1.5, margin: '12px 0 0', opacity: 0.95 }}>{c.emergencyBanner}</p>
        <div className="spacer" />
        <button type="button" onClick={callEmergency} className="btn" style={{ background: '#fff', color: 'var(--red)' }}>
          <Phone size={20} /> {c.callER}
        </button>
        <button type="button" onClick={() => A.toast(lang === 'tl' ? 'Buksan ang mapa para hanapin ang pinakamalapit na ER' : 'Open your maps to find the nearest ER')} className="btn" style={{ background: 'transparent', color: '#fff', border: '1.5px solid rgba(255,255,255,.6)', marginTop: 12 }}>
          <Pin size={20} /> {c.findER}
        </button>
        <button onClick={A.continueTriage} style={{ background: 'none', border: 'none', color: '#fff', textDecoration: 'underline', marginTop: 18, fontSize: '0.9em' }}>{c.emgDemoContinue}</button>
      </div>
    );
  }

  return (
    <div className="screen">
      <ScreenHeader onBack={A.back} step={2} label={c.stepTriage} />
      <h1 className="h1" data-stagger>{c.triageTitle}</h1>

      <div className="card" data-stagger style={{ marginTop: 16 }}>
        <div className="overline">{c.deptLabel}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
          <span className="icirc"><HeartPulse size={24} /></span>
          <span style={{ fontSize: '1.4em', fontWeight: 800 }}>{dept}</span>
        </div>
        <div style={{ marginTop: 14 }}>
          <span className={`pill ${urgency === 'routine' ? 'green' : 'amber'}`} style={{ fontSize: '0.85em' }}>
            <Dot color={urgency === 'routine' ? 'var(--green)' : 'var(--amber)'} /> {urgencyLabel}
          </span>
        </div>
      </div>

      <div className="card tint" data-stagger style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>{c.triageWhy}</div>
        <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--ink)', lineHeight: 1.6 }}>
          {why.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
      </div>

      <div data-stagger style={{ display: 'flex', gap: 9, marginTop: 12, color: 'var(--amber)', background: 'var(--amber-50)', borderRadius: 14, padding: '12px 14px', fontSize: '0.85em', fontWeight: 600 }} role="note">
        <Warning size={18} /> <span>{c.triageDisclaimer}</span>
      </div>

      <div style={{ marginTop: 18 }}>
        <Btn onClick={A.continueTriage}>{c.continue}</Btn>
      </div>
    </div>
  );
}
