/**
 * Ack-email placeholder substitution tests — compliance spec §3.1
 * (ack-email-template.md): {{first_name}} and {{state}} substitution with the
 * exact approved fallbacks, single-pass safety (no double substitution), and
 * pass-through of bodies without placeholders.
 * Run with: bun run src/lib/email-ack.test.ts
 */
import { strict as assert } from "node:assert";
import { renderAckBody } from "./email-ack";

type TestCase = { name: string; fn: () => void };
const tests: TestCase[] = [];
function test(name: string, fn: () => void) {
  tests.push({ name, fn });
}

// Generic test fragment — NOT the approved copy (copy is frozen; it must
// never appear in code). Only the two placeholder tokens are used.
const SAMPLE = "Hi {{first_name}},\n\nYou wrote to us from {{state}}.\nThanks again.";

// 1. Full name + real state substituted
test("substitutes full first name and real state", () => {
  const out = renderAckBody(SAMPLE, { firstName: "Jamie", state: "NJ" });
  assert.equal(out, "Hi Jamie,\n\nYou wrote to us from NJ.\nThanks again.");
  assert.ok(!out.includes("{{first_name}}"), "no raw {{first_name}} left");
  assert.ok(!out.includes("{{state}}"), "no raw {{state}} left");
});

// 2. Missing first name → "there"
test("missing/blank first name falls back to 'there'", () => {
  for (const firstName of [undefined, null, "", "   "]) {
    const out = renderAckBody("Hi {{first_name}}.", { firstName, state: "TX" });
    assert.equal(out, "Hi there.");
    assert.ok(!out.includes("{{"));
  }
});

// 3. Empty/absent state → "wherever you are"
test("empty or absent state falls back to 'wherever you are'", () => {
  for (const state of [undefined, null, "", "  "]) {
    const out = renderAckBody("You wrote to us from {{state}}.", {
      firstName: "Jamie",
      state,
    });
    assert.equal(out, "You wrote to us from wherever you are.");
    assert.ok(!out.includes("{{"));
  }
});

// 4. "Prefer not to say" → fallback (the literal is never shown)
test("state 'Prefer not to say' falls back to 'wherever you are'", () => {
  for (const state of ["Prefer not to say", "  Prefer not to say  ", "prefer NOT to say"]) {
    const out = renderAckBody("You wrote to us from {{state}}.", {
      firstName: "Jamie",
      state,
    });
    assert.equal(out, "You wrote to us from wherever you are.");
  }
});

// 5. Body with NO placeholders passes through untouched
test("body with no placeholders passes through untouched", () => {
  const body = "Hi,\n\nNothing dynamic here — {{email}} and {{other_token}} stay literal too.\n";
  const out = renderAckBody(body, { firstName: "Jamie", state: "NJ" });
  assert.equal(out, body);
});

// 6. No double substitution: a body that was already substituted once is
// unchanged by a second render with the same personalization (substitution
// is idempotent for real data — the output contains no placeholder tokens).
// Replacement values are never re-scanned within a pass: even a first name
// that itself contains a placeholder token stays literal after ONE render.
test("already-substituted body is not substituted twice", () => {
  const p = { firstName: "Jamie", state: "NJ" };
  const once = renderAckBody(SAMPLE, p);
  assert.equal(once, "Hi Jamie,\n\nYou wrote to us from NJ.\nThanks again.");
  assert.equal(renderAckBody(once, p), once, "second render with same inputs is a no-op");
  // Single-pass safety within one render:
  const injected = renderAckBody("Hi {{first_name}}!", { firstName: "{{state}}" });
  assert.equal(injected, "Hi {{state}}!");
});

let passed = 0;
for (const t of tests) {
  try {
    t.fn();
    passed += 1;
    console.log(`✓ ${t.name}`);
  } catch (err) {
    console.error(`✗ ${t.name}`);
    console.error(err);
  }
}
console.log(`\n${passed}/${tests.length} test cases passed`);
process.exit(passed === tests.length ? 0 : 1);
