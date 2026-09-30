// Local Firebase emulator wiring — the decision half, kept pure so it can be
// tested without booting anything.
//
// Why this exists. Until now the client SDK always talked to the real project
// and `getAdmin()` threw without a real service-account key, so the entire
// signed-in half of the app — counts, countersign, admin, rewards — could only
// be exercised against production data. That made it untestable in CI and
// unauditable locally.
//
// Emulator mode is ONE explicit switch and is never inferred. In particular it
// is not inferred from a missing service-account key: "no key" means
// misconfiguration far more often than it means "use the emulator", and
// guessing wrong in that direction writes test data into somebody's real store.
//
// Two invariants keep it from ever being live in a deployment:
//
//   1. **Loopback only.** The emulator host must be a loopback address. This is
//      the invariant that actually protects data: an emulator pointed at a
//      remote host is the one configuration where "emulator mode" could quietly
//      read or write something real. On a deployed build a loopback host fails
//      closed — the browser reaches the viewer's own machine and gets nothing.
//   2. **Never on Vercel.** Server-side, the flag is refused outright whenever
//      VERCEL is set. Emulators are a local-development tool; there is no
//      emulator on a deployment, so the flag there is always a mistake and
//      should be loud rather than silently degrading.
//
// A third protection comes free from Next: NEXT_PUBLIC_* values are inlined at
// build time, so a production bundle built without the flag has the emulator
// branch compiled out and cannot be switched on at runtime. That only holds if
// callers read the flag as a LITERAL `process.env.NEXT_PUBLIC_…` expression —
// a dynamic lookup like `env[name]` is not substituted, and would read
// undefined in the browser. Hence the shape of the argument below: the caller
// does the reading, this module does the deciding.

export const DEFAULT_FIRESTORE_PORT = 8080;
export const DEFAULT_AUTH_PORT = 9099;

// firebase.json runs singleProjectMode, so the id only has to be stable and
// distinct from any real project.
export const DEFAULT_PROJECT_ID = "duocount-emulator";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]", "0.0.0.0"]);

/** Is `host` unambiguously this machine? Anything else is rejected. */
export function isLoopback(host) {
  if (typeof host !== "string" || !host) return false;
  return LOOPBACK.has(host.trim().toLowerCase());
}

/**
 * Split "host:port" into parts, falling back to `fallbackPort`.
 * Accepts a bare host ("localhost"), a bare port (":9099"), or both. IPv6 is
 * accepted in bracket form, which is how the emulator prints it.
 */
export function parseHostPort(value, fallbackPort) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return { host: "127.0.0.1", port: fallbackPort };

  // Bracketed IPv6: [::1]:8080
  const v6 = raw.match(/^(\[[^\]]+\])(?::(\d+))?$/);
  if (v6) return { host: v6[1], port: v6[2] ? Number(v6[2]) : fallbackPort };

  const idx = raw.lastIndexOf(":");
  if (idx === -1) return { host: raw, port: fallbackPort };

  const host = raw.slice(0, idx);
  const port = Number(raw.slice(idx + 1));
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`emulator: "${raw}" does not end in a valid port`);
  }
  return { host: host || "127.0.0.1", port };
}

/**
 * Resolve emulator configuration, or null when the switch is off.
 *
 * The caller passes values it has already read, so that the client bundle gets
 * literal `process.env.NEXT_PUBLIC_…` reads that Next can inline (see header).
 *
 * @param {object} read
 * @param {string} [read.flag]      NEXT_PUBLIC_FIREBASE_EMULATOR — "1" enables.
 * @param {string} [read.firestore] host[:port] of the Firestore emulator.
 * @param {string} [read.auth]      host[:port] of the Auth emulator.
 * @param {string} [read.projectId] project id to use while emulating.
 * @param {string} [read.vercel]    truthy on any Vercel deployment; server only.
 * @returns {null | {projectId: string, firestore: {host: string, port: number},
 *                   auth: {host: string, port: number}}}
 */
export function emulatorConfig({ flag, firestore, auth, projectId, vercel } = {}) {
  // Strict, not coerced: the one documented spelling turns it on and nothing
  // else does. An env var is always a string, so there is no legitimate caller
  // this rejects — and a safety switch should be hard to trip by accident.
  if (flag !== "1") return null;

  if (vercel) {
    throw new Error(
      "NEXT_PUBLIC_FIREBASE_EMULATOR=1 on a Vercel deployment. There is no " +
      "emulator there — unset it, or the app would be pointed at nothing.",
    );
  }

  const parsed = {
    firestore: parseHostPort(firestore, DEFAULT_FIRESTORE_PORT),
    auth: parseHostPort(auth, DEFAULT_AUTH_PORT),
  };
  for (const [name, hp] of Object.entries(parsed)) {
    if (!isLoopback(hp.host)) {
      throw new Error(
        `emulator: refusing a non-loopback ${name} host "${hp.host}". ` +
        "Emulator mode only ever talks to this machine.",
      );
    }
  }

  return { projectId: projectId || DEFAULT_PROJECT_ID, ...parsed };
}
