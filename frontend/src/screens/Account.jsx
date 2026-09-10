import { useEffect, useState } from 'react';
import { ScreenHeader, Btn } from '../components/ui.jsx';
import { Check, ShieldTick, User, Plus, ChevronRight, Trash } from '../components/Icons.jsx';
import { api } from '../lib/api.js';
import { normalizePhone, splitFullName } from '../lib/profile.js';
import rosaAvatar from '../assets/home-avatar-rosa.png';

const displayName = (patient) => [patient?.firstName, patient?.middleName, patient?.lastName].filter(Boolean).join(' ');

// Real Philippine benefit/discount programs a patient could plausibly have. All of them are now
// wired into the eGovPay benefit engine (see backend paymentService.BENEFIT_RULES) and get a
// working "Add" button — keep this list in sync with BENEFIT_RULES/SUPPORTED_BENEFITS.
const BENEFIT_CATALOG = [
  { key: 'philhealth', label: 'PhilHealth' },
  { key: 'whiteCard', label: 'White Card (indigent)' },
  { key: 'sss', label: 'SSS' },
  { key: 'gsis', label: 'GSIS' },
  { key: 'pagibig', label: 'Pag-IBIG Fund' },
  { key: 'fourps', label: '4Ps (Pantawid Pamilyang Pilipino Program)' },
  { key: 'pwd', label: 'PWD ID discount' },
  { key: 'senior', label: 'Senior Citizen discount' },
  { key: 'soloParent', label: 'Solo Parent ID discount' },
  { key: 'owwa', label: 'OWWA' },
  { key: 'ecc', label: 'ECC (Employees\u2019 Compensation)' },
  { key: 'aics', label: 'DSWD AICS' },
];
const WIRED_BENEFIT_KEYS = BENEFIT_CATALOG.map((b) => b.key);

// Trivial email sanity check — the real validation happens server-side. Just enough to catch
// obvious typos before we round-trip.
const looksLikeEmail = (raw) => /^\S+@\S+\.\S+$/.test(String(raw || '').trim());

// Inline-editable row for name / phone / email. Shows read-only text with an Edit button; when
// editing, swaps to an input + Save/Cancel pair. Validates client-side before submit so bad
// input gets a friendly message rather than a 400 round-trip.
// `normalize` returns the value to submit, or null to reject with `invalidMsg`. Phone and email
// have their own normalizers; a normalizer may also return a whole patch object when one input
// maps onto several API fields, as the full-name row does.
function ContactRow({ field, value, placeholder, label, hint, invalidMsg, c, onSave, editing, setEditing, saving, normalize }) {
  const [draft, setDraft] = useState(value || '');
  const [err, setErr] = useState(null);
  const isEditing = editing === field;
  const missing = !value;

  useEffect(() => { if (isEditing) { setDraft(value || ''); setErr(null); } }, [isEditing, value]);

  const submit = async () => {
    const trimmed = draft.trim();
    if (!trimmed) { setErr(invalidMsg); return; }
    const normalized = normalize
      ? normalize(trimmed)
      : (field === 'phone' ? normalizePhone(trimmed) : (looksLikeEmail(trimmed) ? trimmed.toLowerCase() : null));
    if (!normalized) { setErr(invalidMsg); return; }
    setErr(null);
    await onSave(typeof normalized === 'string' ? { [field]: normalized } : normalized);
  };

  if (isEditing) {
    return (
      <div>
        <div className="overline" style={{ marginBottom: 6 }}>{label}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'stretch' }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setEditing(null); }}
            placeholder={placeholder}
            // The tel keyboard belongs to phone and the all-digit birthDate; a name typed on a
            // numeric keypad is unusable on mobile.
            type={field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text'}
            inputMode={field === 'email' ? 'email' : (field === 'phone' || field === 'birthDate') ? 'tel' : 'text'}
            autoFocus
            style={{ flex: '1 1 160px', minWidth: 0, borderRadius: 12, border: '1.5px solid var(--line)', padding: '10px 13px', font: 'inherit' }}
          />
          <div style={{ display: 'flex', gap: 8, flex: 'none' }}>
            <button onClick={submit} disabled={saving} className="chip add" style={{ fontWeight: 800, padding: '0 14px', flex: 'none' }}>
              {saving ? c.contactSaving : c.contactSave}
            </button>
            <button onClick={() => setEditing(null)} disabled={saving} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', fontWeight: 700, padding: '0 10px', flex: 'none', whiteSpace: 'nowrap' }}>
              {c.contactCancel}
            </button>
          </div>
        </div>
        {err && <p role="alert" style={{ color: 'var(--red)', margin: '6px 0 0', fontSize: '0.85em' }}>{err}</p>}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ overflowWrap: 'anywhere' }}>{value || c.notAvailable}</div>
        {missing && hint && <div className="sub" style={{ margin: '3px 0 0', fontSize: '0.82em' }}>{hint}</div>}
      </div>
      <button onClick={() => setEditing(field)} style={{ background: 'transparent', border: 'none', color: 'var(--primary)', fontWeight: 700, padding: 0, flex: 'none' }}>
        {c.contactEdit}
      </button>
    </div>
  );
}

function BenefitRow({ label, active, removable, busy, onRemove, c }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ fontWeight: 700, minWidth: 0, overflowWrap: 'anywhere' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
        {removable && (
          <button
            onClick={onRemove}
            disabled={busy}
            aria-label={`${c.benefitRemove} ${label}`}
            className="benefit-remove-btn"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 30, height: 30, flex: 'none', borderRadius: '50%', border: 'none',
              background: 'var(--red-50)', color: 'var(--red)',
              opacity: busy ? 0.5 : 1, cursor: busy ? 'default' : 'pointer',
              transition: 'background .15s, transform .1s',
            }}
          >
            {busy ? <span className="spinner" style={{ width: 13, height: 13 }} aria-hidden="true" /> : <Trash size={15} />}
          </button>
        )}
        <span className={active ? 'pill green' : 'pill'} style={active ? undefined : { background: 'var(--line-2)', color: 'var(--muted)' }}>
          {active && <Check size={13} />}{active ? c.benefitOn : c.benefitOff}
        </span>
      </div>
    </div>
  );
}

// Row shown inside the "add a benefit" catalog — already-active benefits are filtered out
// before this renders, so it only ever needs a working Add button (wired programs) or a muted
// "Coming soon" fallback (any program not yet in BENEFIT_RULES).
function CatalogRow({ label, wired, busy, onAdd, c }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ fontWeight: 700 }}>{label}</span>
      {wired ? (
        <button onClick={onAdd} disabled={busy} className="chip add" style={{ fontWeight: 800, padding: '6px 12px', fontSize: '0.85em' }}>
          {busy ? c.benefitAdding : c.benefitAdd}
        </button>
      ) : (
        <span className="pill" style={{ background: 'var(--line-2)', color: 'var(--muted)' }}>{c.benefitComingSoon}</span>
      )}
    </div>
  );
}

export default function Account({ c, S, A }) {
  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showAddBenefit, setShowAddBenefit] = useState(false);
  const [addingKey, setAddingKey] = useState(null);
  const [removingKey, setRemovingKey] = useState(null);
  const [editingField, setEditingField] = useState(null); // 'fullName' | 'phone' | 'email' | 'birthDate' | null
  const [savingContact, setSavingContact] = useState(false);

  // Takes a whole patch rather than one field/value pair — the full-name row rewrites
  // firstName/middleName/lastName together, and they have to land in a single PATCH so the
  // record never sits in a half-renamed state.
  const saveContact = async (patch) => {
    if (savingContact) return;
    setSavingContact(true);
    try {
      const updated = await api.updateContact(patch);
      setPatient(updated);

      A.onPatientUpdated(updated);
      setEditingField(null);
      A.toast(c.contactSaved);
    } catch {
      A.toast(c.contactSaveError);
    } finally {
      setSavingContact(false);
    }
  };

  useEffect(() => {
    let alive = true;
    api.me()
      .then((profile) => { if (alive) setPatient(profile); })
      .catch(() => { if (alive) setError(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const handleAddBenefit = async (key) => {
    if (addingKey) return;
    setAddingKey(key);
    try {
      const updated = await api.activateBenefit(key);
      setPatient(updated);
      A.toast(S.lang === 'tl' ? 'Idinagdag ang benepisyo' : 'Benefit added');
      const label = BENEFIT_CATALOG.find((b) => b.key === key)?.label || key;
      A.notifyBenefitAdded(label);
    } catch {
      A.toast(S.lang === 'tl' ? 'Hindi maidagdag ang benepisyo' : 'Couldn\u2019t add that benefit');
    } finally {
      setAddingKey(null);
    }
  };

  const handleRemoveBenefit = async (key) => {
    if (removingKey) return;
    setRemovingKey(key);
    try {
      const updated = await api.removeBenefit(key);
      setPatient(updated);
      A.toast(S.lang === 'tl' ? 'Inalis ang benepisyo' : 'Benefit removed');
    } catch {
      A.toast(S.lang === 'tl' ? 'Hindi maalis ang benepisyo' : 'Couldn\u2019t remove that benefit');
    } finally {
      setRemovingKey(null);
    }
  };

  const activeBenefits = BENEFIT_CATALOG.filter((b) => patient?.benefits?.[b.key]);
  const addableBenefits = BENEFIT_CATALOG.filter((b) => !patient?.benefits?.[b.key]);

  return (
    <div className="screen">
      <ScreenHeader onBack={A.back} label={c.navAccount} />
      <h1 className="h1" data-stagger>{c.accountTitle}</h1>
      <p className="sub" data-stagger>{c.accountSub}</p>

      {loading ? (
        <div className="card" style={{ marginTop: 18, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10 }}>
          <span className="spinner" aria-hidden="true" />
          <span className="sub" style={{ margin: 0 }}>{c.accountLoading}</span>
        </div>
      ) : error ? (
        <div className="card" role="alert" style={{ marginTop: 18, textAlign: 'center' }}>
          <User size={28} color="var(--muted)" />
          <div style={{ marginTop: 8, fontWeight: 700 }}>{c.accountError}</div>
          <Btn variant="secondary" onClick={A.logout} style={{ marginTop: 14 }}>{c.accountSignInAgain}</Btn>
        </div>
      ) : (
        <>
          <div className="overline" style={{ marginTop: 20, marginBottom: 9 }}>{c.accountProfile}</div>
          <section data-stagger className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
              <img src={rosaAvatar} alt="" style={{ width: 62, height: 62, objectFit: 'cover', borderRadius: '50%', flex: 'none' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '1.08em', fontWeight: 800 }}>{displayName(patient) || c.notAvailable}</div>
                {patient.identityVerified && <span className="pill green" style={{ marginTop: 6 }}><ShieldTick size={14} /> {c.verifiedBadge}</span>}
              </div>
            </div>
            <div className="rowsep" />
            <div className="stack" style={{ color: 'var(--muted)', fontSize: '0.9em' }}>
              {/* Demographics are what eVerify matches against PhilSys. While SSO is mocked the
                  profile is a placeholder ("Juan Dela Cruz"), which can never match a real record,
                  so these stay editable until verification succeeds and the backend locks them.
                  Name is one input instead of three: people know their own name as a whole, and
                  splitFullName rewrites all three API fields on every save so no stale part can
                  linger. */}
              {!patient.demographicsLocked && (
                <ContactRow
                  field="fullName"
                  value={displayName(patient)}
                  placeholder={c.fullNamePlaceholder}
                  label={c.fullNameLabel}
                  invalidMsg={c.fullNameInvalid}
                  normalize={splitFullName}
                  c={c}
                  onSave={saveContact}
                  editing={editingField}
                  setEditing={setEditingField}
                  saving={savingContact}
                />
              )}
              <ContactRow
                field="phone"
                value={patient.phone}
                placeholder={c.phonePlaceholder}
                label={c.phoneLabel}
                hint={c.phoneMissingHint}
                invalidMsg={c.phoneInvalid}
                c={c}
                onSave={saveContact}
                editing={editingField}
                setEditing={setEditingField}
                saving={savingContact}
              />
              <ContactRow
                field="email"
                value={patient.email}
                placeholder={c.emailPlaceholder}
                label={c.emailLabel}
                invalidMsg={c.emailInvalid}
                c={c}
                onSave={saveContact}
                editing={editingField}
                setEditing={setEditingField}
                saving={savingContact}
              />
              {!patient.demographicsLocked && (
                <ContactRow
                  field="birthDate"
                  value={patient.birthDate}
                  placeholder="YYYY-MM-DD"
                  label={c.birthDateLabel}
                  invalidMsg={c.birthDateInvalid}
                  normalize={(v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)}
                  c={c}
                  onSave={saveContact}
                  editing={editingField}
                  setEditing={setEditingField}
                  saving={savingContact}
                />
              )}
            </div>
          </section>

          <div className="overline" style={{ marginTop: 20, marginBottom: 9 }}>{c.accountBenefits}</div>
          <section data-stagger className="card stack">
            {activeBenefits.length > 0 ? activeBenefits.map((b, i) => (
              <div key={b.key}>
                {i > 0 && <div className="rowsep" />}
                <BenefitRow
                  label={b.label}
                  active
                  c={c}
                  removable={showAddBenefit}
                  busy={removingKey === b.key}
                  onRemove={() => handleRemoveBenefit(b.key)}
                />
              </div>
            )) : (
              <p className="sub" style={{ margin: 0 }}>{c.benefitsNone}</p>
            )}
            <div className="rowsep" />
            <button
              onClick={() => setShowAddBenefit((v) => !v)}
              style={{ border: 'none', background: 'transparent', color: 'var(--primary)', padding: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', fontWeight: 800 }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Plus size={16} />{c.benefitAddCta}</span>
              <ChevronRight size={16} style={{ transform: showAddBenefit ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
            </button>
            {showAddBenefit && (
              <>
                <div className="rowsep" />
                {addableBenefits.length > 0 ? (
                  <div className="stack">
                    {addableBenefits.map((b, i) => (
                      <div key={b.key}>
                        {i > 0 && <div className="rowsep" />}
                        <CatalogRow
                          label={b.label}
                          wired={WIRED_BENEFIT_KEYS.includes(b.key)}
                          busy={addingKey === b.key}
                          onAdd={() => handleAddBenefit(b.key)}
                          c={c}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="sub" style={{ margin: 0 }}>{c.benefitCatalogEmpty}</p>
                )}
              </>
            )}
          </section>
        </>
      )}

      <div className="overline" style={{ marginTop: 20, marginBottom: 9 }}>{c.accountPreferences}</div>
      <section data-stagger className="card stack">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span style={{ fontWeight: 700 }}>{c.languageLabel}</span>
          <div className="seg" role="group" aria-label={c.languageLabel}>
            <button className={'chip' + (S.lang === 'en' ? ' add' : '')} aria-pressed={S.lang === 'en'} onClick={() => A.setLang('en')} style={{ border: 'none', padding: '7px 12px' }}>EN</button>
            <button className={'chip' + (S.lang === 'tl' ? ' add' : '')} aria-pressed={S.lang === 'tl'} onClick={() => A.setLang('tl')} style={{ border: 'none', padding: '7px 12px' }}>TL</button>
          </div>
        </div>
        <div className="rowsep" />
        <button onClick={A.cycleText} style={{ border: 'none', background: 'transparent', color: 'var(--ink)', padding: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <span style={{ fontWeight: 700 }}>{c.textSizeLabel}</span>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }} aria-label={`${c.textSizeLabel}: ${S.textScale + 1}/3`}>
            {[0, 1, 2].map((size) => <span key={size} style={{ fontSize: `${0.78 + size * 0.18}em`, color: S.textScale === size ? 'var(--primary)' : 'var(--muted)', fontWeight: 800 }}>A</span>)}
          </span>
        </button>
      </section>

      <Btn data-stagger variant="secondary" onClick={A.logout} style={{ marginTop: 20, color: 'var(--red)', borderColor: 'var(--red)' }}>{c.logout}</Btn>
      <p className="sub" style={{ textAlign: 'center', fontSize: '0.78em', margin: '16px 8px 0' }}>{c.accountAbout}</p>
    </div>
  );
}
