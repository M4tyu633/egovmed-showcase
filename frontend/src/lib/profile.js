// Coercion rules for the patient fields PATCH /patients/me accepts. Two screens edit the same
// profile — Account, and the "Not you?" setup panel on sign-in — so the rules live here instead
// of being written twice and drifting apart.

// Accepts common PH mobile formats the user is likely to type (09XX, +63, 63, with or without
// spaces/dashes) and returns canonical E.164 (+63XXXXXXXXXX) or null if it doesn't match.
// Matches the backend's z.string().regex(/^\+63\d{10}$/) after normalization.
export function normalizePhone(raw) {
  const cleaned = String(raw || '').replace(/[\s\-()]/g, '');
  if (/^\+63\d{10}$/.test(cleaned)) return cleaned;
  if (/^63\d{10}$/.test(cleaned)) return '+' + cleaned;
  if (/^09\d{9}$/.test(cleaned)) return '+63' + cleaned.slice(1);
  return null;
}

// The UI asks for one "Full name" — nobody thinks of their name as three form rows — but the
// backend (and eVerify's PhilSys query behind it) wants the parts. Split on whitespace: first
// token is the given name, last token the surname, whatever sits between is the middle name.
//
// Two tokens deliberately yields middleName: '' rather than omitting the key. Omitting it would
// leave the seeded profile's middle name attached to a name the patient just told us is theirs.
//
// Returns null below two tokens: the backend requires a non-empty lastName, so a lone word can't
// fill both halves and the caller should reject it rather than send a half-name.
// Letters only, plus the separators real names actually use: spaces, hyphens (Anne-Marie),
// apostrophes (O'Brien) and periods (Jr.). \p{L} rather than A-Z so ñ and accented characters
// pass — rejecting those would lock out a large share of Filipino names.
const NAME_CHARS = /^[\p{L}\s'.-]+$/u;

// No middle name: the first token is the given name and everything after it is the surname, so
// compound surnames ("Dela Cruz", "Del Rosario") stay intact instead of having their first word
// silently reinterpreted as a middle name. middleName is always cleared — omitting the key would
// leave whatever was already stored, which is how the seeded "Dela" survived an edit.
// One token returns null (rejected client-side): the backend requires a non-empty lastName, and
// guessing which half of a single word is the surname would be worse than asking.
export function splitFullName(raw) {
  const trimmed = String(raw || '').trim();
  if (!NAME_CHARS.test(trimmed)) return null; // digits and symbols are never part of a name
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  return {
    firstName: parts[0],
    middleName: '',
    lastName: parts.slice(1).join(' '),
  };
}

// Inverse of splitFullName, for prefilling that single field from a stored profile.
export const fullNameOf = (patient) => [patient?.firstName, patient?.middleName, patient?.lastName]
  .filter(Boolean).join(' ');
