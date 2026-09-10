import { ScreenHeader, Btn } from '../components/ui.jsx';
import { Shield, Check } from '../components/Icons.jsx';
import { CONSENT_POINTS } from '../i18n/dict.js';

export default function Consent({ c, lang, S, A }) {
  return (
    <div className="screen">
      <ScreenHeader onBack={A.back} step={3} label={c.stepVerify} />
      <div data-stagger style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--blue-50)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 4 }}>
        <Shield size={28} />
      </div>
      <h1 className="h1" data-stagger style={{ marginTop: 16 }}>{c.consentTitle}</h1>
      <p className="sub" data-stagger>{c.consentSub(S.hospital)}</p>

      <div className="card" data-stagger style={{ marginTop: 18 }}>
        <div className="stack">
          {CONSENT_POINTS[lang].map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
              <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--green-50)', color: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', marginTop: 1 }}>
                <Check size={15} />
              </span>
              <span style={{ fontSize: '0.95em', lineHeight: 1.4 }}>{p}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="spacer" style={{ minHeight: 18 }} />
      <div className="stack">
        {/* Wrapped, not passed directly: acceptConsent takes an options object, and onClick would
            hand it a click event whose properties it would then read as options. */}
        <Btn onClick={() => A.acceptConsent()}>{c.consentAccept}</Btn>
        <Btn variant="secondary" onClick={A.declineConsent}>{c.consentDecline}</Btn>
      </div>
    </div>
  );
}
