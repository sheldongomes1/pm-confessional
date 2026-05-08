/* eslint-disable no-console */
/**
 * Eval runner.
 *
 * Two-stage:
 *   1. Meta-eval the judge against hand-labeled JUDGE_TEST_CASES. If the judge
 *      doesn't reach high agreement with hand labels, we abort — the judge is
 *      not trustworthy and any extractor scores would be noise.
 *   2. Run the extractor against EXTRACTOR_CASES, then run the judge on every
 *      produced headline. Also assert against `forbidden_terms`, `allowed_topics`,
 *      `allowed_stages`, and `should_extract`.
 *
 * Exits with status 1 if any check fails.
 *
 * Run with: pnpm --filter @workspace/api-server run eval
 */

import { extractRegretFromPassage } from "../lib/regret-extractor";
import { EXTRACTOR_CASES } from "./cases";
import { judgeHeadline } from "./judge";
import { JUDGE_TEST_CASES } from "./judge-tests";

const JUDGE_AGREEMENT_THRESHOLD = 0.85; // judge must agree with >= 85% of meta labels

interface CaseFailure {
  case_id: string;
  reason: string;
}

function header(text: string) {
  console.log(`\n${"=".repeat(70)}\n${text}\n${"=".repeat(70)}`);
}

async function metaEvalJudge(): Promise<{ agreement: number; failures: CaseFailure[] }> {
  header("STAGE 1 — Meta-eval: testing the judge against hand labels");

  const failures: CaseFailure[] = [];
  let agreed = 0;

  for (const test of JUDGE_TEST_CASES) {
    const verdict = await judgeHeadline(test.passage, test.headline);
    const ok = verdict.grounded === test.expected_grounded;
    if (ok) agreed++;
    const tag = ok ? "PASS" : "MISMATCH";
    console.log(
      `  [${tag}] ${test.id}\n    expected_grounded=${test.expected_grounded} judge.grounded=${verdict.grounded} score=${verdict.score}\n    judge: ${verdict.reasoning}`,
    );
    if (!ok) {
      failures.push({
        case_id: test.id,
        reason: `Judge disagreed with hand label. Expected grounded=${test.expected_grounded}, got grounded=${verdict.grounded}. Judge said: ${verdict.reasoning}`,
      });
    }
  }

  const agreement = agreed / JUDGE_TEST_CASES.length;
  console.log(
    `\n  Judge agreement: ${agreed}/${JUDGE_TEST_CASES.length} (${(agreement * 100).toFixed(0)}%). Threshold: ${(JUDGE_AGREEMENT_THRESHOLD * 100).toFixed(0)}%`,
  );
  return { agreement, failures };
}

async function evalExtractor(): Promise<{ pass: number; fail: number; failures: CaseFailure[] }> {
  header("STAGE 2 — Eval: extractor groundedness on Lenny-style passages");

  const failures: CaseFailure[] = [];
  let pass = 0;

  for (const c of EXTRACTOR_CASES) {
    const result = await extractRegretFromPassage(c.passage);

    // Check 1: should_extract
    if (c.expect.should_extract && result === null) {
      failures.push({ case_id: c.id, reason: "Expected an extraction, got null." });
      console.log(`  [FAIL] ${c.id} — expected extraction, got null`);
      continue;
    }
    if (!c.expect.should_extract && result !== null) {
      failures.push({
        case_id: c.id,
        reason: `Expected null (no regret in passage), got headline: "${result.regret_statement}"`,
      });
      console.log(`  [FAIL] ${c.id} — expected null, got: ${result.regret_statement}`);
      continue;
    }
    if (!c.expect.should_extract && result === null) {
      pass++;
      console.log(`  [PASS] ${c.id} — correctly returned null`);
      continue;
    }
    if (!result || !result.regret_statement) {
      failures.push({ case_id: c.id, reason: "Unexpected null after should_extract check" });
      continue;
    }

    const headline = result.regret_statement;
    const localFailures: string[] = [];

    // Check 2: forbidden_terms
    const lower = headline.toLowerCase();
    for (const term of c.expect.forbidden_terms ?? []) {
      if (lower.includes(term.toLowerCase())) {
        localFailures.push(`Headline contains forbidden term "${term}"`);
      }
    }

    // Check 3: allowed_topics
    if (c.expect.allowed_topics && !c.expect.allowed_topics.includes(result.topic_tag)) {
      localFailures.push(
        `topic_tag="${result.topic_tag}" not in allowed [${c.expect.allowed_topics.join(", ")}]`,
      );
    }

    // Check 4: allowed_stages
    if (c.expect.allowed_stages && !c.expect.allowed_stages.includes(result.stage)) {
      localFailures.push(
        `stage="${result.stage}" not in allowed [${c.expect.allowed_stages.join(", ")}]`,
      );
    }

    // Check 5: judge groundedness
    const verdict = await judgeHeadline(c.passage, headline);
    if (!verdict.grounded) {
      localFailures.push(
        `Judge marked ungrounded (score=${verdict.score}). Ungrounded terms: [${verdict.ungrounded_terms.join(", ")}]. Reasoning: ${verdict.reasoning}`,
      );
    }

    // Check 6: headline_evidence must be a substring of the passage
    if (result.headline_evidence) {
      const evidenceClean = result.headline_evidence.replace(/\s+/g, " ").trim();
      const passageClean = c.passage.replace(/\s+/g, " ").trim();
      if (!passageClean.toLowerCase().includes(evidenceClean.toLowerCase())) {
        localFailures.push(
          `headline_evidence is not a verbatim substring of the passage. Got: "${result.headline_evidence}"`,
        );
      }
    } else {
      localFailures.push("Missing headline_evidence");
    }

    if (localFailures.length === 0) {
      pass++;
      console.log(`  [PASS] ${c.id} — "${headline}" (judge score=${verdict.score})`);
    } else {
      failures.push({ case_id: c.id, reason: localFailures.join(" | ") });
      console.log(`  [FAIL] ${c.id} — "${headline}"`);
      for (const f of localFailures) console.log(`         - ${f}`);
    }
  }

  return { pass, fail: failures.length, failures };
}

async function main() {
  const meta = await metaEvalJudge();
  if (meta.agreement < JUDGE_AGREEMENT_THRESHOLD) {
    header("ABORT — judge is not trustworthy");
    console.log("Fix the judge prompt before trusting extractor scores.");
    for (const f of meta.failures) console.log(`  - ${f.case_id}: ${f.reason}`);
    process.exit(1);
  }

  const ext = await evalExtractor();

  header("SUMMARY");
  console.log(`Judge meta-eval:  ${JUDGE_TEST_CASES.length - meta.failures.length}/${JUDGE_TEST_CASES.length} passed`);
  console.log(`Extractor eval:   ${ext.pass}/${EXTRACTOR_CASES.length} passed`);

  if (ext.fail > 0 || meta.failures.length > 0) {
    console.log("\nFAILURES:");
    for (const f of [...meta.failures, ...ext.failures]) {
      console.log(`  - ${f.case_id}: ${f.reason}`);
    }
    process.exit(1);
  }
  console.log("\nAll evals passed.");
}

main().catch((err) => {
  console.error("Eval runner crashed:", err);
  process.exit(1);
});
