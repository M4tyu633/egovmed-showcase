import { useEffect, useRef, useState } from 'react';
import { api, getToken, setToken } from '../lib/api.js';
import { fullNameOf, normalizePhone, splitFullName } from '../lib/profile.js';
import { Btn } from './ui.jsx';

const inputStyle = {
  width: '100%', marginTop: 6, borderRadius: 12, border: '1.5px solid var(--line)',
  padding: '11px 13px', font: 'inherit', background: 'var(--surface)', color: 'var(--ink)',
};

/* Allow mock users to edit their demonstration profile. Create a mock session before calling the authenticated profile endpoint. This panel is unavailable for live SSO accounts. */
export default function ProfileSetup({ c, onSaved, onCancel }) {
  const ref = useRef(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  // Error is held as a code, not a message, so switching language re-renders the current error in
  // the new language instead of leaving a stale English string on screen.
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!getToken()) {
          // No argument: api.login() defaults to THIS DEVICE's demo identity. Passing the literal 'demo'
          // signs in as the shared canonical patient instead, so edits made here landed on a different
          // record than the one the user gets when they actually sign in.
          const res = await api.login();
          if (!res?.token) throw new Error('mock sign-in returned no session token');
          setToken(res.token);
        }
        const me = await api.me();
        if (!alive) return;
        setName(fullNameOf(me));
        setPhone(me?.phone || '');
      } catch {
        // Only the prefill is lost — the fields still type, and the save reports its own failure.
        if (alive) setErr('load');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // The panel opens below the fold on a short viewport, so bring it into view rather than leaving
  // the patient looking at the button they just pressed.
  useEffect(() => { ref.current?.scrollIntoView({ block: 'nearest' }); }, [loading]);

  const submit = async () => {
    if (saving) return;
    const parts = splitFullName(name);
    if (!parts) { setErr('name'); return; }
    const normalized = normalizePhone(phone);
    if (!normalized) { setErr('phone'); return; }
    setErr(null);
    setSaving(true);
    try {
      onSaved(await api.updateContact({ ...parts, phone: normalized }));
    } catch {
      setErr('save');
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') submit();
    if (e.key === 'Escape') onCancel();
  };
  const messages = { load: c.profileSetupOffline, name: c.fullNameInvalid, phone: c.phoneInvalid, save: c.contactSaveError };

  return (
    <section ref={ref} className="card stack" style={{ marginTop: 12, textAlign: 'left' }} aria-label={c.switchAccountTitle}>
      <div>
        <div className="overline">{c.switchAccountTitle}</div>
        <p className="sub" style={{ marginTop: 4 }}>{c.switchAccountSub}</p>
      </div>

      {loading ? (
        <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--muted)', fontWeight: 600 }}>
          <span className="spinner" aria-hidden="true" /> <span>{c.profileSetupLoading}</span>
        </div>
      ) : (
        <>
          <label style={{ display: 'block' }}>
            <span className="overline">{c.fullNameLabel}</span>
            <input
              value={name}
              onChange={(e) => { setName(e.target.value); setErr(null); }}
              onKeyDown={onKeyDown}
              placeholder={c.fullNamePlaceholder}
              autoComplete="name"
              autoFocus
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'block' }}>
            <span className="overline">{c.phoneLabel}</span>
            <input
              value={phone}
              onChange={(e) => { setPhone(e.target.value); setErr(null); }}
              onKeyDown={onKeyDown}
              placeholder={c.phonePlaceholder}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              style={inputStyle}
            />
          </label>
        </>
      )}

      {err && <p role="alert" style={{ color: 'var(--red)', margin: 0, fontSize: '0.85em' }}>{messages[err]}</p>}

      <div style={{ display: 'flex', gap: 10 }}>
        <Btn onClick={submit} disabled={loading || saving} style={{ flex: 1 }}>
          {saving ? c.contactSaving : c.contactSave}
        </Btn>
        <button
          className="btn ghost"
          onClick={onCancel}
          disabled={saving}
          style={{ width: 'auto', flex: 'none', padding: '0 16px' }}
        >
          {c.contactCancel}
        </button>
      </div>
    </section>
  );
}
