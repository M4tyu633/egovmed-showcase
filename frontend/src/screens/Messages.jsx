import { useEffect, useMemo, useState } from 'react';
import { ScreenHeader, Btn } from '../components/ui.jsx';
import { Bell, Chat, ChevronRight } from '../components/Icons.jsx';
import { CONST } from '../i18n/dict.js';

const kindLabel = (kind, c) => ({
  appointment_confirmation: c.messageConfirmation,
  confirmation: c.messageConfirmation,
  appointment_reminder: c.messageReminder,
  reminder: c.messageReminder,
  results_ready: c.messageResultsReady,
  reply_sent: c.messageReplySent,
  staff_ack: c.messageStaffAck,
}[kind] || c.messageGeneric);

// Message bodies aren't stored server-side (privacy rule — only delivery metadata is persisted),
// so the readable text is composed here from the non-PHI meta the backend does return
// (specialty/hospital/queue no.), rather than showing a generic placeholder for every card.
function messageBody(m, lang, c) {
  const meta = m.meta || {};
  const specialty = meta.specialty || CONST.dept;
  const hospital = meta.hospital || CONST.hospital;
  const queue = meta.queueNumber ? ` #${meta.queueNumber}` : '';
  const isTl = lang === 'tl';
  switch (m.kind) {
    case 'confirmation':
    case 'appointment_confirmation':
      return isTl
        ? `Kumpirmado ang appointment mo sa ${specialty} sa ${hospital}. Pila${queue}.`
        : `Your ${specialty} appointment at ${hospital} is confirmed. Queue${queue}.`;
    case 'reminder':
    case 'appointment_reminder': {
      const days = meta.daysUntil;
      const whenEn = days === 0 ? 'today' : days === 1 ? 'tomorrow' : Number.isFinite(days) ? `in ${days} days` : 'coming up';
      const whenTl = days === 0 ? 'ngayon' : days === 1 ? 'bukas' : Number.isFinite(days) ? `sa loob ng ${days} araw` : 'paparating na';
      return isTl
        ? `Paalala: ang appointment mo sa ${specialty} sa ${hospital} ay ${whenTl}. Pila${queue}.`
        : `Reminder: your ${specialty} appointment at ${hospital} is ${whenEn}. Queue${queue}.`;
    }
    case 'results_ready':
      return isTl ? 'Handa na ang iyong resulta ng lab, tingnan sa Records.' : 'Your lab results are ready, check Records for details.';
    case 'reply_sent':
      return isTl ? 'Naipadala ang iyong mensahe sa PGH Patient Services.' : 'You sent a message to PGH Patient Services.';
    case 'staff_ack':
      return isTl ? 'Natanggap ng PGH Patient Services ang iyong mensahe. Susundan ka nila sa lalong madaling panahon.' : 'PGH Patient Services received your message. They will follow up with you shortly.';
    default:
      return isTl ? 'May bagong update ka mula sa eGovMed.' : 'You have a new update from eGovMed.';
  }
}

const threadKeyOf = (m) => m.meta?.inReplyTo || m.id;
const isOutgoing = (kind) => kind === 'reply_sent';

const channelLabel = (channel, c) => ({
  sms: c.channelSms,
  email: c.channelEmail,
  in_app: c.channelInApp,
}[String(channel || '').toLowerCase()] || String(channel || c.channelInApp).toUpperCase());

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

export default function Messages({ c, lang, S, A }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [openId, setOpenId] = useState(null); // root message id of the open thread
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let alive = true;
    A.loadMessages()
      .catch(() => { if (alive) setError(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const messages = useMemo(
    () => [...S.messages].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))),
    [S.messages],
  );

  const thread = useMemo(() => {
    if (!openId) return [];
    return messages
      .filter((m) => threadKeyOf(m) === openId)
      .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  }, [messages, openId]);

  const rootMessage = thread[0];
  const canReply = openId && openId.startsWith('msg_');

  const send = async () => {
    const text = draft.trim();
    if (!text || sending || !canReply) return;
    setSending(true);
    setDraft('');
    await A.sendMessageReply(openId, text);
    setSending(false);
  };

  if (openId) {
    return (
      <div className="screen" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
        <ScreenHeader onBack={() => setOpenId(null)} label={c.navMessages} />
        <h1 className="h1" data-stagger>{kindLabel(rootMessage?.kind, c)}</h1>

        <div className="stack" style={{ marginTop: 16, flex: 1 }}>
          {thread.map((m) => (
            <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isOutgoing(m.kind) ? 'flex-end' : 'flex-start' }}>
              <div
                className="card"
                style={{
                  maxWidth: '82%', padding: '11px 15px',
                  background: isOutgoing(m.kind) ? 'var(--primary)' : 'var(--surface)',
                  color: isOutgoing(m.kind) ? '#fff' : 'var(--ink)',
                }}
              >
                <div style={{ fontSize: '0.92em', lineHeight: 1.4 }}>{messageBody(m, lang, c)}</div>
              </div>
              <span className="sub" style={{ margin: '4px 4px 0', fontSize: '0.75em' }}>{relativeTime(m.createdAt, lang)}</span>
            </div>
          ))}
          {sending && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div className="card" style={{ padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="bounce-dots"><i /><i /><i /></span>
                <span className="sub" style={{ margin: 0, fontSize: '0.82em' }}>{c.replySending}</span>
              </div>
            </div>
          )}
        </div>

        <div style={{ marginTop: 16 }}>
          {/* Demo-only banner: replies don't reach real hospital staff yet. Kept visible in the
              reply UI so patients aren't misled during the PGH pilot (see messages.routes.js). */}
          <div role="note" style={{
            marginBottom: 10, padding: '10px 12px', borderRadius: 10,
            background: 'var(--yellow-50, #fff8e1)', border: '1px solid var(--yellow, #f5c518)',
            color: 'var(--ink)', fontSize: '0.82em', lineHeight: 1.35,
          }}>
            {c.replyDemoBanner}
          </div>
          {!canReply && <p className="sub" style={{ fontSize: '0.8em', marginBottom: 8 }}>{c.replySyncing}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="field"
              value={draft}
              disabled={!canReply}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
              placeholder={c.replyPlaceholder}
              style={{ borderRadius: 999, padding: '12px 16px' }}
            />
            <Btn onClick={send} disabled={!draft.trim() || sending || !canReply} style={{ width: 'auto', minHeight: 0, padding: '0 20px' }}>
              {c.replySend}
            </Btn>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <ScreenHeader onBack={A.back} label={c.navMessages} />
      <h1 className="h1" data-stagger>{c.messagesTitle}</h1>
      <p className="sub" data-stagger>{c.messagesSub}</p>

      <div data-stagger className="card tint" style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
        <span className="icirc"><Chat size={22} /></span>
        <div>
          <div style={{ fontWeight: 800 }}>{c.messagesIntro}</div>
          <p className="sub" style={{ margin: '4px 0 0', fontSize: '0.88em' }}>{c.messagesIntroSub}</p>
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ marginTop: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <span className="spinner" aria-hidden="true" />
          <span className="sub" style={{ margin: 0 }}>{c.messagesLoading}</span>
        </div>
      ) : error ? (
        <div role="alert" className="card" style={{ marginTop: 18, color: 'var(--red)', textAlign: 'center' }}>{c.messagesError}</div>
      ) : messages.length === 0 ? (
        <div data-stagger className="card" style={{ marginTop: 18, border: '1.5px dashed var(--border)', background: 'transparent', textAlign: 'center' }}>
          <Bell size={28} color="var(--muted)" />
          <div style={{ fontWeight: 700, marginTop: 8 }}>{c.messagesEmpty}</div>
          <p className="sub" style={{ margin: '6px 0 0' }}>{c.messagesEmptySub}</p>
        </div>
      ) : (
        <div className="stack" style={{ marginTop: 18 }}>
          {messages.map((message) => {
            const isReminder = ['appointment_reminder', 'reminder'].includes(message.kind);
            const isReply = ['reply_sent', 'staff_ack'].includes(message.kind);
            return (
              <button
                key={message.id}
                data-stagger
                className="card"
                onClick={() => setOpenId(threadKeyOf(message))}
                style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', border: '1px solid var(--line)', color: 'var(--ink)', font: 'inherit' }}
              >
                <span
                  className="icirc"
                  style={isReminder ? { background: 'var(--amber-50)', color: 'var(--amber)' } : isReply ? { background: 'var(--green-50)', color: 'var(--green)' } : undefined}
                >
                  {isReminder ? <Bell size={21} /> : <Chat size={21} />}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800 }}>{kindLabel(message.kind, c)}</div>
                  <p className="sub" style={{ margin: '3px 0 0', fontSize: '0.85em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {messageBody(message, lang, c)}
                  </p>
                  <div className="sub" style={{ margin: '4px 0 0', display: 'flex', gap: 7, alignItems: 'center', fontSize: '0.85em' }}>
                    <span style={{ fontWeight: 700 }}>{channelLabel(message.channel, c)}</span>
                    <span aria-hidden="true">·</span>
                    <time dateTime={message.createdAt}>{relativeTime(message.createdAt, lang)}</time>
                  </div>
                </div>
                <ChevronRight size={19} color="var(--muted)" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
