import { useEffect, useState } from 'react';
import { ScreenHeader } from '../components/ui.jsx';
import { Check, Clock } from '../components/Icons.jsx';
import { api } from '../lib/api.js';

const SETTLED = ['paid', 'settled', 'success', 'successful', 'completed'];

const formatDate = (iso, lang) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(lang === 'tl' ? 'fil-PH' : 'en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch { return ''; }
};

// The Payments tab, not just the single-bill checkout flow: shows what's still owed
// (per appointment) alongside a real history of settled bills, pulled from GET /payments.
export default function Payments({ c, lang, S, A }) {
  const [history, setHistory] = useState(null); // null = loading
  const [loadErr, setLoadErr] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const rows = await api.payments();
        if (!alive) return;
        const settled = (Array.isArray(rows) ? rows : [])
          .filter((p) => SETTLED.includes(String(p.status || '').toLowerCase()))
          .sort((a, b) => String(b.paidAt || b.createdAt || '').localeCompare(String(a.paidAt || a.createdAt || '')));
        setHistory(settled);
      } catch { if (alive) setLoadErr(true); }
    })();
    return () => { alive = false; };
  }, []);

  const unpaid = S.appointments.filter((a) => !a.paid);

  return (
    <div className="screen">
      <ScreenHeader onBack={A.back} label={c.paymentsTitle} />
      <h1 className="h1" data-stagger>{c.paymentsTitle}</h1>

      {/* what still needs paying */}
      <div className="overline" style={{ marginTop: 18, marginBottom: 10 }}>{c.paymentsUnpaidSection}</div>
      {unpaid.length > 0 ? (
        <div data-stagger style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {unpaid.map((appt) => (
            <div key={appt.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800 }}>{appt.specialty}</div>
                <div className="sub" style={{ margin: '3px 0 0', fontSize: '0.9em' }}>{appt.hospital}</div>
                <div className="mono" style={{ fontSize: '0.85em', color: 'var(--muted)', marginTop: 2 }}>{appt.refNo}</div>
              </div>
              <button onClick={() => A.goPayment(appt.id)} className="chip add" style={{ fontWeight: 800, flex: 'none' }}>{c.payNow}</button>
            </div>
          ))}
        </div>
      ) : (
        <div data-stagger className="card" style={{ border: '1.5px dashed var(--border)', background: 'transparent', textAlign: 'center' }}>
          <div style={{ fontWeight: 700 }}>{c.paymentsNoUnpaid}</div>
        </div>
      )}

      {/* settled bills */}
      <div className="overline" style={{ marginTop: 24, marginBottom: 4 }}>{c.paymentsHistorySection}</div>
      <p className="sub" style={{ marginBottom: 10, fontSize: '0.88em' }}>{c.paymentsHistorySub}</p>

      {history === null ? (
        <div data-stagger style={{ display: 'flex', justifyContent: 'center', padding: '18px 0' }}>
          <span className="spinner" />
        </div>
      ) : history.length > 0 ? (
        <div data-stagger style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {history.map((p) => (
            <div key={p.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ display: 'flex', gap: 10, minWidth: 0 }}>
                <span style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--green-50)', color: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                  <Check size={17} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800 }}>₱{p.balance ?? p.billAmount}</div>
                  <div className="sub" style={{ margin: '2px 0 0', fontSize: '0.85em', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Clock size={13} />{formatDate(p.paidAt || p.createdAt, lang)}
                  </div>
                  <div className="mono" style={{ fontSize: '0.8em', color: 'var(--muted)', marginTop: 2 }}>{c.paymentsRef}: {p.reference || p.id}</div>
                </div>
              </div>
              <span className="pill green" style={{ flex: 'none' }}>{c.paidBadge}</span>
            </div>
          ))}
        </div>
      ) : (
        <div data-stagger className="card" style={{ border: '1.5px dashed var(--border)', background: 'transparent', textAlign: 'center' }}>
          <div style={{ fontWeight: 700 }}>{loadErr ? c.paymentsNoHistory : c.paymentsNoHistory}</div>
        </div>
      )}
    </div>
  );
}
