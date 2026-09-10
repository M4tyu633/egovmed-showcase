import { useRef } from 'react';

// Reusable 6-box code entry with auto-advance + backspace-to-previous. Used by MPIN (masked) and OTP.
export default function PinInput({ length = 6, values, onChange, masked = false, autoFocus = false, ariaLabel }) {
  const refs = useRef([]);
  const setAt = (i, e) => {
    const v = e.target.value.replace(/\D/g, '').slice(-1);
    const arr = [...values];
    arr[i] = v;
    onChange(arr);
    if (v && i < length - 1 && refs.current[i + 1]) refs.current[i + 1].focus();
  };
  const onKey = (i, e) => {
    if (e.key === 'Backspace' && !values[i] && i > 0 && refs.current[i - 1]) refs.current[i - 1].focus();
  };
  return (
    <div className="pin-row" role="group" aria-label={ariaLabel}>
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          value={values[i] || ''}
          onChange={(e) => setAt(i, e)}
          onKeyDown={(e) => onKey(i, e)}
          inputMode="numeric"
          maxLength={1}
          autoFocus={autoFocus && i === 0}
          className={'pin-box' + (masked ? ' masked' : '')}
          aria-label={`Digit ${i + 1}`}
        />
      ))}
    </div>
  );
}
