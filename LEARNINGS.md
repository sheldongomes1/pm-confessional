# Learnings — The PM Confessional

Things this project taught us that generalize beyond it. Each section has a
takeaway and a pointer for what to read/study next.

---

## 1. The biggest latency win is almost never where you'd guess

Search was ~11–15s end-to-end. We instinctively reached for caching first.
The actual ranked impact:

| Change | Before | After | Why it mattered |
|---|---|---|---|
| Skip rerank when cosine ≥ threshold | every req paid 2–10s for Flash | most reqs skip the LLM entirely | the LLM was the dominant cost, not embedding |
| Swap Flash → Flash Lite for the rerank | 2–10s | ~1.5s | model choice, same prompt |
| LRU embedding cache | 200ms embed | ~10ms repeat | smallest of the three wins |

**Lesson**: instrument *before* optimizing. The `X-Search-Timing` header
told us embedding was 200ms and rerank was 8000ms — that ratio decided the
work order. Without it we would have built a beautiful embedding cache and
felt clever while the real bottleneck sat untouched.

**Study deeper**: read about p50 vs p99 latency analysis, "where the
milliseconds go" instrumentation, and `process.hrtime.bigint()` for sub-ms
timing. Tail latency literature (Dean & Barroso "The Tail at Scale", 2013)
is worth the hour.

---

## 2. Confidence tiers > hard cutoffs

The single-threshold v1 (`if cosine ≥ 0.55, skip rerank`) had a binary
quality cliff. The 3-tier policy (`HIGH=0.70, LOW=0.45, fallback to bigger
model below LOW`) shapes cost to the actual confidence distribution:

- Strong queries → instant cosine, no LLM
- Mid queries → fast Flash Lite (the common case)
- Weak queries → expensive Flash + a `low_confidence` flag the UI can show

**Lesson**: when there's a quality/cost knob, prefer a *graduated* policy
over a single threshold. The cost of an extra branch is one if-statement;
the cost of getting the threshold wrong on a binary system is half your
queries either too slow or too dumb.

**Study deeper**: confidence-conditional computation in ML serving
(speculative decoding, cascade models, Frugal-GPT). Same idea, fancier
math.

---

## 3. Don't tune thresholds by vibes — run an offline eval

When the user asked "should we bump 0.65 → ?", the right move wasn't
"sounds reasonable, ship 0.70." It was: run the same 10 queries at three
threshold values, print a side-by-side matrix, *let them eyeball*.

That eval is now a permanent script (`pnpm run eval-thresholds`) and the
tuning becomes a 30-second loop instead of a guess. The decision was based
on actual data: 6 queries materially improved at 0.70, 0 regressed.

**Lesson**: any time you have a magic number that affects user-visible
quality, build the smallest-possible offline eval *before* you change it.
The marginal cost is one tsx script; the marginal benefit is "I can
defend this number" instead of "felt right."

**Study deeper**: "evals as the new unit tests" (the OpenAI / Anthropic
playbook). Look at promptfoo, Braintrust, OpenAI Evals for inspiration —
even a hand-rolled markdown table beats nothing.

---

## 4. Strict prompts beat loose ones, dramatically

The extractor went from 33% PERSONAL_CONFESSION rate (loose prompt: "find
mistakes Lenny's guests made") to 90% (strict prompt: "first-person
past-tense ownership only, reject imperatives, here are the explicit red
flags"). Same model. ~3× quality improvement.

The Decision Coach prompt is similarly strict: "every claim must cite
[#regret_id], refuse to invent regrets." It hallucinates approximately
zero confessions because the prompt makes hallucination literally
ungrammatical.

**Lesson**: LLM output quality is dominated by prompt specificity, not
model size. A worse model with a sharper prompt beats a better model with
a vague one. Always include explicit negative examples ("REJECT: …") —
they do more work than positive ones.

**Study deeper**: Anthropic's prompt engineering docs (the "be explicit
about what you don't want" section). Also worth reading: "constitutional
AI" papers on how to encode rules as prompt-level invariants.

---

## 5. Verbatim ground truth > approximate ground truth

Original audit probed the corpus with `source_quote` (a 500-char chunk
slice that often started mid-sentence). It reported a high MISMATCH rate.
Switching to `headline_evidence` (a verbatim 8-40 word span guaranteed to
exist in the source markdown) dropped the false-positive rate to near
zero.

**Lesson**: when validating LLM output against ground truth, the
*verifiability* of the field matters more than its richness. A short
verbatim span you can `grep` for is more powerful than a long
approximation. Prefer fields that survive `===` comparison.

**Study deeper**: "evidence-grounded generation" / "extractive vs
abstractive" in retrieval QA. The pattern of "model produces both an
answer AND a verbatim citation that we can verify post-hoc" is the entire
basis of modern RAG.

---

## 6. Telemetry is a force multiplier, but only if it's structured

Every `search_completed` event now carries `rerank_model + top1_cosine +
total_ms + low_confidence + retrieval_mode`. That single decision means:

- We can compute tier distribution on real traffic
- We can compute p50/p95 latency *by tier* (not just overall)
- We can spot drift ("hey, the flash bucket grew 3× this week")
- We can A/B threshold values with statistical confidence

If we'd logged just `{query, result_count}` like the v1, none of that
would be possible — we'd be flying blind.

**Lesson**: when you ship a behavior change, ship the telemetry that lets
you measure it *in the same commit*. Otherwise you'll deploy, forget, and
six months later wonder if your "improvement" actually helped.

**Study deeper**: Honeycomb's "high-cardinality observability" essays.
Also Charity Majors on "you can't debug what you can't query."

---

## 7. Idempotent + resumable from day one

The ingestion pipeline is a 4-phase scan that can be rerun safely at any
point. Phase 4 only processes episodes where `scanned_at IS NULL`, so a
crash mid-scan loses no work. Embedding backfill is the same: scans for
`embedding IS NULL` and only fills gaps.

That property paid for itself the first time MCP timed out at episode
247/298. We re-ran the script, it picked up at 248, no thought required.

**Lesson**: any long-running batch job should be (a) idempotent (running
it twice gives the same answer) and (b) resumable (running it after a
crash continues from the last good state). The cost is one boolean
column; the benefit is sleeping through MCP outages.

**Study deeper**: classic "checkpointing" patterns from data engineering.
Look at how Airflow / Temporal / Dagster model task idempotency. The
underlying principle is older than they are.

---

## 8. RAG is "retrieval THEN generation" — both halves matter

The Decision Coach is grounded on 5 retrieved confessions. If retrieval
returns the wrong 5, no amount of clever generation can save the answer.
That's why the *retrieval* side got the most attention (embeddings,
rerank, threshold tuning) — not the LLM that synthesizes the final
response.

The B2C→B2B query taught us this concretely: rerank couldn't fix it
because the corpus genuinely lacked that decision. No threshold change
would help. The fix is more data, not more LLM.

**Lesson**: when a RAG system gives bad answers, debug retrieval first
(did we surface the right documents?) before you blame the generator.
~80% of RAG failures are retrieval failures.

**Study deeper**: the "RAG evaluation" literature — RAGAS, ARES, the
"retrieval augmented generation" benchmark suite. Also: the distinction
between "hit rate" (did the right doc appear in top-k) and "MRR" (where
in top-k did it appear).

---

## 9. Suggest the cheap thing before the expensive thing

Several times in this project, the right answer was a 2-line config
change instead of a 200-line refactor:

- "Switch from Flash to Flash Lite" was 1 line. It saved ~6 seconds.
- "Bump default 0.65 → 0.70" was 1 character. It fixed the topic-not-
  decision misses.
- "Skip the rerank above threshold X" was an if-statement. It was the
  largest latency win in the project.

**Lesson**: before reaching for big architectural changes, ask: "what's
the smallest change that would test the same hypothesis?" The smallest
change is usually faster to ship, easier to roll back, and cleaner to
measure.

**Study deeper**: "Reversible vs irreversible decisions" (Bezos's two-way
door framing). Cheap reversible changes should be made eagerly; expensive
irreversible ones should be made carefully.

---

## 10. Write down the gotchas — your future self is a different person

The `replit.md` "Gotchas" section has saved us at least three times
already (Flash Lite vs Flash, audit probe field, stage `unknown` vs
`general`). These are exactly the things that take 30 minutes to
re-derive and 30 seconds to read.

**Lesson**: when you discover a non-obvious thing — *especially* a
"don't do X, here's why" — write it down immediately. The cost is one
bullet; the payoff is not stepping on the same rake twice.

**Study deeper**: "ADR" (Architecture Decision Records) as a lightweight
discipline. Also Tom Limoncelli's "The Practice of System and Network
Administration" — a whole book on the principle of write-it-down.
