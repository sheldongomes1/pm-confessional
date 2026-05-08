import React from "react";
import { Regret } from "@workspace/api-client-react";
import { Headphones } from "lucide-react";

export function RegretCard({ regret }: { regret: Regret }) {
  return (
    <div 
      className="p-8 bg-card border border-border hover:border-border/80 shadow-sm hover:shadow-md transition-all duration-300 group flex flex-col h-full"
      data-testid={`regret-card-${regret.id}`}
    >
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-border/60">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-primary rounded-full" />
            <span className="text-[10px] uppercase tracking-widest font-bold text-foreground">
              {regret.topic_tag}
            </span>
          </div>
          <span className="text-border">|</span>
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
            {regret.stage} Stage
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground font-mono font-medium">
          {regret.episode_date ? new Date(regret.episode_date).getFullYear() : 'Date Unknown'}
        </span>
      </div>

      <div className="flex-1 flex flex-col">
        <h3 className="font-serif text-2xl font-medium leading-snug mb-8 text-foreground group-hover:text-primary transition-colors duration-300">
          {regret.regret_statement}
        </h3>

        <div className="pl-6 border-l-2 border-border mb-8 mt-auto relative">
          <p className="text-base md:text-lg font-sans text-muted-foreground leading-relaxed">
            "{regret.source_quote}"
          </p>
        </div>
      </div>

      <div className="pt-6 border-t border-border/60 flex items-center justify-between gap-4 mt-auto">
        <div>
          <p className="font-sans font-bold text-xs text-foreground uppercase tracking-wider">
            {regret.guest_name}
          </p>
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground mt-1">
            {regret.company || "PM Leader"}
          </p>
        </div>
        {regret.episode_url ? (
          <a 
            href={regret.episode_url} 
            target="_blank" 
            rel="noreferrer"
            className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-foreground hover:bg-primary hover:text-primary-foreground transition-colors shadow-sm"
            data-testid={`link-episode-${regret.id}`}
            title="Listen to Episode"
          >
            <Headphones className="w-3.5 h-3.5" />
          </a>
        ) : (
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary/50 flex items-center justify-center text-muted-foreground/40" title={regret.episode_title}>
            <Headphones className="w-3.5 h-3.5" />
          </div>
        )}
      </div>
    </div>
  );
}
