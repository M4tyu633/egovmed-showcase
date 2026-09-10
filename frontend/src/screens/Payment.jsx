import { useEffect, useState } from 'react';
import { ScreenHeader, Btn } from '../components/ui.jsx';
import { Check } from '../components/Icons.jsx';
import { Pop } from '../components/anim.jsx';
import { PAY_ITEMS, BENEFIT_LINES, CHANNELS, CONST } from '../i18n/dict.js';
import { api } from '../lib/api.js';
import PaymentLogo from '../components/PaymentLogos.jsx';

const BILL = 750; // consultation ₱600 + facility ₱150

export default function Payment({ c, lang, S, A }) {
  const [benefitLines, setBenefitLines] = useState(() => BENEFIT_LINES[lang]);
  const [balance, setBalance] = useState(CONST.balance);

  // Drive benefits + balance from the live eGovPay benefits quote; fall back to the designed values.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const q = await api.quote(BILL);
        if (alive && q && Array.isArray(q.applied)) {
          if (q.applied.length) setBenefitLines(q.applied.map((a) => ({ label: a.label, amount: a.amount > 0 ? '−₱' + a.amount : c.benefitCovered })));
          setBalance('₱' + q.balance);
        }
      } catch { /* keep designed fallback */ }
    })();
    return () => { alive = false; };
  }, [lang]);

  if (S.paid) {
    return (
      <div className="screen" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, justifyContent: 'center', textAlign: 'center' }} role="status">
        <Pop className="checkdisc"><Check size={40} /></Pop>
        <h1 className="h1" style={{ marginTop: 18 }}>{c.settled}</h1>
        <div className="mono" style={{ fontSize: '1.6em', fontWeight: 700, margin: '8px 0' }}>{balance}</div>
        <p className="sub">{c.settledSub}</p>
        <div style={{ minHeight: 20 }} />
        <Btn variant="secondary" onClick={A.resetToHome} style={{ maxWidth: 220 }}>{c.backHome}</Btn>
      </div>
    );
  }

  return (
    <div className="screen">
      <ScreenHeader onBack={A.back} label={c.payTitle} />
      <h1 className="h1" data-stagger>{c.payTitle}</h1>

      {/* itemized bill */}
      <div className="card" data-stagger style={{ marginTop: 16 }}>
        {PAY_ITEMS[lang].map((it, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '0.95em' }}>
            <span>{it.label}</span><span style={{ fontWeight: 700 }}>{it.amount}</span>
          </div>
        ))}
        <div className="rowsep" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span className="overline" style={{ color: 'var(--green)' }}>{c.benefits}</span>
          <span className="pill amber" style={{ fontSize: '0.66em', padding: '3px 8px' }}>{c.mockTag}</span>
        </div>
        {benefitLines.map((b, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: 'var(--green)', fontSize: '0.95em' }}>
            <span>{b.label}</span><span style={{ fontWeight: 700 }}>{b.amount}</span>
          </div>
        ))}
        <div className="rowsep" />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontWeight: 700 }}>{c.balance}</span>
          <span style={{ fontSize: '1.5em', fontWeight: 900 }}>{balance}</span>
        </div>
      </div>

      {/* channels */}
      <div className="overline" style={{ marginTop: 22, marginBottom: 10 }}>{c.payChannelTitle}</div>
      <div className="stack">
        {CHANNELS.map((ch, i) => {
          const sel = S.channel === i;
          return (
            <button
              key={i}
              onClick={() => A.setChannel(i)}
              aria-pressed={sel}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: 14, padding: '13px 15px', minHeight: 60, background: 'var(--surface)', border: sel ? '2px solid var(--primary)' : '1.5px solid var(--line)' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <PaymentLogo abbr={ch[0]} />
                <span style={{ fontWeight: 700 }}>{ch[1]}</span>
              </span>
              <span style={{ width: 22, height: 22, borderRadius: '50%', flex: 'none', border: sel ? '6px solid var(--primary)' : '2px solid var(--line)' }} />
            </button>
          );
        })}
      </div>

      <p className="sub" style={{ marginTop: 10, fontSize: '0.85em' }}>{c.payHostedNote}</p>

      <div style={{ marginTop: 14 }}>
        <Btn disabled={S.channel == null || S.paying} onClick={() => A.doPay(BILL)}>
          {S.paying ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}><span className="spinner white" /> {c.processing}</span> : `${c.payNow} · ${balance}`}
        </Btn>
        {S.flowError && <p role="alert" style={{ color: 'var(--red)', textAlign: 'center', fontWeight: 650, marginTop: 12 }}>{S.flowError}</p>}
      </div>
    </div>
  );
}
