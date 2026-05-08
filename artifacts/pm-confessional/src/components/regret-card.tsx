import { Card } from "@/components/ui/card";
import { Regret } from "@workspace/api-client-react";

interface RegretCardProps {
  regret: Regret;
  isLead?: boolean;
}

export function RegretCard({ regret, isLead = false }: RegretCardProps) {
  // Strip any quote characters the model may have included so the hanging
  // glyph isn't rendered twice.
  const cleanQuote = regret.source_quote
    .trim()
    .replace(/^["“”'`]+/, "")
    .replace(/["“”'`]+$/, "");

  return (
    <Card
      className="p-8 bg-card border-border hover:border-primary/50 transition-colors duration-500 group flex flex-col h-full rounded-none"
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
        <h3
          className={`font-serif font-normal leading-tight mb-8 text-foreground group-hover:text-primary transition-colors duration-500 ${
            isLead
              ? "text-3xl md:text-4xl first-letter:font-serif first-letter:text-7xl md:first-letter:text-8xl first-letter:float-left first-letter:leading-[0.85] first-letter:mr-3 first-letter:mt-1 first-letter:text-primary"
              : "text-2xl md:text-3xl"
          }`}
        >
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

      <div className="pt-6 border-t border-border/40 mt-auto">
        <p className="font-sans font-bold text-sm text-foreground uppercase tracking-wide">
          {regret.guest_name}
        </p>
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground mt-1">
          {regret.company || "PM Leader"}
        </p>
      </div>
    </Card>
  );
}
