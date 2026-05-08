/**
 * Meta-eval cases for the judge itself. We hand-label (passage, headline) pairs
 * with the expected verdict, then run the judge against them. If the judge
 * disagrees, the judge is broken — its scores on the extractor are not trustworthy.
 *
 * This is the "eval the evaluator" step.
 */

export interface JudgeTestCase {
  id: string;
  description: string;
  passage: string;
  headline: string;
  expected_grounded: boolean;
}

const MARKETPLACE_PASSAGE =
  "I regret not thinking about the cold start problem sooner. When you're building a marketplace, the hardest moment is the beginning. We launched our platform with almost no supply and demand had terrible experiences and churned. We should have seeded the supply side much more aggressively before opening to demand.";

const PRICING_PASSAGE =
  "I regret not charging earlier. We waited way too long to monetize because we were scared of losing users. Free users will tell you they love your product and then disappear. Paying customers are far more honest because they have skin in the game.";

const HIRING_PASSAGE =
  "We hired too fast after our Series B. The coordination overhead alone killed us. I wish we had been much more selective and grown at half the pace.";

export const JUDGE_TEST_CASES: JudgeTestCase[] = [
  {
    id: "judge-pass-faithful-distillation",
    description: "Faithful distillation of marketplace passage. Should pass.",
    passage: MARKETPLACE_PASSAGE,
    headline: "Don't open demand before supply can deliver.",
    expected_grounded: true,
  },
  {
    id: "judge-pass-paraphrase",
    description: "Faithful paraphrase of pricing passage. Should pass.",
    passage: PRICING_PASSAGE,
    headline: "Charge early to find the truth about value.",
    expected_grounded: true,
  },
  {
    id: "judge-fail-invents-company",
    description: "Headline names Uber, which is not in the marketplace passage. Should fail.",
    passage: MARKETPLACE_PASSAGE,
    headline: "How Uber lost its first cohort to empty demand.",
    expected_grounded: false,
  },
  {
    id: "judge-fail-invents-stat",
    description: "Headline invents a percentage not in the hiring passage. Should fail.",
    passage: HIRING_PASSAGE,
    headline: "Tripling headcount cost us 60% of our productivity.",
    expected_grounded: false,
  },
  {
    id: "judge-fail-invents-framework",
    description: "Headline cites Jobs-To-Be-Done not present in passage. Should fail.",
    passage: PRICING_PASSAGE,
    headline: "Apply Jobs-To-Be-Done before setting your price.",
    expected_grounded: false,
  },
  {
    id: "judge-fail-invents-funding-round",
    description: "Headline says Series A but passage says Series B. Should fail.",
    passage: HIRING_PASSAGE,
    headline: "I over-hired right after our Series A.",
    expected_grounded: false,
  },
  {
    id: "judge-pass-imperative",
    description: "Imperative phrasing grounded in hiring passage. Should pass.",
    passage: HIRING_PASSAGE,
    headline: "Resist the urge to hire fast after funding.",
    expected_grounded: true,
  },
  {
    id: "judge-fail-mild-overgeneralization",
    description:
      "Headline generalizes from one marketplace to all marketplaces — a stretch the judge should catch.",
    passage: MARKETPLACE_PASSAGE,
    headline: "Every marketplace dies if supply isn't seeded first.",
    expected_grounded: false,
  },
  {
    id: "judge-fail-invents-product",
    description: "Headline names a product (Slack) that is not in the passage.",
    passage: PRICING_PASSAGE,
    headline: "Charge for Slack early or paying customers won't show up.",
    expected_grounded: false,
  },
  {
    id: "judge-fail-strong-verb-overstates",
    description:
      "Punchy headline says free users 'lie' but the passage only says they 'disappear' — a mild but real overstatement under the strict policy.",
    passage: PRICING_PASSAGE,
    headline: "Free users lie. Paying customers tell the truth.",
    expected_grounded: false,
  },
];
