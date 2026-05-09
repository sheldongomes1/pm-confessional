import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import {
  useGetRegret,
  getGetRegretQueryKey,
} from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ExternalLink, Link2, Check } from "lucide-react";
import { roleFor } from "@/lib/guest-roles";
import { track } from "@/lib/analytics";

const stripQuotes = (s: string) =>
  s
    .trim()
    .replace(/^["“”'`]+/, "")
    .replace(/["“”'`]+$/, "")
    .trim();

export function RegretDetail() {
  const [, params] = useRoute<{ id: string }>("/regret/:id");
  const id = params ? parseInt(params.id, 10) : NaN;
  const { data: regret, isLoading, isError } = useGetRegret(id, {
    query: {
      queryKey: getGetRegretQueryKey(id),
      enabled: Number.isFinite(id),
    },
  });

  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (regret) {
      track("regret_detail_viewed", {
        regret_id: regret.id,
        guest_name: regret.guest_name,
        topic_tag: regret.topic_tag,
      });
    }
  }, [regret]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      track("regret_link_copied", { regret_id: regret?.id ?? null });
    } catch {
      // ignore
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-6 py-20 max-w-3xl space-y-6">
        <Skeleton className="h-4 w-40 rounded-none bg-secondary" />
        <Skeleton className="h-16 w-full rounded-none bg-secondary" />
        <Skeleton className="h-32 w-full rounded-none bg-secondary" />
      </div>
    );
  }

  if (isError || !regret) {
    return (
      <div className="container mx-auto px-6 py-32 max-w-xl text-center">
        <h1 className="text-3xl font-serif text-foreground mb-4">
          Confession not found
        </h1>
        <p className="text-muted-foreground font-serif italic mb-10">
          Either the link is wrong or this entry has been pulled from the record.
        </p>
        <Link
          href="/"
          className="text-xs uppercase tracking-widest font-bold text-primary hover:text-foreground transition-colors border-b border-primary pb-1"
        >
          Back to the archive
        </Link>
      </div>
    );
  }

  const evidence = regret.headline_evidence
    ? stripQuotes(regret.headline_evidence)
    : "";
  const cleanQuote =
    evidence.length > 5 ? evidence : stripQuotes(regret.source_quote ?? "");
  const role = roleFor(regret.guest_name, regret.company);

  const hasEpisodeUrl =
    typeof regret.episode_url === "string" &&
    /^https?:\/\//i.test(regret.episode_url);
  // Fallback: if we don't have a direct episode URL, search Lenny's site for it.
  const fallbackUrl = `https://www.lennysnewsletter.com/search?q=${encodeURIComponent(
    regret.episode_title,
  )}`;
  const listenHref = hasEpisodeUrl
    ? (regret.episode_url as string)
    : fallbackUrl;
  const listenLabel = hasEpisodeUrl
    ? "Listen on Lenny's Podcast"
    : "Find this episode on Lenny's";

  return (
    <article className="container mx-auto px-6 py-20 max-w-3xl">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] font-bold text-muted-foreground hover:text-foreground mb-12"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to the archive
      </Link>

      <div className="flex items-center gap-3 mb-8 pb-4 border-b border-border/40">
        <span className="text-[10px] uppercase tracking-widest font-bold text-primary">
          {regret.topic_tag}
        </span>
        <span className="w-1 h-1 bg-border rounded-full" />
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {regret.stage} stage
        </span>
        {regret.episode_date ? (
          <>
            <span className="w-1 h-1 bg-border rounded-full" />
            <span className="text-[10px] text-muted-foreground font-mono">
              {regret.episode_date}
            </span>
          </>
        ) : null}
      </div>

      <h1
        className="font-serif text-4xl md:text-5xl font-normal leading-tight text-foreground mb-12"
        data-testid="text-regret-statement"
      >
        {regret.regret_statement}
      </h1>

      <blockquote className="relative pl-6 border-l border-primary/40 mb-14">
        <span
          aria-hidden="true"
          className="absolute -left-2 -top-6 font-serif text-7xl text-primary/30 leading-none select-none"
        >
          “
        </span>
        <p className="text-xl md:text-2xl font-serif text-foreground/80 italic leading-relaxed">
          {cleanQuote}
        </p>
      </blockquote>

      <div className="border-t border-border/40 pt-8 mb-14">
        <p className="font-sans font-bold text-base text-foreground uppercase tracking-wide">
          {regret.guest_name}
        </p>
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground mt-1">
          {role}
        </p>
      </div>

      <div className="border border-border bg-card/40 p-8 mb-10">
        <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-muted-foreground mb-3">
          Source episode
        </p>
        <p className="font-serif text-xl text-foreground leading-snug mb-6">
          {regret.episode_title}
        </p>
        <a
          href={listenHref}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() =>
            track("episode_link_clicked", {
              regret_id: regret.id,
              guest_name: regret.guest_name,
              episode_title: regret.episode_title,
              episode_url: regret.episode_url ?? null,
              fallback: !hasEpisodeUrl,
            })
          }
          className="inline-flex items-center gap-2 text-xs uppercase tracking-widest font-bold text-primary hover:text-foreground transition-colors border-b border-primary pb-1"
          data-testid="link-episode-source"
        >
          {listenLabel}
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="sm"
          onClick={copyLink}
          className="rounded-none text-xs uppercase tracking-widest font-bold"
          data-testid="button-copy-link"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 mr-2" /> Copied
            </>
          ) : (
            <>
              <Link2 className="w-3.5 h-3.5 mr-2" /> Copy link
            </>
          )}
        </Button>
      </div>
    </article>
  );
}
