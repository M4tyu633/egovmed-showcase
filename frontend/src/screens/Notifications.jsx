import { useMemo } from 'react';
import { ScreenHeader } from '../components/ui.jsx';
import { Bell, FileUp, ShieldCheck, Money, Flag } from '../components/Icons.jsx';

// In-app-only pings: things that happen inside eGovMed but never go out over eMessage/SMS
// (see Messages.jsx for that — real delivery history from the backend). Kept as a separate
// feed/state (`S.notifications`) so the two are never conflated.
const kindLabel = (kind, c) => ({
  record_uploaded: c.notifRecordUploaded,
  benefit_added: c.notifBenefitAdded,
  payment_confirmed: c.notifPaymentConfirmed,
  report_filed: c.notifReportFiled,
  appointment_upcoming: c.notifAppointmentUpcoming,
}[kind] || c.messageGeneric);

const kindIcon = (kind) => ({
  record_uploaded: FileUp,
  benefit_added: ShieldCheck,
  payment_confirmed: Money,
  report_filed: Flag,
  appointment_upcoming: Bell,
}[kind] || Bell);

const kindStyle = (kind) => ({
  record_uploaded: { background: 'var(--blue-50)', color: 'var(--blue)' },
  benefit_added: { background: 'var(--green-50)', color: 'var(--green)' },
  payment_confirmed: { background: 'var(--green-50)', color: 'var(--green)' },
  report_filed: { background: 'var(--amber-50)', color: 'var(--amber)' },
  appointment_upcoming: { background: 'var(--amber-50)', color: 'var(--amber)' },
}[kind] || undefined);

function notificationBody(n, lang, c) {
  const meta = n.meta || {};
  const isTl = lang === 'tl';
  switch (n.kind) {
    case 'record_uploaded': {
      const title = meta.title || (isTl ? 'iyong rekord' : 'your record');
      return isTl ? `Na-save ang "${title}" sa iyong Records.` : `"${title}" was saved to your Records.`;
    }
    case 'benefit_added': {
      const title = meta.title || (isTl ? 'Bagong benepisyo' : 'A benefit');
      return isTl ? `Idinagdag ang ${title} sa iyong account.` : `${title} was added to your account.`;
    }
    case 'payment_confirmed':
      return isTl ? 'Nakumpirma ang bayad mo. Ipinadala ang resibo sa SMS.' : 'Your payment was confirmed. Receipt texted to you.';
    case 'report_filed': {
      const caseNo = meta.caseNo ? ` (${meta.caseNo})` : '';
      return isTl ? `Naisumite ang iyong report${caseNo}.` : `Your report was filed${caseNo}.`;
    }
    case 'appointment_upcoming': {
      const days = meta.daysUntil;
      const specialty = meta.specialty || c.notifAppointmentUpcoming;
      const hospital = meta.hospital || '';
      const whenEn = days === 0 ? 'today' : days === 1 ? 'tomorrow' : Number.isFinite(days) ? `in ${days} days` : 'coming up';
      const whenTl = days === 0 ? 'ngayon' : days === 1 ? 'bukas' : Number.isFinite(days) ? `sa loob ng ${days} araw` : 'paparating na';
      return isTl
        ? `Ang appointment mo sa ${specialty}${hospital ? ` sa ${hospital}` : ''} ay ${whenTl}.`
        : `Your ${specialty} appointment${hospital ? ` at ${hospital}` : ''} is ${whenEn}.`;
    }
    default:
      return isTl ? 'May bagong update ka mula sa eGovMed.' : 'You have a new update from eGovMed.';
  }
}

function relativeTime(iso, lang) {
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return '';
  const seconds = Math.round((time - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  const formatter = new Intl.RelativeTimeFormat(lang === 'tl' ? 'fil' : 'en', { numeric: 'auto' });
  if (abs < 60) return formatter.format(seconds, 'second');
  if (abs < 3600) return formatter.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return formatter.format(Math.round(seconds / 3600), 'hour');
  if (abs < 604800) return formatter.format(Math.round(seconds / 86400), 'day');
  return formatter.format(Math.round(seconds / 604800), 'week');
}

export default function Notifications({ c, lang, S, A }) {
  const notifications = useMemo(
    () => [...S.notifications].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))),
    [S.notifications],
  );

  return (
    <div className="screen">
      <ScreenHeader onBack={A.back} label={c.navNotifications || c.notificationsTitle} />
      <h1 className="h1" data-stagger>{c.notificationsTitle}</h1>
      <p className="sub" data-stagger>{c.notificationsSub}</p>

      {notifications.length === 0 ? (
        <div data-stagger className="card" style={{ marginTop: 18, border: '1.5px dashed var(--border)', background: 'transparent', textAlign: 'center' }}>
          <Bell size={28} color="var(--muted)" />
          <div style={{ fontWeight: 700, marginTop: 8 }}>{c.notificationsEmpty}</div>
          <p className="sub" style={{ margin: '6px 0 0' }}>{c.notificationsEmptySub}</p>
        </div>
      ) : (
        <div className="stack" style={{ marginTop: 18 }}>
          {notifications.map((n) => {
            const Icon = kindIcon(n.kind);
            return (
              <div
                key={n.id}
                data-stagger
                className="card"
                style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', border: '1px solid var(--line)', color: 'var(--ink)' }}
              >
                <span className="icirc" style={kindStyle(n.kind)}>
                  <Icon size={21} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800 }}>{kindLabel(n.kind, c)}</div>
                  <p className="sub" style={{ margin: '3px 0 0', fontSize: '0.85em' }}>
                    {notificationBody(n, lang, c)}
                  </p>
                  <div className="sub" style={{ margin: '4px 0 0', fontSize: '0.85em' }}>
                    <time dateTime={n.createdAt}>{relativeTime(n.createdAt, lang)}</time>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
