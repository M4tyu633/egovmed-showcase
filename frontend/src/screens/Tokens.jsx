import { ScreenHeader, Btn } from '../components/ui.jsx';

const COLORS = [
  ['--primary', '#1452F0'], ['--blue-50', '#EEF3FE'], ['--ink', '#0B0F1A'], ['--muted', '#545E74'],
  ['--line', '#E5E9F2'], ['--canvas', '#F7F9FD'], ['--green', '#177A3A'], ['--amber', '#B45309'],
  ['--red', '#E5484D'], ['--teal', '#0E8C86'], ['--sun', '#FCD116'],
];

export default function Tokens({ A }) {
  return (
    <div className="screen">
      <ScreenHeader onBack={A.back} label="Reference" />
      <h1 className="h1" data-stagger>Tokens &amp; components</h1>
      <p className="sub" data-stagger>Design-system reference (reviewer view).</p>

      <div className="overline" style={{ marginTop: 20, marginBottom: 10 }}>Colors</div>
      <div data-stagger style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        {COLORS.map(([name, hex]) => (
          <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--line)', borderRadius: 12, padding: 8 }}>
            <span style={{ width: 30, height: 30, borderRadius: 8, background: hex, border: '1px solid rgba(0,0,0,.08)', flex: 'none' }} />
            <span style={{ minWidth: 0 }}>
              <span className="mono" style={{ display: 'block', fontSize: 11, fontWeight: 700 }}>{name}</span>
              <span className="mono" style={{ display: 'block', fontSize: 11, color: 'var(--muted)' }}>{hex}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="overline" style={{ marginTop: 22, marginBottom: 10 }}>Type, Geist</div>
      <div data-stagger className="card">
        <div style={{ fontSize: '1.75em', fontWeight: 800 }}>Heading 800</div>
        <div style={{ fontSize: '1em', marginTop: 6 }}>Body text 17px</div>
        <div className="mono" style={{ fontSize: '0.85em', color: 'var(--muted)', marginTop: 6 }}>Geist Mono · REF-1234</div>
      </div>

      <div className="overline" style={{ marginTop: 22, marginBottom: 10 }}>Buttons</div>
      <div data-stagger className="stack">
        <Btn>Primary</Btn>
        <Btn variant="secondary">Secondary</Btn>
        <Btn disabled>Disabled</Btn>
      </div>

      <div className="overline" style={{ marginTop: 22, marginBottom: 10 }}>Chips &amp; pills</div>
      <div data-stagger style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <span className="chip">Chip</span>
        <span className="chip add">+ Add</span>
        <span className="pill green">Verified</span>
        <span className="pill amber">Urgent</span>
        <span className="pill red">Emergency</span>
      </div>
    </div>
  );
}
