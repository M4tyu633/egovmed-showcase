import { useState } from 'react';
import { ScreenHeader, Btn } from '../components/ui.jsx';
import { Hospital, Check, Plus, Trash } from '../components/Icons.jsx';
import { SLOTS, SPECIALTIES, CONST } from '../i18n/dict.js';

export default function Book({ c, lang, S, A }) {
  const [pickingDept, setPickingDept] = useState(false);
  const bookings = S.bookings?.length ? S.bookings : [{ specialty: S.triage?.specialty || CONST.dept, slots: SLOTS[lang], slotsLoading: false, selectedSlot: null }];
  const readyCount = bookings.filter((b) => b.selectedSlot != null).length;
  const availableDepts = SPECIALTIES.filter((sp) => !bookings.some((b) => b.specialty === sp));

  return (
    <div className="screen">
      <ScreenHeader onBack={A.back} step={4} label={c.stepBook} />
      <h1 className="h1" data-stagger>{c.bookTitle}</h1>

      {/* hospital card */}
      <div className="card" data-stagger style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--teal-50)', color: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <Hospital size={24} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800 }}>{S.hospital || CONST.hospital}</div>
          <div style={{ fontSize: '0.85em', fontWeight: 700, color: 'var(--teal)', marginTop: 2 }}>
            {bookings.length > 1 ? `${bookings.length} ${c.deptPre.toLowerCase()}s: ${bookings.map((b) => b.specialty).join(', ')}` : `${c.deptPre}: ${bookings[0]?.specialty}`}
          </div>
        </div>
        <button onClick={A.toggleHospitalPicker} className="chip add" style={{ fontWeight: 800, flex: 'none' }}>{c.changeHospital}</button>
      </div>

      {bookings.length > 1 && (
        <div data-stagger style={{ marginTop: 12, color: 'var(--muted)', background: 'var(--line-2)', borderRadius: 14, padding: '10px 14px', fontSize: '0.82em', lineHeight: 1.4 }}>
          {c.multiApptNote}
        </div>
      )}

      {bookings.map((b) => {
        const slots = b.slots || SLOTS[lang];
        return (
          <div key={b.specialty} style={{ marginTop: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div className="overline">{c.pickSlot} · {b.specialty}</div>
              {bookings.length > 1 && (
                <button
                  onClick={() => A.removeBookingDept(b.specialty)}
                  aria-label={`${c.removeDept} ${b.specialty}`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: 'var(--muted)', fontSize: '0.82em', fontWeight: 700 }}
                >
                  <Trash size={14} /> {c.removeDept}
                </button>
              )}
            </div>

            {b.slotsLoading ? (
              <div className="stack" role="status">
                {[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 60, borderRadius: 14 }} />)}
                <p className="sub" style={{ textAlign: 'center' }}>{c.loadingSlots}</p>
              </div>
            ) : (
              <div className="stack">
                {slots.map((s, i) => {
                  const disabled = s[2];
                  const sel = b.selectedSlot === i;
                  return (
                    <button
                      key={i}
                      disabled={disabled}
                      onClick={() => A.selectBookingSlot(b.specialty, i)}
                      aria-pressed={sel}
                      style={{
                        width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        borderRadius: 14, padding: '15px 16px', minHeight: 60,
                        border: disabled ? '1.5px solid var(--line-2)' : sel ? '2px solid var(--primary)' : '1.5px solid var(--line)',
                        background: disabled ? 'var(--line-2)' : sel ? 'var(--blue-50)' : 'var(--surface)',
                        color: disabled ? '#9aa6ba' : 'var(--ink)',
                      }}
                    >
                      <span>
                        <span style={{ display: 'block', fontWeight: 700 }}>{s[0]}</span>
                        <span style={{ display: 'block', fontSize: '0.82em', color: 'var(--muted)' }}>{b.specialty}</span>
                      </span>
                      <span style={{ width: 22, height: 22, borderRadius: '50%', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: sel ? 'var(--primary)' : 'transparent', border: sel ? 'none' : '2px solid var(--line)' }}>
                        {sel && <Check size={14} color="#fff" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Add another department for this same visit (e.g. General Medicine + Cardiology) */}
      <div style={{ marginTop: 18 }}>
        {pickingDept ? (
          <div className="card tint" data-stagger>
            <div style={{ fontWeight: 800, marginBottom: 10 }}>{c.pickDeptTitle}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {availableDepts.map((sp) => (
                <button
                  key={sp}
                  className="chip add"
                  onClick={() => { A.addBookingDept(sp); setPickingDept(false); }}
                >
                  {sp}
                </button>
              ))}
            </div>
          </div>
        ) : (
          availableDepts.length > 0 && (
            <button
              onClick={() => setPickingDept(true)}
              className="chip add"
              style={{ width: '100%', justifyContent: 'center', display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 800 }}
            >
              <Plus size={16} /> {c.addAnotherDept}
            </button>
          )
        )}
      </div>

      <div style={{ marginTop: 20 }}>
        <Btn disabled={readyCount === 0 || S.booking} onClick={A.doBook}>
          {S.booking ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}><span className="spinner white" /> {c.bookingN(bookings.length)}</span> : c.confirmBookN(readyCount)}
        </Btn>
      </div>
    </div>
  );
}
