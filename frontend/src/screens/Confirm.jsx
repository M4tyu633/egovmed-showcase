import { Btn } from '../components/ui.jsx';
import { Check } from '../components/Icons.jsx';
import { Pop } from '../components/anim.jsx';
import { PREP, CONST, SLOTS } from '../i18n/dict.js';

export default function Confirm({ c, lang, S, A }) {
  const dept = S.triage?.specialty || CONST.dept;
  const batch = (S.lastBooked || []).filter((r) => r.appt);
  const multi = batch.length > 1;
  return (
    <div className="screen" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <div style={{ textAlign: 'center', marginTop: 12 }} role="status">
        <Pop className="checkdisc"><Check size={40} /></Pop>
        <h1 className="h1" style={{ marginTop: 18 }}>{c.confirmTitle}</h1>
        <p className="sub">{multi ? batch.map((r) => r.specialty).join(' + ') : `${dept} · ${S.slotLabel || SLOTS[lang][0][0]}`}</p>
      </div>

      {multi ? (
        <div data-stagger className="stack" style={{ marginTop: 20 }}>
          {batch.map((r) => (
            <div key={r.appt.id} style={{ background: 'var(--primary)', color: '#fff', borderRadius: 20, padding: 18, textAlign: 'center' }}>
              <div style={{ fontSize: '0.75em', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.85 }}>{r.specialty}</div>
              <div className="mono" style={{ fontSize: '1.5em', fontWeight: 700, letterSpacing: '0.08em', margin: '6px 0' }}>{r.refNo}</div>
              <div style={{ fontSize: '0.82em', opacity: 0.9 }}>{r.slotLabel}</div>
            </div>
          ))}
          <div style={{ fontSize: '0.85em', color: 'var(--muted)', textAlign: 'center' }}>{c.texted}</div>
        </div>
      ) : (
        <div data-stagger style={{ marginTop: 20, background: 'var(--primary)', color: '#fff', borderRadius: 20, padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: '0.75em', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.85 }}>{c.refLabel}</div>
          <div className="mono" style={{ fontSize: '2em', fontWeight: 700, letterSpacing: '0.08em', margin: '6px 0' }}>{S.refNo}</div>
          <div style={{ fontSize: '0.85em', opacity: 0.9 }}>{c.texted}</div>
        </div>
      )}

      <div data-stagger className="card" style={{ marginTop: 14 }}>
        <div style={{ fontWeight: 800, marginBottom: 10 }}>{c.prep}</div>
        <div className="stack">
          {PREP[lang].map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
              <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--blue-50)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', marginTop: 1 }}>
                <Check size={13} />
              </span>
              <span style={{ fontSize: '0.95em', lineHeight: 1.4 }}>{p}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="spacer" style={{ minHeight: 18 }} />
      <div className="stack">
        <Btn onClick={() => A.goPayment(S.appointments[0]?.id)}>{c.goPay}</Btn>
        <Btn variant="secondary" onClick={A.resetToHome}>{c.backHome}</Btn>
      </div>
    </div>
  );
}
