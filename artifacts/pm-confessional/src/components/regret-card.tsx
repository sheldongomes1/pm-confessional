import React from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Regret } from "@workspace/api-client-react";
import { Headphones } from "lucide-react";

export function RegretCard({ regret }: { regret: Regret }) {
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
          {regret.episode_date ? new Date(regret.episode_date).getFullYear() : 'Date Unknown'}
        </span>
      </div>

      <div className="flex-1 flex flex-col">
        <h3 className="font-serif text-2xl md:text-3xl font-normal leading-tight mb-8 text-foreground group-hover:text-primary transition-colors duration-500">
          {regret.regret_statement}
        </h3>

        <div className="pl-6 border-l border-primary/30 mb-8 mt-auto relative">
          <p className="text-lg md:text-xl font-serif text-muted-foreground italic leading-relaxed">
            "{regret.source_quote}"
          </p>
        </div>
      </div>

      <div className="pt-6 border-t border-border/40 flex items-center justify-between gap-4 mt-auto">
        <div>
          <p className="font-sans font-bold text-sm text-foreground uppercase tracking-wide">
            {regret.guest_name}
          </p>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground mt-1">
            {regret.company || "PM Leader"}
          </p>
        </div>
        {regret.episode_url ? (
          <a 
            href={regret.episode_url} 
            target="_blank" 
            rel="noreferrer"
            className="flex-shrink-0 w-10 h-10 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary transition-colors"
            data-testid={`link-episode-${regret.id}`}
            title="Listen to Episode"
          >
            <Headphones className="w-4 h-4" />
          </a>
        ) : (
          <div className="flex-shrink-0 w-10 h-10 rounded-full border border-border/30 flex items-center justify-center text-muted-foreground/30" title={regret.episode_title}>
            <Headphones className="w-4 h-4" />
          </div>
        )}
      </div>
    </Card>
  );
}
