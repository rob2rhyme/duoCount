import test from "node:test";
import assert from "node:assert/strict";
import {
  emulatorConfig, isLoopback, parseHostPort,
  DEFAULT_FIRESTORE_PORT, DEFAULT_AUTH_PORT, DEFAULT_PROJECT_ID,
} from "../src/lib/emulator.js";

test("the switch is off unless it is exactly \"1\"", () => {
  // Anything vague reads as off. A half-set flag must not half-enable a mode
  // whose whole job is to keep test writes away from a real project.
  for (const flag of [undefined, null, "", "0", "false", "true", "yes", "on", 1, "1 "]) {
    assert.equal(emulatorConfig({ flag }), null, JSON.stringify(flag));
  }
  assert.notEqual(emulatorConfig({ flag: "1" }), null);
});

test("a Vercel deployment refuses the flag outright", () => {
  // There is no emulator on a deployment, so the flag there is always a
  // mistake. Failing loudly beats pointing the app at a port nobody serves.
  for (const vercel of ["1", "production", "preview"]) {
    assert.throws(() => emulatorConfig({ flag: "1", vercel }), /Vercel/);
  }
  // ...and an unset VERCEL is the normal local case.
  assert.notEqual(emulatorConfig({ flag: "1", vercel: undefined }), null);
});

test("a non-loopback host is refused on either emulator", () => {
  // This is the invariant that actually protects data: "emulator mode" aimed
  // at a remote host is the one shape where it could touch something real.
  const remotes = ["10.0.0.5", "192.168.1.9", "firestore.googleapis.com",
    "evil.example.com", "example.com:8080"];
  for (const host of remotes) {
    assert.throws(() => emulatorConfig({ flag: "1", firestore: host }),
      /non-loopback/, `firestore ${host}`);
    assert.throws(() => emulatorConfig({ flag: "1", auth: host }),
      /non-loopback/, `auth ${host}`);
  }
});

test("loopback spellings are all accepted", () => {
  for (const host of ["127.0.0.1", "localhost", "LOCALHOST", "[::1]", "0.0.0.0"]) {
    assert.ok(isLoopback(host), host);
    const cfg = emulatorConfig({ flag: "1", firestore: host });
    assert.equal(cfg.firestore.host, host);
  }
  for (const host of ["", null, undefined, 42, "127.0.0.2", "notlocalhost"]) {
    assert.equal(isLoopback(host), false, String(host));
  }
});

test("defaults fill in when only some of the address is given", () => {
  const cfg = emulatorConfig({ flag: "1" });
  assert.deepEqual(cfg.firestore, { host: "127.0.0.1", port: DEFAULT_FIRESTORE_PORT });
  assert.deepEqual(cfg.auth, { host: "127.0.0.1", port: DEFAULT_AUTH_PORT });
  assert.equal(cfg.projectId, DEFAULT_PROJECT_ID);

  assert.deepEqual(parseHostPort("localhost", 8080), { host: "localhost", port: 8080 });
  assert.deepEqual(parseHostPort("localhost:9199", 8080), { host: "localhost", port: 9199 });
  assert.deepEqual(parseHostPort(":9199", 8080), { host: "127.0.0.1", port: 9199 });
  assert.deepEqual(parseHostPort("[::1]:9199", 8080), { host: "[::1]", port: 9199 });
  assert.deepEqual(parseHostPort("[::1]", 8080), { host: "[::1]", port: 8080 });
  assert.deepEqual(parseHostPort("  ", 8080), { host: "127.0.0.1", port: 8080 });
});

test("a malformed port is an error, not a silent default", () => {
  // Silently falling back would send traffic somewhere the operator did not
  // ask for, which is the same class of bug as guessing the host.
  for (const bad of ["localhost:", "localhost:0", "localhost:70000", "localhost:abc"]) {
    assert.throws(() => parseHostPort(bad, 8080), /valid port/, bad);
  }
});

test("the caller's project id wins, and the two emulators are independent", () => {
  const cfg = emulatorConfig({
    flag: "1", projectId: "acme-dev",
    firestore: "127.0.0.1:8111", auth: "localhost:9222",
  });
  assert.equal(cfg.projectId, "acme-dev");
  assert.deepEqual(cfg.firestore, { host: "127.0.0.1", port: 8111 });
  assert.deepEqual(cfg.auth, { host: "localhost", port: 9222 });
});

test("no argument at all is off, not a crash", () => {
  // firebase.js calls this during module init on every page load, including
  // SSR and prerender. It must never be the thing that breaks a build.
  assert.equal(emulatorConfig(), null);
  assert.equal(emulatorConfig({}), null);
});
