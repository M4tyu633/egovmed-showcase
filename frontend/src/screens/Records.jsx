import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ScreenHeader, Btn } from '../components/ui.jsx';
import { Check, ShieldTick, HeartPulse, FileUp, ChevronRight } from '../components/Icons.jsx';
import { RECORDS } from '../i18n/dict.js';
import { api } from '../lib/api.js';

const demo = (lang) => RECORDS[lang].map((r, i) => ({
  id: `demo_${i}`, name: r[0], date: r[1], source: r[2], verified: true, isDemo: true,
}));

const formatDate = (iso, lang) => (iso
  ? new Date(iso).toLocaleDateString(lang === 'tl' ? 'fil-PH' : 'en-PH', { day: '2-digit', month: 'short', year: 'numeric' })
  : '');

// Split an AI-generated multi-line summary into bullet items. eGovAI returns either markdown-style
// dashes/asterisks or the fallback's newline-joined bullets — accept both.
const splitBullets = (text) => String(text || '')
  .split(/\r?\n/)
  .map((l) => l.replace(/^\s*[-*•·]\s*/, '').trim())
  .filter(Boolean);

export default function Records({ c, lang, S, A }) {
  // Every /records route is gated server-side on identityVerified, so an unverified patient gets
  // "Identity must be verified before accessing records" from the list, the upload, and the
  // summary alike. A patient created by real eGovPH SSO starts unverified, which is why this only
  // ever showed up outside mock testing. null means /patients/me hasn't answered yet — only an
  // explicit false locks the screen, so a backend outage still falls back to the demo records.
  // 'loading' until /records answers, then 'ready' or 'locked'. Records used to derive its lock
  // purely from S.identityVerified, which App fills in from /patients/me on boot — a different
  // request on a different clock. Between the two the screen rendered the demo records unlocked
  // and then swapped to the lock card seconds later, which is the "records change by themselves"
  // report. Now the screen's own request decides, and nothing renders until it has.
  const [gate, setGate] = useState(() => (S.identityVerified === false ? 'locked' : 'loading'));
  // App's answer still counts when it lands first, so a patient it already knows is unverified
  // gets the lock card immediately instead of a spinner they have to sit through.
  const locked = gate === 'locked' || S.identityVerified === false;
  const settling = gate === 'loading' && !locked;
  const [records, setRecords] = useState(() => demo(lang));
  const [openId, setOpenId] = useState(null); // record id whose detail sheet is open
  const [summary, setSummary] = useState(null); // { summary: string, verifiedLabs: [], recordCount, triageCount }
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryOpen, setSummaryOpen] = useState(false); // health summary starts collapsed
  const [uploading, setUploading] = useState(false); // whether the upload sheet is open

  // Patient-uploaded record — file content itself isn't sent anywhere (no OCR/storage yet, just
  // metadata), so the doctor summary and record list can still reference what was added.
  const addUploadedRecord = (saved) => {
    setRecords((prev) => [{
      id: saved.id,
      name: saved.title,
      date: formatDate(saved.createdAt, lang),
      source: saved.sourceFacility,
      type: saved.type,
      summary: saved.summary,
      verified: !!(saved.anchor && saved.anchor.verified),
      isDemo: false,
    }, ...prev]);
    A.notifyRecordUploaded(saved);
  };

  // The eGovChain-anchored list. Deliberately NOT awaited alongside the doctor summary any more:
  // Promise.all held the record list back until the eGov AI generation returned, so the list
  // appeared seconds after the screen did even when /records had answered straight away.
  useEffect(() => {
    if (S.identityVerified === false) { setGate('locked'); return undefined; }
    let alive = true;
    api.records().then((list) => {
      if (!alive) return;
      if (Array.isArray(list) && list.length) {
        setRecords(list.map((r) => ({
          id: r.id,
          name: r.title,
          date: formatDate(r.createdAt, lang),
          source: r.sourceFacility,
          type: r.type,
          summary: r.summary,
          verified: !!(r.anchor && r.anchor.verified),
          isDemo: false,
        })));
      }
      setGate('ready');
    }).catch((err) => {
      if (!alive) return;
      // The verification gate is the only failure with a different answer. Anything else — the
      // backend cold-starting, a dropped connection — keeps the demo records rather than telling
      // a verified patient their identity is the problem.
      setGate(err?.data?.error?.code === 'identity_not_verified' ? 'locked' : 'ready');
    });
    return () => { alive = false; };
  }, [lang, S.identityVerified]);

  // The AI summary on its own clock. It is the slowest call on the screen and nothing else
  // depends on it, so it renders its own skeleton and never delays the records.
  useEffect(() => {
    if (locked) { setSummaryLoading(false); return undefined; }
    let alive = true;
    setSummaryLoading(true);
    api.doctorSummary()
      .then((sum) => { if (alive) setSummary(sum); })
      .catch(() => { /* the summary is an extra, not the point of the screen */ })
      .finally(() => { if (alive) setSummaryLoading(false); });
    return () => { alive = false; };
  }, [lang, locked]);

  return (
    <div className="screen">
      <ScreenHeader onBack={A.back} label={c.recordsTitle} />
      <h1 className="h1" data-stagger>{c.recordsTitle}</h1>
      <p className="sub" data-stagger>{c.recordsSub}</p>
      {settling ? (
        // Neither the upload button nor the lock card, because we do not know yet which one this
        // patient gets. Rendering a guess here is what made the screen rearrange itself.
        <div data-stagger className="card" style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--muted)', fontWeight: 600 }} role="status">
          <span className="spinner" />
          <span>{lang === 'tl' ? 'Kinukuha ang iyong mga rekord…' : 'Fetching your records…'}</span>
        </div>
      ) : locked ? (
        <div data-stagger className="card" style={{ marginTop: 16, textAlign: 'center' }}>
          <span className="icirc" style={{ width: 44, height: 44, background: 'var(--blue-50)', margin: '2px auto 12px' }}>
            <ShieldTick size={22} color="var(--primary)" />
          </span>
          <h2 className="h2" style={{ margin: 0 }}>{c.recordsLockedTitle}</h2>
          <p className="sub" style={{ marginTop: 8 }}>{c.recordsLockedBody}</p>
          <div style={{ marginTop: 16 }}>
            <Btn onClick={A.startVerificationFromRecords}>{c.recordsLockedAction}</Btn>
          </div>
        </div>
      ) : (
        <button
          data-stagger
          onClick={() => setUploading(true)}
          className="card"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14, border: '1.5px dashed var(--border)', background: 'transparent', color: 'var(--primary)', fontWeight: 700, width: '100%' }}
        >
          <FileUp size={18} /> {c.uploadRecord}
        </button>
      )}

      {!locked && !settling && (summary || summaryLoading) && (
        <div data-stagger className="card tint" style={{ marginTop: 16 }}>
          <button
            onClick={() => setSummaryOpen((v) => !v)}
            aria-expanded={summaryOpen}
            style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: 'none', border: 'none', padding: 0, marginBottom: summaryOpen ? 8 : 0, textAlign: 'left' }}
          >
            <span className="icirc" style={{ width: 32, height: 32, background: 'rgba(20,82,240,.14)', flex: 'none' }}><HeartPulse size={18} color="var(--primary)" /></span>
            <span className="overline" style={{ color: 'var(--primary)', flex: 1 }}>{lang === 'tl' ? 'Buod ng iyong kalusugan' : 'Your health summary'}</span>
            <ChevronRight size={18} color="var(--primary)" style={{ flex: 'none', transform: summaryOpen ? 'rotate(-90deg)' : 'rotate(90deg)', transition: 'transform 0.15s ease' }} />
          </button>
          {summaryOpen && (summaryLoading ? (
            <div className="sub">{lang === 'tl' ? 'Sinusuri ang iyong rekord…' : 'Reviewing your records…'}</div>
          ) : (
            <>
              <ul style={{ margin: '4px 0 8px', paddingLeft: 18, lineHeight: 1.5, fontSize: '0.95em' }}>
                {splitBullets(summary.summary).slice(0, 4).map((line, i) => (
                  <li key={i} style={{ marginTop: i === 0 ? 0 : 4 }}>{line}</li>
                ))}
              </ul>
              <div style={{ fontSize: '0.78em', color: 'var(--muted)', fontWeight: 600, marginTop: 6 }}>
                {lang === 'tl'
                  ? `Batay sa ${summary.recordCount} rekord${summary.recordCount === 1 ? '' : 's'} at ${summary.triageCount} triage · AI, kailangan pa ring i-confirm ng doktor`
                  : `From ${summary.recordCount} record${summary.recordCount === 1 ? '' : 's'} and ${summary.triageCount} triage · AI, still needs doctor confirmation`}
              </div>
            </>
          ))}
        </div>
      )}

      <div className="stack" style={{ marginTop: 18 }}>
        {!locked && !settling && records.map((r) => (
          <button
            key={r.id}
            data-stagger
            className="card"
            onClick={() => setOpenId(r.id)}
            style={{ display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit' }}
            aria-label={`${r.name}, ${r.date}, ${lang === 'tl' ? 'pindutin para tingnan ang detalye' : 'tap for details'}`}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div>
                <div style={{ fontWeight: 800 }}>{r.name}</div>
                <div className="sub" style={{ margin: '3px 0 0' }}>{r.date}</div>
              </div>
              {r.verified && <span className="pill green"><Check size={13} /> {c.verifiedBadge}</span>}
            </div>
            <div className="rowsep" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--teal)', fontSize: '0.88em', fontWeight: 600 }}>
              <ShieldTick size={17} />
              <span style={{ color: 'var(--muted)' }}>{c.verifiedFrom} <b style={{ color: 'var(--ink)' }}>{r.source}</b></span>
            </div>
          </button>
        ))}
      </div>

      {openId && <RecordSheet record={records.find((r) => r.id === openId)} lang={lang} c={c} onClose={() => setOpenId(null)} />}
      {uploading && (
        <UploadSheet
          lang={lang}
          c={c}
          locked={locked}
          onVerify={() => { setUploading(false); A.startVerificationFromRecords(); }}
          onClose={() => setUploading(false)}
          onSaved={(saved) => { addUploadedRecord(saved); setUploading(false); }}
        />
      )}
    </div>
  );
}

const RECORD_TYPES = [
  ['lab', (c) => c.recordTypeLab],
  ['imaging', (c) => c.recordTypeImaging],
  ['prescription', (c) => c.recordTypePrescription],
  ['other', (c) => c.recordTypeOther],
];

function UploadSheet({ lang, c, locked, onVerify, onClose, onSaved }) {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [type, setType] = useState('lab');
  const [source, setSource] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async () => {
    // POST /records is behind the same verification gate as the list. The sheet is unreachable
    // while locked, but the flag can flip under an already-open sheet, and a filled-in form
    // rejected with a backend string is a worse answer than the flow that fixes it.
    if (locked) { onVerify(); return; }
    if (!file) { setError(c.uploadRecordNeedFile); return; }
    if (title.trim().length < 2) { setError(c.uploadRecordTitleTooShort); return; }
    if (source.trim() && source.trim().length < 2) { setError(c.uploadRecordSourceTooShort); return; }
    setError(null);
    setSaving(true);
    try {
      // No OCR/camera reading yet — we just record what was attached (name/type/size) as
      // metadata alongside the fields the patient filled in.
      const saved = await api.createRecord({
        type,
        title: title.trim(),
        sourceFacility: source.trim() || undefined,
        summary: (lang === 'tl' ? 'In-upload ng pasyente: ' : 'Uploaded by patient: ') + file.name,
        data: { fileName: file.name, fileType: file.type || 'unknown', fileSizeBytes: file.size },
      });
      onSaved(saved);
    } catch (e) {
      const detail = Array.isArray(e.data?.error?.details) && e.data.error.details[0];
      setError((detail && `${detail.path}: ${detail.message}`) || e.message || c.uploadRecordError);
    } finally {
      setSaving(false);
    }
  };

  const overlay = (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={c.uploadRecord} onClick={(e) => e.stopPropagation()} style={{ maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ width: 40, height: 4, borderRadius: 999, background: 'var(--line)', margin: '0 auto 14px' }} />
        <h2 className="h2" style={{ margin: '0 0 14px' }}>{c.uploadRecord}</h2>

        <div className="stack">
          <div>
            <label className="overline" style={{ display: 'block', marginBottom: 6 }}>{c.uploadRecordFile}</label>
            <label
              style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 12, border: '1.5px dashed var(--border)', padding: '11px 13px', cursor: 'pointer', fontWeight: 600, color: file ? 'var(--ink)' : 'var(--muted)' }}
            >
              <FileUp size={18} color="var(--primary)" />
              {file ? `${file.name} · 1 ${c.uploadRecordChosen}` : c.uploadRecordChoose}
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
              />
            </label>
          </div>

          <div>
            <label className="overline" style={{ display: 'block', marginBottom: 6 }}>{c.uploadRecordTitle}</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={c.uploadRecordTitlePh}
              style={{ width: '100%', borderRadius: 12, border: '1.5px solid var(--line)', padding: '11px 13px', font: 'inherit' }}
            />
          </div>

          <div>
            <label className="overline" style={{ display: 'block', marginBottom: 6 }}>{c.uploadRecordType}</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {RECORD_TYPES.map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setType(key)}
                  aria-pressed={type === key}
                  className="chip"
                  style={{ background: type === key ? 'var(--primary)' : 'var(--surface)', color: type === key ? '#fff' : 'var(--ink)', border: type === key ? 'none' : '1.5px solid var(--line)', fontWeight: 700 }}
                >
                  {label(c)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="overline" style={{ display: 'block', marginBottom: 6 }}>{c.uploadRecordSource}</label>
            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder={c.uploadRecordSourcePh}
              style={{ width: '100%', borderRadius: 12, border: '1.5px solid var(--line)', padding: '11px 13px', font: 'inherit' }}
            />
          </div>
        </div>

        {error && <p role="alert" style={{ color: 'var(--red)', fontSize: '0.9em', marginTop: 12 }}>{error}</p>}

        <div className="stack" style={{ marginTop: 18 }}>
          <Btn onClick={submit} disabled={saving}>
            {locked ? c.recordsLockedAction
              : saving ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}><span className="spinner white" /> {c.uploadRecordSaving}</span>
                : c.uploadRecordSave}
          </Btn>
          <Btn variant="secondary" onClick={onClose}>{c.uploadRecordCancel}</Btn>
        </div>
      </div>
    </div>
  );

  const host = typeof document !== 'undefined' ? document.querySelector('.device') : null;
  return host ? createPortal(overlay, host) : overlay;
}

function RecordSheet({ record, lang, c, onClose }) {
  const [detail, setDetail] = useState(null);
  const [verify, setVerify] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Escape to close
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (!record) return;
    if (record.isDemo) {
      // Deterministic sample content that matches the design's demo intent
      setDetail({
        title: record.name, sourceFacility: record.source, summary: record.summary || 'CBC within normal limits; mild anemia noted.',
        data: { hemoglobin: '11.2 g/dL', wbc: '7.5 x10^9/L', platelets: '250 x10^9/L', interpretation: 'Mild anemia; otherwise within normal limits' },
        anchor: null,
      });
      setVerify({ verified: true, integrityOk: true, anchoredOnChain: true, badge: `Verified from ${record.source}` });
      setLoading(false);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const [d, v] = await Promise.all([api.getRecord(record.id), api.verifyRecord(record.id)]);
        if (alive) { setDetail(d); setVerify(v); }
      } catch (e) {
        if (alive) setError(e.message || (lang === 'tl' ? 'Hindi ma-load ang rekord' : 'Could not load record'));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [record, lang]);

  if (!record) return null;
  const short = (s) => (s && s.length > 20 ? s.slice(0, 10) + '…' + s.slice(-8) : s);
  const entries = detail && detail.data && typeof detail.data === 'object' && !Array.isArray(detail.data)
    ? Object.entries(detail.data)
    : [];

  const overlay = (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={record.name} onClick={(e) => e.stopPropagation()} style={{ maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ width: 40, height: 4, borderRadius: 999, background: 'var(--line)', margin: '0 auto 14px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div className="overline">{record.type || (lang === 'tl' ? 'Lab' : 'Lab')}</div>
            <h2 className="h2" style={{ margin: '4px 0 0' }}>{record.name}</h2>
            <div className="sub" style={{ margin: '2px 0 0' }}>{record.date}</div>
          </div>
          {verify?.verified && <span className="pill green"><Check size={13} /> {c.verifiedBadge}</span>}
        </div>

        <div className="rowsep" />

        {loading ? (
          <div className="sub" style={{ textAlign: 'center' }}>Loading…</div>
        ) : error ? (
          <div role="alert" style={{ color: 'var(--red)', fontSize: '0.9em', textAlign: 'center' }}>{error}</div>
        ) : (
          <>
            {detail?.summary && (
              <div className="card tint" style={{ marginBottom: 12 }}>
                <div className="overline" style={{ marginBottom: 6 }}>{lang === 'tl' ? 'Buod' : 'Summary'}</div>
                <div style={{ fontSize: '0.95em', lineHeight: 1.45 }}>{detail.summary}</div>
              </div>
            )}

            {entries.length > 0 && (
              <>
                <div className="overline" style={{ marginBottom: 8 }}>{lang === 'tl' ? 'Mga Resulta' : 'Results'}</div>
                <div className="stack" style={{ marginBottom: 14 }}>
                  {entries.map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, borderBottom: '1px solid var(--line)', padding: '8px 0' }}>
                      <span style={{ color: 'var(--muted)', fontWeight: 600, textTransform: 'capitalize', fontSize: '0.9em' }}>{String(k).replace(/_/g, ' ')}</span>
                      <span style={{ fontWeight: 700, textAlign: 'right', wordBreak: 'break-word' }}>{String(v)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="overline" style={{ marginTop: 4, marginBottom: 8 }}>{lang === 'tl' ? 'Pinagmulan at Verification' : 'Source & Verification'}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
              <ShieldTick size={18} color="var(--teal)" />
              <span style={{ color: 'var(--muted)' }}>{c.verifiedFrom} <b style={{ color: 'var(--ink)' }}>{record.source}</b></span>
            </div>
            {detail?.anchor && (
              <div className="card" style={{ background: 'var(--line-2)', border: 'none', fontSize: '0.82em', color: 'var(--muted)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><span>{lang === 'tl' ? 'Fingerprint' : 'Content hash'}</span><span className="mono" style={{ color: 'var(--ink)' }}>{short(detail.anchor.hash)}</span></div>
                {detail.anchor.txHash && <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 4 }}><span>{lang === 'tl' ? 'Chain tx' : 'Chain tx'}</span><span className="mono" style={{ color: 'var(--ink)' }}>{short(detail.anchor.txHash)}</span></div>}
                {detail.anchor.anchoredAt && <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 4 }}><span>{lang === 'tl' ? 'Naka-anchor noong' : 'Anchored at'}</span><span style={{ color: 'var(--ink)' }}>{formatDate(detail.anchor.anchoredAt, lang)}</span></div>}
                {verify && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
                    <span>{lang === 'tl' ? 'Katunayan' : 'Integrity'}</span>
                    <span style={{ color: verify.integrityOk ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>
                      {verify.integrityOk ? (lang === 'tl' ? 'Hindi binago' : 'Untampered') : (lang === 'tl' ? 'Nabago' : 'Tampered')}
                    </span>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        <div style={{ marginTop: 16 }}>
          <Btn variant="secondary" onClick={onClose}>{lang === 'tl' ? 'Isara' : 'Close'}</Btn>
        </div>
      </div>
    </div>
  );

  const host = typeof document !== 'undefined' ? document.querySelector('.device') : null;
  return host ? createPortal(overlay, host) : overlay;
}
