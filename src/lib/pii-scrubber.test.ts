/**
 * PII/PHI scrubber tests — 5 cases covering each detection category.
 * Run with: bun run src/lib/pii-scrubber.test.ts
 */
import { strict as assert } from "node:assert";
import {
  scrubPII,
  REDACTED_SSN,
  REDACTED_CC,
  REDACTED_DOB,
  REDACTED_PHONE,
} from "./pii-scrubber";

type TestCase = { name: string; fn: () => void };
const tests: TestCase[] = [];

function test(name: string, fn: () => void) {
  tests.push({ name, fn });
}

// 1. SSN redaction
test("redacts SSN (xxx-xx-xxxx)", () => {
  const r = scrubPII("My social is 123-45-6789, please keep it private.");
  assert.ok(!r.scrubbedText.includes("123-45-6789"));
  assert.ok(r.scrubbedText.includes(REDACTED_SSN));
  assert.ok(r.redactions.includes(`SSN → ${REDACTED_SSN}`));
  assert.equal(r.containsPHI, false);
});

// 2. Credit card redaction (13-19 digit patterns, incl. dashed groups)
test("redacts credit card numbers", () => {
  const r = scrubPII("Billed to 4111-1111-1111-1111 today and 6011111111111117 tomorrow.");
  assert.ok(!r.scrubbedText.includes("4111-1111-1111-1111"));
  assert.ok(!r.scrubbedText.includes("6011111111111117"));
  assert.ok(r.scrubbedText.includes(REDACTED_CC));
  assert.ok(r.redactions.includes(`CC → ${REDACTED_CC}`));
});

// 3. DOB redaction (MM/DD/YYYY + Month DD, YYYY)
test("redacts dates of birth in both formats", () => {
  const r = scrubPII("Born 03/15/1992, also written as March 15, 1992.");
  assert.ok(!r.scrubbedText.includes("03/15/1992"));
  assert.ok(!r.scrubbedText.includes("March 15, 1992"));
  assert.equal(r.scrubbedText.split(REDACTED_DOB).length - 1, 2);
  assert.ok(r.redactions.includes(`DOB → ${REDACTED_DOB}`));
});

// 4. Phone redaction — unknown redacted, known (lead's own) preserved
test("redacts unknown phone numbers but keeps known system phones", () => {
  const r = scrubPII(
    "Call me at (214) 555-0132 or my agent at 555-123-4567.",
    { knownPhones: ["(214) 555-0132"] }
  );
  assert.ok(r.scrubbedText.includes("(214) 555-0132"), "known phone must be kept");
  assert.ok(!r.scrubbedText.includes("555-123-4567"));
  assert.ok(r.scrubbedText.includes(REDACTED_PHONE));
  assert.ok(r.redactions.includes(`Phone → ${REDACTED_PHONE}`));
});

// 5. PHI flagging — medical terms detected, text NOT redacted
test("flags medical PHI terms without redacting them", () => {
  const input =
    "The customer disclosed he has type 2 diabetes and hepatitis C. No SSN shared.";
  const r = scrubPII(input);
  assert.equal(r.containsPHI, true);
  assert.equal(r.scrubbedText, input, "PHI terms must not be redacted");
  assert.equal(r.redactions.length, 0);
});

let passed = 0;
for (const t of tests) {
  try {
    t.fn();
    passed += 1;
    console.log(`\u2713 ${t.name}`);
  } catch (err) {
    console.error(`\u2717 ${t.name}`);
    console.error(err);
  }
}
console.log(`\n${passed}/${tests.length} test cases passed`);
process.exit(passed === tests.length ? 0 : 1);
