// PIN policy, shared by the client inputs and the server routes so they can't
// drift. Newly SET pins must be 6 digits — a 6-digit space (1,000,000) is 100×
// a 4-digit one, which is the single biggest brute-force win for a numeric PIN.
//
// Existing 4–5 digit pins still verify at sign-in (the salted hash doesn't
// encode length), so this is a forward policy on new/changed pins only and
// never locks a current user out.
export const PIN_LENGTH = 6;
export const PIN_RE = /^\d{6}$/;
export const PIN_HELP = "6 digits";
export const PIN_ERROR = "PIN must be 6 digits.";

export function isValidNewPin(pin) {
  return PIN_RE.test(String(pin ?? ""));
}
