import { Link, useRoute } from "wouter";
import {
  useGetRegret,
  useListRegrets,
  getGetRegretQueryKey,
  getListRegretsQueryKey,
} from "@workspace/api-client-react";
import { RegretCard } from "@/components/regret-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ExternalLink, Link2 } from "lucide-react";
import { useState } from "react";
import { roleFor } from "@/lib/guest-roles";
import { useToast } from "@/hooks/use-toast";

export function Confession() {
  const [, params] = useRoute("/confession/:id");
  const id = params ? parseInt(params.id, 10) : NaN;
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const { data: regret, isLoading, isError } = useGetRegret(id, {
    query: { queryKey: getGetRegretQueryKey(id), enabled: !Number.isNaN(id) },
  });

  const moreParams = { guest_name: regret?.guest_name, limit: 6 };
  const { data: more } = useListRegrets(moreParams, {
    query: {
      queryKey: getListRegretsQueryKey(moreParams),
      enabled: Boolean(regret?.guest_name),
    },
  });

  const otherFromGuest =
    more?.regrets.filter((r) => r.id !== id).slice(0, 4) ?? [];

  const copyLink = async () => {
    if (typeof window === "undefined") return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({
        title: "Couldn't copy link",
        description: "Your browser blocked clipboard access.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-4xl px-6 py-32">
        <Skeleton className="h-8 w-32 mb-12 rounded-none" />
        <Skeleton className="h-16 w-3/4 mb-6 rounded-none" />
        <Skeleton className="h-32 w-full rounded-none" />
      </div>
    );
  }

  if (isError || !regret) {
    return (
      <div className="container mx-auto max-w-2xl px-6 py-32 text-center">
        <h1 className="font-serif text-3xl mb-4">Confession not found</h1>
        <p className="text-muted-foreground font-serif italic mb-8">
          The page you're looking for has been removed or never existed.
        </p>
        <Link href="/">
          <Button variant="outline" className="rounded-none uppercase tracking-wider text-xs">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to archive
          </Button>
        </Link>
      </div>
    );
  }

  const cleanQuote = regret.source_quote
    .trim()
    .replace(/^["“”'`]+/, "")
    .replace(/["“”'`]+$/, "");
  const role = roleFor(regret.guest_name, regret.company);
  const year = regret.episode_date
    ? new Date(regret.episode_date).getFullYear()
    : null;

  return (
    <article className="bg-background">
      {/* Header */}
      <section className="border-b border-border pt-24 pb-16 px-6">
        <div className="container mx-auto max-w-3xl">
          <Link href="/">
            <button
              className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] font-bold text-muted-foreground hover:text-foreground transition-colors mb-12"
              data-testid="link-back-archive"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to archive
            </button>
          </Link>

          <div className="flex items-center gap-3 mb-8 text-[10px] uppercase tracking-widest font-bold">
            <span className="text-primary">{regret.topic_tag}</span>
            <span className="w-1 h-1 bg-border rounded-full" />
            <span className="text-muted-foreground">{regret.stage} stage</span>
            {year && (
              <>
                <span className="w-1 h-1 bg-border rounded-full" />
                <span className="text-muted-foreground font-mono">{year}</span>
              </>
            )}
          </div>

          <h1
            className="font-serif text-4xl md:text-6xl font-normal leading-[1.1] tracking-tight text-foreground mb-12"
            data-testid="text-confession-headline"
          >
            {regret.regret_statement}
          </h1>

          <div className="flex items-baseline justify-between gap-6 pt-6 border-t border-border">
            <div>
              <p className="font-sans font-bold text-base text-foreground uppercase tracking-wide">
                {regret.guest_name}
              </p>
              <p className="text-xs uppercase tracking-wider text-muted-foreground mt-1">
                {role}
              </p>
            </div>
            <button
              onClick={copyLink}
              className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] font-bold text-muted-foreground hover:text-primary transition-colors"
              data-testid="button-copy-permalink"
            >
              <Link2 className="w-3.5 h-3.5" />
              {copied ? "Copied" : "Permalink"}
            </button>
          </div>
        </div>
      </section>

      {/* The quote */}
      <section className="px-6 py-20 border-b border-border">
        <div className="container mx-auto max-w-3xl">
          <h2 className="text-[10px] uppercase tracking-[0.3em] font-bold text-muted-foreground mb-8">
            In their own words
          </h2>
          <blockquote className="relative pl-8 border-l-2 border-primary/40">
            <span
              aria-hidden="true"
              className="absolute -left-2 -top-6 font-serif text-7xl text-primary/30 leading-none select-none"
            >
              “
            </span>
            <p
              className="font-serif text-2xl md:text-3xl italic text-foreground/90 leading-relaxed"
              data-testid="text-confession-quote"
            >
              {cleanQuote}
            </p>
          </blockquote>
        </div>
      </section>

      {/* Episode source */}
      <section className="px-6 py-16 border-b border-border bg-card/40">
        <div className="container mx-auto max-w-3xl">
          <h2 className="text-[10px] uppercase tracking-[0.3em] font-bold text-muted-foreground mb-6">
            Source episode
          </h2>
          <p
            className="font-serif text-xl text-foreground mb-2"
            data-testid="text-episode-title"
          >
            {regret.episode_title}
          </p>
          <p className="text-sm text-muted-foreground font-serif italic mb-8">
            From Lenny's Podcast
            {regret.episode_date ? ` · ${regret.episode_date}` : ""}
          </p>
          {regret.episode_url ? (
            <a
              href={regret.episode_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-xs uppercase tracking-widest font-bold text-primary hover:text-foreground transition-colors border-b border-primary pb-1"
              data-testid="link-episode-source"
            >
              Listen to episode
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          ) : (
            <p className="text-xs uppercase tracking-widest text-muted-foreground italic">
              Episode link unavailable
            </p>
          )}
        </div>
      </section>

      {/* More from this guest */}
      {otherFromGuest.length > 0 && (
        <section className="px-6 py-20">
          <div className="container mx-auto max-w-7xl">
            <h2 className="text-xs uppercase tracking-widest font-bold text-muted-foreground mb-12 border-b border-border pb-4">
              More from {regret.guest_name}
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {otherFromGuest.map((r) => (
                <RegretCard key={r.id} regret={r} />
              ))}
            </div>
          </div>
        </section>
      )}
    </article>
  );
}
