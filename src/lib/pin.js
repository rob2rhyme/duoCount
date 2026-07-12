// PIN policy, shared by the client inputs and the server routes so they can't
// drift. Every PIN the app SETS — at signup, and for staff added or reset in
// Admin — is 6 digits: a 6-digit space (1,000,000) is 100× a 4-digit one, the
// single biggest brute-force win for a numeric PIN. Sign-in asks for the full 6
// digits too (one clear length everywhere), so the login screen can never imply
// a shorter PIN is enough.
//
// The server verifies by salted hash, which doesn't encode length, so it never
// rejects on length alone; if a pre-policy short PIN ever exists it still hashes
// fine and can be reset to 6 digits in Admin.
export const PIN_LENGTH = 6;
export const PIN_RE = /^\d{6}$/;
export const PIN_HELP = "6 digits";
export const PIN_ERROR = "PIN must be 6 digits.";
// A same-length placeholder so the input visibly asks for exactly PIN_LENGTH.
export const PIN_PLACEHOLDER = "•".repeat(PIN_LENGTH);

export function isValidNewPin(pin) {
  return PIN_RE.test(String(pin ?? ""));
}
