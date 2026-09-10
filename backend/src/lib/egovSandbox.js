'use strict';

// Public eGovPH sandbox fixtures shipped by the official Login as eGov widget. These identities
// represent fake people, so their SSO demographics cannot legitimately match a tester's real face
// in PhilSys. Keep the recognition server-side and derive it only from the SSO-supplied phone;
// a patient changing their editable contact number must never be able to opt themselves into the
// sandbox verification path.
const SANDBOX_PHONE = /^63909000000[1-5]$/;

function isEgovSandboxPhone(value) {
  const digits = String(value == null ? '' : value).replace(/\D/g, '');
  return SANDBOX_PHONE.test(digits);
}

/**
 * Supports patient rows created before egovSandboxAccount existed without turning an editable
 * contact number into an authorization switch. New logins carry an explicit true/false marker;
 * legacy rows may fall back to the stored phone only when the patient never edited that field.
 */
function isEgovSandboxPatient(patient) {
  if (typeof patient?.egovSandboxAccount === 'boolean') return patient.egovSandboxAccount;
  if ((patient?.manuallyOverriddenFields || []).includes('phone')) return false;
  return isEgovSandboxPhone(patient?.phone);
}

module.exports = { isEgovSandboxPhone, isEgovSandboxPatient };
