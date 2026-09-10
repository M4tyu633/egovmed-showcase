import { useEffect, useRef } from 'react';
import { Clock, Hospital, Check } from './Icons.jsx';
import { Btn } from './ui.jsx';

// Escape-to-close + move focus into the dialog on open (basic modal a11y).
export function useDismissable(onClose, ref) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    if (ref.current) ref.current.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, ref]);
}

export function Toast({ msg, icon }) {
  return (
    <div className="toast" role="status">
      <span style={{ color: 'var(--green)', display: 'flex' }}>{icon}</span>
      <span>{msg}</span>
    </div>
  );
}

export function TimeoutModal({ c, A }) {
  const ref = useRef(null);
  useDismissable(A.stayIn, ref);
  return (
    <div className="scrim center" onClick={A.stayIn}>
      <div className="modal" role="alertdialog" aria-modal="true" aria-label={c.timeoutTitle} tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()}>
        <div className="icirc" style={{ background: 'var(--amber-50)', color: 'var(--amber)', width: 52, height: 52, margin: '0 auto 14px' }}>
          <Clock size={26} />
        </div>
        <h2 className="h2" style={{ textAlign: 'center' }}>{c.timeoutTitle}</h2>
        <p className="sub" style={{ textAlign: 'center' }}>{c.timeoutSub}</p>
        <div className="stack" style={{ marginTop: 18 }}>
          <Btn onClick={A.stayIn}>{c.stayIn}</Btn>
          <button className="btn ghost" style={{ color: 'var(--red)' }} onClick={A.logout}>{c.logout}</button>
        </div>
      </div>
    </div>
  );
}

const emgToggle = (on) => ({ width: 44, height: 26, borderRadius: 999, background: on ? 'var(--red)' : 'var(--line)', display: 'flex', alignItems: 'center', padding: 3, transition: '0.2s', border: 'none', flex: 'none' });
const emgKnob = (on) => ({ width: 20, height: 20, borderRadius: '50%', background: '#fff', marginLeft: on ? 'auto' : 0 });
const rowStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '14px 2px', background: 'none', border: 'none', borderTop: '1px solid var(--line)', color: 'var(--ink)', fontWeight: 600, fontSize: '0.95em' };

// Bottom sheet letting the patient route their booking to a different PH hospital.
export function HospitalSheet({ c, S, A, hospitals }) {
  const ref = useRef(null);
  useDismissable(A.toggleHospitalPicker, ref);
  return (
    <div className="scrim" onClick={A.toggleHospitalPicker}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={c.hospitalPickerTitle} tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()}>
        <div style={{ width: 40, height: 4, borderRadius: 999, background: 'var(--line)', margin: '0 auto 14px' }} />
        <div className="overline" style={{ marginBottom: 10 }}>{c.hospitalPickerTitle}</div>
        <div className="stack">
          {hospitals.map((name) => {
            const sel = name === S.hospital;
            return (
              <button
                key={name}
                onClick={() => A.setHospital(name)}
                aria-pressed={sel}
                style={{
                  width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12,
                  borderRadius: 14, padding: '13px 14px',
                  border: sel ? '2px solid var(--primary)' : '1.5px solid var(--line)',
                  background: sel ? 'var(--blue-50)' : 'var(--surface)', color: 'var(--ink)',
                }}
              >
                <span style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--teal-50)', color: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                  <Hospital size={18} />
                </span>
                <span style={{ flex: 1, fontWeight: 700 }}>{name}</span>
                {sel && <Check size={18} color="var(--primary)" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function DemoSheet({ S, A }) {
  const ref = useRef(null);
  useDismissable(A.toggleDemo, ref);
  return (
    <div className="scrim" onClick={A.toggleDemo}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Demo controls" tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()}>
        <div style={{ width: 40, height: 4, borderRadius: 999, background: 'var(--line)', margin: '0 auto 14px' }} />
        <div className="overline" style={{ marginBottom: 4 }}>Demo controls</div>
        <p className="sub" style={{ marginTop: 0, marginBottom: 8 }}>Reviewer shortcuts, not part of the product UI.</p>
        <div style={{ ...rowStyle, borderTop: 'none' }}>
          <span>Emergency triage</span>
          <button onClick={A.toggleEmergency} aria-pressed={S.emergency} aria-label="Toggle emergency triage" style={emgToggle(S.emergency)}>
            <span style={emgKnob(S.emergency)} />
          </button>
        </div>
        <button style={rowStyle} onClick={A.triggerTimeout}>Trigger session timeout</button>
        <button style={rowStyle} onClick={A.openTokens}>Tokens &amp; components</button>
        <button style={{ ...rowStyle, color: 'var(--red)' }} onClick={A.resetFlow}>Reset flow</button>
      </div>
    </div>
  );
}
