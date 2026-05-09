import { useEffect, useRef, useState } from "react";
import { Link, useRoute } from "wouter";
import {
  useGetCoachingSession,
  useReplyCoachingSession,
  getGetCoachingSessionQueryKey,
  type CoachingSession,
  type Regret,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ArrowLeft, Loader2, Send, MessageSquare, ExternalLink } from "lucide-react";
import { track } from "@/lib/analytics";

/**
 * Render a coach message string, transforming `[#123]` citations into
 * inline links to /regret/123. The model is instructed to use that exact
 * format. Unknown ids still render as links — the regret detail page
 * handles 404s.
 */
function CoachMessageBody({ text, knownIds }: { text: string; knownIds: Set<number> }) {
  const parts: Array<string | { id: number }> = [];
  const re = /\[#(\d+)\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push({ id: parseInt(m[1], 10) });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));

  return (
    <div className="whitespace-pre-wrap font-serif text-base md:text-lg leading-relaxed text-foreground/90">
      {parts.map((p, i) =>
        typeof p === "string" ? (
          <span key={i}>{p}</span>
        ) : (
          <Link
            key={i}
            href={`/regret/${p.id}`}
            onClick={() =>
              track("coach_citation_clicked", { regret_id: p.id })
            }
            className={`inline-flex items-center align-baseline px-1.5 py-0.5 mx-0.5 text-[10px] uppercase tracking-widest font-bold border ${
              knownIds.has(p.id)
                ? "text-primary border-primary/40 hover:border-primary hover:bg-primary/10"
                : "text-muted-foreground border-border hover:text-foreground"
            } transition-colors`}
            data-testid={`citation-${p.id}`}
          >
            #{p.id}
          </Link>
        ),
      )}
    </div>
  );
}

function ConfessionSidebarCard({ regret }: { regret: Regret }) {
  const [open, setOpen] = useState(false);
  const evidence =
    (regret.headline_evidence && regret.headline_evidence.trim().length > 5
      ? regret.headline_evidence
      : regret.source_quote) ?? "";
  const episodeUrl =
    typeof regret.episode_url === "string" &&
    /^https?:\/\//i.test(regret.episode_url)
      ? regret.episode_url
      : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block w-full text-left border border-border hover:border-primary/60 transition-colors p-5 group"
        data-testid={`confession-card-${regret.id}`}
      >
        <div className="flex items-center gap-3 mb-3">
          <span className="text-[9px] uppercase tracking-widest font-bold text-primary">
            #{regret.id}
          </span>
          <span className="w-1 h-1 bg-border rounded-full" />
          <span className="text-[9px] uppercase tracking-widest text-muted-foreground">
            {regret.topic_tag}
          </span>
        </div>
        <p className="font-serif text-base leading-snug text-foreground group-hover:text-primary transition-colors mb-3">
          {regret.regret_statement}
        </p>
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {regret.guest_name}
        </p>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-2xl max-h-[85vh] overflow-y-auto rounded-none border-border bg-background p-0"
          data-testid={`confession-modal-${regret.id}`}
        >
          <DialogTitle className="sr-only">
            {regret.regret_statement}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Confession #{regret.id} from {regret.guest_name}
          </DialogDescription>

          <div className="p-8 md:p-10">
            <div className="flex items-center gap-3 mb-6">
              <span className="text-[10px] uppercase tracking-[0.3em] font-bold text-primary">
                #{regret.id}
              </span>
              <span className="w-1 h-1 bg-border rounded-full" />
              <span className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                {regret.topic_tag}
              </span>
              <span className="w-1 h-1 bg-border rounded-full" />
              <span className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                {regret.stage} stage
              </span>
            </div>

            <h2 className="font-serif text-2xl md:text-3xl leading-snug text-foreground mb-6">
              {regret.regret_statement}
            </h2>

            {evidence ? (
              <blockquote className="border-l-2 border-primary/60 pl-5 my-6 font-serif italic text-base md:text-lg text-foreground/85 leading-relaxed">
                "{evidence.replace(/^["“]|["”]$/g, "")}"
              </blockquote>
            ) : null}

            <div className="mt-8 pt-6 border-t border-border space-y-2">
              <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
                {regret.guest_name}
                {regret.company ? ` · ${regret.company}` : ""}
              </p>
              {regret.episode_title ? (
                <p className="font-serif text-sm text-foreground/80 italic">
                  {regret.episode_title}
                  {regret.episode_date ? ` · ${regret.episode_date}` : ""}
                </p>
              ) : null}
            </div>

            <div className="mt-8 flex items-center gap-3">
              <Link
                href={`/regret/${regret.id}`}
                onClick={() => setOpen(false)}
                className="text-[11px] uppercase tracking-widest font-bold text-primary border-b border-primary pb-1 hover:opacity-80"
                data-testid={`confession-modal-detail-${regret.id}`}
              >
                Open full detail
              </Link>
              {episodeUrl ? (
                <a
                  href={episodeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-bold text-muted-foreground hover:text-foreground"
                >
                  Episode <ExternalLink className="w-3 h-3" />
                </a>
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function Coach() {
  const [, params] = useRoute<{ id: string }>("/coach/:id");
  const sessionId = params ? parseInt(params.id, 10) : NaN;
  const enabled = Number.isFinite(sessionId);
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useGetCoachingSession(sessionId, {
    query: {
      queryKey: getGetCoachingSessionQueryKey(sessionId),
      enabled,
    },
  });

  const replyMutation = useReplyCoachingSession();
  const [input, setInput] = useState("");
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (data) {
      track("coach_session_viewed", {
        session_id: data.id,
        message_count: data.messages.length,
      });
    }
  }, [data?.id]);

  // Scroll to the bottom of the thread on new messages.
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [data?.messages.length, replyMutation.isPending]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const message = input.trim();
    if (!message || !enabled || replyMutation.isPending) return;
    track("coach_message_sent", {
      session_id: sessionId,
      message_length: message.length,
      turn_index: data?.messages.length ?? 0,
    });
    replyMutation.mutate(
      { id: sessionId, data: { message } },
      {
        onSuccess: (resp: CoachingSession) => {
          setInput("");
          queryClient.setQueryData(
            getGetCoachingSessionQueryKey(sessionId),
            resp,
          );
        },
      },
    );
  };

  if (!enabled) {
    return (
      <div className="container mx-auto px-6 py-32 max-w-xl text-center">
        <h1 className="text-3xl font-serif text-foreground mb-4">
          Invalid coaching session
        </h1>
        <Link
          href="/"
          className="text-xs uppercase tracking-widest font-bold text-primary border-b border-primary pb-1"
        >
          Back to the archive
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="container mx-auto px-6 py-20 max-w-5xl space-y-4">
        <Skeleton className="h-6 w-40 rounded-none bg-secondary" />
        <Skeleton className="h-12 w-3/4 rounded-none bg-secondary" />
        <Skeleton className="h-32 w-full rounded-none bg-secondary" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="container mx-auto px-6 py-32 max-w-xl text-center">
        <h1 className="text-3xl font-serif text-foreground mb-4">
          Coaching session not found
        </h1>
        <Link
          href="/"
          className="text-xs uppercase tracking-widest font-bold text-primary border-b border-primary pb-1"
        >
          Back to the archive
        </Link>
      </div>
    );
  }

  const knownIds = new Set(data.regret_ids);

  return (
    <div className="w-full flex-1 bg-background">
      <div className="container mx-auto px-6 py-12 max-w-7xl">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] font-bold text-muted-foreground hover:text-foreground mb-10"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to the archive
        </Link>

        <div className="mb-10 pb-8 border-b border-border">
          <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-primary mb-3">
            <MessageSquare className="w-3.5 h-3.5 inline-block mr-2 -mt-0.5" />
            Decision Coach
          </p>
          <h1 className="font-serif text-3xl md:text-4xl text-foreground leading-tight">
            "{data.user_decision}"
          </h1>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mt-3 font-bold">
            Grounded on {data.regrets.length} confessions · powered by Gemini
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-10">
          {/* Thread */}
          <div className="flex flex-col">
            <div
              ref={threadRef}
              className="space-y-8 mb-8 max-h-[60vh] overflow-y-auto pr-2"
              data-testid="coach-thread"
            >
              {data.messages.map((msg, i) => (
                <div
                  key={i}
                  className={
                    msg.role === "user"
                      ? "border-l-2 border-foreground pl-6"
                      : "border-l-2 border-primary pl-6"
                  }
                  data-testid={`coach-msg-${msg.role}-${i}`}
                >
                  <p className="text-[10px] uppercase tracking-[0.3em] font-bold mb-3 text-muted-foreground">
                    {msg.role === "user" ? "You" : "Coach"}
                  </p>
                  {msg.role === "model" ? (
                    <CoachMessageBody text={msg.content} knownIds={knownIds} />
                  ) : (
                    <p className="font-serif text-base md:text-lg leading-relaxed text-foreground whitespace-pre-wrap">
                      {msg.content}
                    </p>
                  )}
                </div>
              ))}
              {replyMutation.isPending && (
                <div className="border-l-2 border-primary/40 pl-6">
                  <p className="text-[10px] uppercase tracking-[0.3em] font-bold mb-3 text-muted-foreground">
                    Coach
                  </p>
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                </div>
              )}
            </div>

            <form
              onSubmit={handleSubmit}
              className="border-t border-border pt-6 sticky bottom-0 bg-background"
            >
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    handleSubmit(e);
                  }
                }}
                placeholder="Ask a follow-up. Cmd/Ctrl+Enter to send."
                className="min-h-[100px] rounded-none bg-card border-border font-serif text-base focus-visible:border-primary focus-visible:ring-0"
                disabled={replyMutation.isPending}
                data-testid="coach-input"
              />
              <div className="flex items-center justify-between mt-3">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Coach cites only the confessions in this session
                </p>
                <Button
                  type="submit"
                  disabled={replyMutation.isPending || input.trim().length === 0}
                  className="rounded-none text-xs uppercase tracking-widest font-bold"
                  data-testid="coach-send"
                >
                  {replyMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <>
                      Send <Send className="w-3.5 h-3.5 ml-2" />
                    </>
                  )}
                </Button>
              </div>
              {replyMutation.isError && (
                <p className="text-xs text-destructive mt-3 italic">
                  Coach failed to respond. Try again in a moment.
                </p>
              )}
            </form>
          </div>

          {/* Source confessions */}
          <aside>
            <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-muted-foreground mb-4">
              Source confessions
            </p>
            <div className="space-y-3">
              {data.regrets.map((r) => (
                <ConfessionSidebarCard key={r.id} regret={r} />
              ))}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
