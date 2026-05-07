import React from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Regret } from "@workspace/api-client-react";
import { Quote, Headphones } from "lucide-react";

export function RegretCard({ regret }: { regret: Regret }) {
  return (
    <Card 
      className="p-6 bg-card/50 border-border/50 hover:border-primary/30 transition-all duration-300 group flex flex-col h-full hover-elevate shadow-sm hover:shadow-md"
      data-testid={`regret-card-${regret.id}`}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 capitalize font-medium">
            {regret.topic_tag}
          </Badge>
          <Badge variant="secondary" className="capitalize text-muted-foreground bg-secondary/50">
            {regret.stage} Stage
          </Badge>
        </div>
        <span className="text-xs text-muted-foreground font-mono">
          {regret.episode_date ? new Date(regret.episode_date).getFullYear() : 'Unknown'}
        </span>
      </div>

      <h3 className="font-serif text-xl md:text-2xl font-bold leading-tight mb-4 text-foreground group-hover:text-primary transition-colors">
        {regret.regret_statement}
      </h3>

      <div className="relative pl-4 border-l-2 border-primary/20 mb-6 flex-1">
        <Quote className="absolute -left-2 -top-2 w-4 h-4 text-primary/40 rotate-180 bg-card" />
        <p className="text-sm md:text-base text-muted-foreground italic leading-relaxed line-clamp-4">
          "{regret.source_quote}"
        </p>
      </div>

      <div className="mt-auto pt-4 border-t border-border/30 flex items-center justify-between gap-4">
        <div>
          <p className="font-semibold text-sm text-foreground">{regret.guest_name}</p>
          <p className="text-xs text-muted-foreground line-clamp-1">{regret.company || "PM Leader"}</p>
        </div>
        {regret.episode_url ? (
          <a 
            href={regret.episode_url} 
            target="_blank" 
            rel="noreferrer"
            className="flex-shrink-0 flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
            data-testid={`link-episode-${regret.id}`}
          >
            <Headphones className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Listen</span>
          </a>
        ) : (
          <div className="flex-shrink-0 flex items-center gap-1.5 text-xs text-muted-foreground" title={regret.episode_title}>
            <Headphones className="w-3.5 h-3.5" />
          </div>
        )}
      </div>
    </Card>
  );
}
