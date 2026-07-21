// Auto customer-id helpers — pure. Run: npm run test:customer-id
import { test } from "node:test";
import assert from "node:assert/strict";
import { CROCKFORD, customerIdFromBytes, customerToken, parseCustomerToken } from "../src/lib/customer-id.js";

test("Crockford alphabet is 32 symbols and drops the ambiguous I, L, O, U", () => {
  assert.equal(CROCKFORD.length, 32);
  for (const c of "ILOU") assert.ok(!CROCKFORD.includes(c), `${c} must not be in the alphabet`);
});

test("customerIdFromBytes maps bytes to a fixed-length Crockford code (byte % 32, unbiased)", () => {
  assert.equal(customerIdFromBytes([0, 1, 31, 32, 33], 5), "0" + "1" + "Z" + "0" + "1"); // 32%32=0, 33%32=1
  const id = customerIdFromBytes([255, 128, 64, 200, 10, 99, 7, 250], 8);
  assert.equal(id.length, 8);
  for (const ch of id) assert.ok(CROCKFORD.includes(ch), `${ch} is a Crockford symbol`);
  // deterministic for the same bytes
  assert.equal(customerIdFromBytes([255, 128, 64, 200, 10, 99, 7, 250], 8), id);
  // missing bytes → '0' padding rather than NaN
  assert.equal(customerIdFromBytes([], 4), "0000");
});

test("customerToken names store + customer; lowercases slug; blank when a part is missing", () => {
  assert.equal(customerToken("Acme-Market", "7Q4K9F2M"), "duocount:acme-market:7Q4K9F2M");
  assert.equal(customerToken("acme", ""), "");
  assert.equal(customerToken("", "7Q4K9F2M"), "");
  assert.equal(customerToken(" acme ", " 7Q4K9F2M "), "duocount:acme:7Q4K9F2M");
});

test("parseCustomerToken round-trips customerToken and rejects non-tokens", () => {
  assert.deepEqual(parseCustomerToken("duocount:acme:7Q4K9F2M"), { slug: "acme", customerId: "7Q4K9F2M" });
  assert.deepEqual(parseCustomerToken(customerToken("Acme", "7Q4K9F2M")), { slug: "acme", customerId: "7Q4K9F2M" });
  assert.equal(parseCustomerToken("5551234567"), null);          // a bare phone → fall back
  assert.equal(parseCustomerToken("other:acme:123"), null);      // wrong prefix
  assert.equal(parseCustomerToken("duocount:acme"), null);       // missing id
  assert.equal(parseCustomerToken("duocount::7Q4K"), null);      // missing slug
  assert.equal(parseCustomerToken(""), null);
  assert.equal(parseCustomerToken(null), null);
  // prefix is case-insensitive; a store id containing a colon survives
  assert.deepEqual(parseCustomerToken("DUOCOUNT:acme:AB:12"), { slug: "acme", customerId: "AB:12" });
});
