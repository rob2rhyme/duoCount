// Server-only PIN hashing with Node's built-in scrypt (no extra deps).
import { scryptSync, randomBytes, timingSafeEqual } from "crypto";

export function hashPin(pin) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(String(pin), salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPin(pin, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  const a = Buffer.from(hash, "hex");
  const b = scryptSync(String(pin), salt, 64);
  return a.length === b.length && timingSafeEqual(a, b);
}
