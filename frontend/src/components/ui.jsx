import { ChevronLeft } from './Icons.jsx';

// Step dots: 4-step flow, the current step (1-based) is the elongated active pill.
export function StepDots({ current, total = 4 }) {
  return (
    <div className="dots" aria-hidden="true">
      {Array.from({ length: total }).map((_, i) => (
        <i key={i} className={i === current - 1 ? 'on' : ''} />
      ))}
    </div>
  );
}

// Per-screen header: back chevron + optional step dots + step label.
export function ScreenHeader({ onBack, step, total = 4, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 40, marginBottom: 6 }}>
      {onBack && (
        <button
          onClick={onBack}
          aria-label="Back"
          style={{ width: 38, height: 38, borderRadius: 999, border: '1.5px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}
        >
          <ChevronLeft size={22} />
        </button>
      )}
      {step != null && <StepDots current={step} total={total} />}
      {label && <span style={{ color: 'var(--muted)', fontSize: '0.82em', fontWeight: 700 }}>{label}</span>}
    </div>
  );
}

export function Btn({ variant = 'primary', disabled, children, style, ...p }) {
  const cls = 'btn ' + (disabled ? 'disabled' : variant);
  return (
    <button className={cls} disabled={disabled} style={style} {...p}>
      {children}
    </button>
  );
}
