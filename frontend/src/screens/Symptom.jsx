import { ScreenHeader, Btn } from '../components/ui.jsx';
import { Mic, Stop, Plus, Warning } from '../components/Icons.jsx';
import { CHIPS } from '../i18n/dict.js';

export default function Symptom({ c, lang, S, A }) {
  const disabled = !S.symptom.trim() || S.thinking;
  const mm = Math.floor(S.recSec / 60);
  const ss = (S.recSec % 60).toString().padStart(2, '0');

  return (
    <div className="screen">
      <ScreenHeader onBack={A.back} step={1} label={c.stepIntake} />
      <h1 className="h1" data-stagger>{c.symptomTitle}</h1>
      <p className="sub" data-stagger>{c.symptomHint}</p>

      <div data-stagger style={{ position: 'relative', marginTop: 16 }}>
        <textarea
          className="field"
          style={{ minHeight: 170 }}
          value={S.symptom}
          onChange={(e) => A.setSymptom(e.target.value)}
          placeholder={c.symptomPlaceholder}
          aria-label={c.symptomTitle}
        />
        {S.recording && (
          <div style={{ position: 'absolute', left: 12, bottom: 12, display: 'flex', alignItems: 'center', gap: 8, background: 'var(--red-50)', color: 'var(--red)', borderRadius: 999, padding: '6px 12px', fontWeight: 700, fontSize: '0.85em' }}>
            <Waveform />
            <span className="mono">{mm}:{ss}</span>
          </div>
        )}
      </div>

      {/* common symptom chips */}
      <div className="overline" data-stagger style={{ marginTop: 16, marginBottom: 8 }}>{c.quickAdd}</div>
      <div data-stagger style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {CHIPS[lang].map((t) => (
          <button key={t} className="chip add" onClick={() => A.addChip(t)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Plus size={15} /> {t}
          </button>
        ))}
      </div>

      {/* mic */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, margin: '22px 0' }}>
        <button
          onClick={A.toggleRec}
          aria-label={S.recording ? c.micStop : c.micTap}
          className={S.recording ? 'pulse-red' : ''}
          style={{ width: 76, height: 76, borderRadius: '50%', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', background: S.recording ? 'var(--red)' : 'var(--primary)' }}
        >
          {S.recording ? <Stop size={26} /> : <Mic size={30} color="#fff" />}
        </button>
        <span style={{ fontSize: '0.85em', fontWeight: 600, color: S.recording ? 'var(--red)' : 'var(--muted)' }}>{S.recording ? c.micStop : c.micTap}</span>
      </div>

      <Btn disabled={disabled} onClick={A.doAnalyze}>
        {S.thinking ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <span className="bounce-dots" style={{ filter: 'brightness(3)' }}><i /><i /><i /></span> {c.thinking}
          </span>
        ) : c.analyze}
      </Btn>

      <div style={{ display: 'flex', gap: 9, marginTop: 16, color: 'var(--amber)', background: 'var(--amber-50)', borderRadius: 14, padding: '12px 14px', fontSize: '0.85em', fontWeight: 600 }} role="note">
        <Warning size={18} /> <span>{c.symptomSafety}</span>
      </div>
    </div>
  );
}

function Waveform() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, height: 14 }} aria-hidden="true">
      {[6, 11, 8, 14, 9, 5, 12].map((h, i) => (
        <span key={i} style={{ width: 2.5, height: h, borderRadius: 2, background: 'var(--red)', animation: `bounce 0.9s ${i * 0.08}s infinite` }} />
      ))}
    </span>
  );
}
