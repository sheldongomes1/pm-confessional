import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Regret } from "@workspace/api-client-react";
import { roleFor } from "@/lib/guest-roles";
import { track } from "@/lib/analytics";
import { ArrowUpRight } from "lucide-react";

export function RegretCard({ regret }: { regret: Regret }) {
  // Prefer the extractor's verbatim headline_evidence span (the exact words
  // the model identified as proving the confession) over the windowed
  // source_quote (first 500 chars of an 800-word chunk, often truncated
  // mid-sentence or capturing the host's intro to the next question).
  const stripQuotes = (s: string) =>
    s
      .trim()
      .replace(/^["“”'`]+/, "")
      .replace(/["“”'`]+$/, "")
      .trim();
  const evidenceClean = regret.headline_evidence
    ? stripQuotes(regret.headline_evidence)
    : "";
  const cleanQuote =
    evidenceClean.length > 5
      ? evidenceClean
      : stripQuotes(regret.source_quote ?? "");

  const role = roleFor(regret.guest_name, regret.company);

  const handleOpen = () => {
    track("regret_card_opened", {
      regret_id: regret.id,
      guest_name: regret.guest_name,
      topic_tag: regret.topic_tag,
      stage: regret.stage,
      episode_title: regret.episode_title,
      episode_year: regret.episode_date
        ? new Date(regret.episode_date).getFullYear()
        : null,
    });
  };

  return (
    <Link href={`/regret/${regret.id}`} onClick={handleOpen}>
      <Card
        className="p-8 bg-card border-border hover:border-primary/50 transition-colors duration-500 group flex flex-col h-full rounded-none cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        data-testid={`regret-card-${regret.id}`}
      >
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-border/40">
          <div className="flex items-center gap-3">
            <span className="text-[10px] uppercase tracking-widest font-bold text-primary">
              {regret.topic_tag}
            </span>
            <span className="w-1 h-1 bg-border rounded-full" />
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {regret.stage} Stage
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground font-mono">
            {regret.episode_date
              ? new Date(regret.episode_date).getFullYear()
              : "Date Unknown"}
          </span>
        </div>

        <div className="flex-1 flex flex-col">
          <h3 className="font-serif text-2xl md:text-3xl font-normal leading-tight mb-8 text-foreground group-hover:text-primary transition-colors duration-500">
            {regret.regret_statement}
          </h3>

          <blockquote className="relative pl-6 border-l border-primary/30 mb-8 mt-auto">
            <span
              aria-hidden="true"
              className="absolute -left-1 -top-4 font-serif text-6xl text-primary/30 leading-none select-none"
            >
              “
            </span>
            <p className="text-lg md:text-xl font-serif text-muted-foreground italic leading-relaxed">
              {cleanQuote}
            </p>
          </blockquote>
        </div>

        <div className="pt-6 border-t border-border/40 mt-auto flex items-end justify-between gap-4">
          <div>
            <p className="font-sans font-bold text-sm text-foreground uppercase tracking-wide">
              {regret.guest_name}
            </p>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground mt-1">
              {role}
            </p>
          </div>
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest font-bold text-muted-foreground group-hover:text-primary transition-colors">
            Read
            <ArrowUpRight className="w-3.5 h-3.5" />
          </span>
        </div>
      </Card>
    </Link>
  );
}
