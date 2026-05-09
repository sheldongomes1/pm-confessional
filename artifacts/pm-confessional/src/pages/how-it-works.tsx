import { Link } from "wouter";
import { ArrowLeft, ArrowRight } from "lucide-react";

const stages = [
  {
    label: "Lenny's archive",
    detail: "298 podcast episodes, transcripts via MCP",
    color: "bg-secondary text-muted-foreground",
  },
  {
    label: "Postgres cache",
    detail: "raw markdown stored locally — no re-fetch",
    color: "bg-secondary text-muted-foreground",
  },
  {
    label: "Claude extractor",
    detail: "strict first-person past-tense regrets only",
    color: "bg-primary/10 text-primary border-primary/40",
  },
  {
    label: "Deep audit",
    detail: "drops advice, third-party stories, mismatches",
    color: "bg-primary/10 text-primary border-primary/40",
  },
  {
    label: "Gemini embeddings",
    detail: "768-dim vectors in pgvector + HNSW index",
    color: "bg-primary/20 text-primary border-primary/60",
  },
  {
    label: "Vector search + rerank",
    detail: "cosine top-20 → Gemini Flash 0-10 rerank",
    color: "bg-primary/20 text-primary border-primary/60",
  },
  {
    label: "Decision Coach",
    detail: "Gemini Flash agent grounded on top-5 confessions",
    color: "bg-primary text-primary-foreground border-primary",
  },
];

export function HowItWorks() {
  return (
    <article className="container mx-auto px-6 py-20 max-w-4xl">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] font-bold text-muted-foreground hover:text-foreground mb-12"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to the archive
      </Link>

      <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-primary mb-3">
        Architecture
      </p>
      <h1 className="font-serif text-4xl md:text-5xl text-foreground mb-6 leading-tight">
        How a question becomes a coached answer.
      </h1>
      <p className="font-serif text-lg text-muted-foreground italic leading-relaxed mb-16">
        Seven stages, two LLM providers, one strict rule: every claim cites a
        confession.
      </p>

      <div className="space-y-3 mb-16">
        {stages.map((s, i) => (
          <div key={s.label} className="flex items-stretch gap-3">
            <div className="font-mono text-xs text-border tabular-nums w-8 flex items-center justify-center">
              {String(i + 1).padStart(2, "0")}
            </div>
            <div
              className={`flex-1 border ${s.color.includes("border") ? s.color : "border-border " + s.color} p-5`}
            >
              <p className="font-serif text-xl text-foreground leading-snug mb-1">
                {s.label}
              </p>
              <p className="text-sm text-muted-foreground italic font-serif">
                {s.detail}
              </p>
            </div>
            {i < stages.length - 1 && (
              <div className="hidden md:flex items-center text-border">
                <ArrowRight className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}
      </div>

      <h2 className="font-serif text-2xl text-foreground mb-4">Stack notes</h2>
      <ul className="font-serif text-base md:text-lg text-foreground/90 leading-relaxed space-y-3 list-disc pl-6 mb-14">
        <li>
          <strong>Why two LLMs?</strong> Claude is strict about refusing weak
          extractions; Gemini Flash is fast and cheap for the live search +
          coach loop. The audit step lets us swap either side without
          contaminating the dataset.
        </li>
        <li>
          <strong>Why pgvector?</strong> 701 vectors fits comfortably in a
          single HNSW index — no separate vector DB needed, no Postgres
          replacement, one operational thing.
        </li>
        <li>
          <strong>Why ground the coach?</strong> A general-purpose chatbot
          will happily invent a "Lenny said". The coach can only cite the 5
          confessions selected for that session, and the system prompt
          rejects anything unsourced.
        </li>
      </ul>

      <Link
        href="/methodology"
        className="text-xs uppercase tracking-widest font-bold text-primary hover:text-foreground transition-colors border-b border-primary pb-1"
      >
        See the audit numbers →
      </Link>
    </article>
  );
}
