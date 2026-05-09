import { Link } from "wouter";
import { useGetMethodology, getGetMethodologyQueryKey } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ShieldCheck } from "lucide-react";

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border border-border p-6 bg-card/40">
      <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-muted-foreground mb-3">
        {label}
      </p>
      <p className="font-serif text-4xl text-foreground tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground italic mt-2">{sub}</p>}
    </div>
  );
}

export function Methodology() {
  const { data, isLoading } = useGetMethodology({
    query: { queryKey: getGetMethodologyQueryKey() },
  });

  return (
    <article className="container mx-auto px-6 py-20 max-w-3xl">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] font-bold text-muted-foreground hover:text-foreground mb-12"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to the archive
      </Link>

      <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-primary mb-3 inline-flex items-center gap-2">
        <ShieldCheck className="w-3.5 h-3.5" /> Methodology
      </p>
      <h1 className="font-serif text-4xl md:text-5xl text-foreground mb-8 leading-tight">
        How we extract a confession.
      </h1>
      <p className="font-serif text-lg text-muted-foreground italic leading-relaxed mb-14">
        Every entry is a verbatim, first-person admission from a guest on
        Lenny's Podcast. We are aggressive about pulling rows that don't meet
        the bar.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-14">
        {isLoading || !data ? (
          [0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-32 rounded-none bg-secondary" />
          ))
        ) : (
          <>
            <Stat
              label="Episodes scanned"
              value={data.episodes_scanned.toLocaleString()}
              sub="Lenny's Podcast archive"
            />
            <Stat
              label="Visible confessions"
              value={data.total_visible.toLocaleString()}
              sub="passed the audit"
            />
            <Stat
              label="Audited"
              value={data.total_audited.toLocaleString()}
              sub={`${data.total_flagged} flagged & hidden`}
            />
            <Stat
              label="Verbatim verified"
              value={`${Math.round(data.verified_verbatim_pct * 100)}%`}
              sub="have an exact transcript span"
            />
            <Stat
              label="Extractor v1"
              value={`${Math.round(data.extractor_v1_precision * 100)}%`}
              sub="precision (loose prompt)"
            />
            <Stat
              label="Extractor v2"
              value={`${Math.round(data.extractor_v2_precision * 100)}%`}
              sub="precision (after iteration)"
            />
          </>
        )}
      </div>

      <h2 className="font-serif text-2xl text-foreground mb-4">The pipeline</h2>
      <ol className="font-serif text-base md:text-lg text-foreground/90 leading-relaxed space-y-4 list-decimal pl-6 mb-14">
        <li>
          We pull every episode from Lenny's archive via MCP, cache the
          transcript locally so we don't re-fetch.
        </li>
        <li>
          A strict Claude extractor reads each transcript in 800-word chunks
          and looks for first-person past-tense regrets — never imperatives,
          never advice, never third-party stories.
        </li>
        <li>
          For every candidate the extractor must return a verbatim 8-40 word
          span (the "headline evidence") that is provably present in the
          transcript.
        </li>
        <li>
          A second-pass deep audit flags rows that look like advice, that
          can't be located in the transcript, or where the guest is talking
          about someone else. Flagged rows are hidden from search but kept in
          the database for review.
        </li>
        <li>
          Each surviving regret is embedded with Google's
          <code className="font-mono text-sm bg-secondary px-1.5 py-0.5 mx-1">
            gemini-embedding-001
          </code>
          and stored in pgvector for cosine retrieval.
        </li>
        <li>
          At search time we cosine-rank top-20 candidates, then have Gemini
          Flash rerank with a strict 0–10 rubric.
        </li>
      </ol>

      {data && data.flagged_breakdown.length > 0 && (
        <>
          <h2 className="font-serif text-2xl text-foreground mb-4">
            What we flagged
          </h2>
          <ul className="border border-border divide-y divide-border mb-14">
            {data.flagged_breakdown
              .slice()
              .sort((a, b) => b.count - a.count)
              .map((f) => (
                <li
                  key={f.label}
                  className="flex items-center justify-between px-5 py-3"
                >
                  <span className="text-sm font-mono text-foreground">
                    {f.label}
                  </span>
                  <span className="text-xs uppercase tracking-widest font-bold text-muted-foreground">
                    {f.count} hidden
                  </span>
                </li>
              ))}
          </ul>
        </>
      )}

      <h2 className="font-serif text-2xl text-foreground mb-4">
        What this is not
      </h2>
      <p className="font-serif text-base md:text-lg text-foreground/80 leading-relaxed">
        This is not a Lenny's Podcast product, not affiliated, not endorsed.
        Quotes are surfaced under fair use for editorial commentary. If you're
        a guest and want a confession removed, email{" "}
        <a
          href="mailto:sheldon.gomes@gmail.com"
          className="text-primary border-b border-primary"
        >
          sheldon.gomes@gmail.com
        </a>
        .
      </p>
    </article>
  );
}
