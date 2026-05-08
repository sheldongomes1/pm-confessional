import { anthropic } from "@workspace/integrations-anthropic-ai";

export interface JudgeVerdict {
  grounded: boolean;
  score: 0 | 1 | 2;
  ungrounded_terms: string[];
  reasoning: string;
}

const JUDGE_PROMPT = `You are a strict groundedness judge for a podcast extraction tool.

You will be given a PASSAGE and a HEADLINE that some other model wrote based on the passage.

Your job: decide whether EVERY concept, fact, and proper noun in the HEADLINE is supported by the PASSAGE alone. The headline is allowed to paraphrase. The headline is allowed to distill a lesson. The headline is NOT allowed to introduce information that is not in the passage — no company names, product names, frameworks, statistics, dates, head counts, or biographical details unless they literally appear in the passage.

Scoring:
- 2 = Fully grounded. Every concept traces to the passage. Paraphrase is faithful and does not over-generalize.
- 1 = Mostly grounded but a minor stretch (mild over-generalization, slightly broader claim than the passage supports). NOT acceptable for this task.
- 0 = Ungrounded. The headline introduces at least one fact, name, number, claim, or generalization not supported by the passage.

Be strict. If you are uncertain whether a term or claim is supported, treat it as ungrounded. Over-generalization (e.g. "every X" or "always Y" when the passage describes only one instance) counts as ungrounded.

Respond with ONLY a JSON object:
{
  "grounded": true | false,    // true ONLY iff score === 2
  "score": 0 | 1 | 2,
  "ungrounded_terms": ["list", "of", "terms", "or", "claims", "not", "supported"],
  "reasoning": "1-2 sentences explaining the verdict"
}`;

export async function judgeHeadline(passage: string, headline: string): Promise<JudgeVerdict> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: `${JUDGE_PROMPT}\n\n<passage>\n${passage}\n</passage>\n\n<headline>\n${headline}\n</headline>`,
      },
    ],
  });

  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Judge returned non-text response");
  }
  const jsonMatch = content.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Judge returned no JSON: ${content.text.slice(0, 200)}`);
  }
  return JSON.parse(jsonMatch[0]) as JudgeVerdict;
}
