import { Link, useLocation } from "wouter";
import { BookOpen, Trophy, Search, ShieldCheck, Workflow, Sparkles } from "lucide-react";

const AI_STUDIO_PROMPT = `You are exploring "The PM Confessional" — a searchable archive of 700+ first-person regrets shared by product leaders on Lenny's Podcast. Each confession has a verbatim transcript span, a topic tag, and a guest. Help me think through a product decision by drawing pattern recognition from this archive. Ground every claim in a confession when you can. Site: https://pm-confessional.replit.app`;

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const navItems = [
    { href: "/", label: "Search", icon: Search },
    { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
    { href: "/methodology", label: "Methodology", icon: ShieldCheck },
    { href: "/how-it-works", label: "How it works", icon: Workflow },
  ];

  const aiStudioUrl = `https://aistudio.google.com/prompts/new_chat?prompt=${encodeURIComponent(AI_STUDIO_PROMPT)}`;

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground dark selection:bg-primary/30">
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur-sm">
        <div className="container mx-auto px-6 h-20 flex items-center justify-between gap-6">
          <Link href="/" className="flex items-center gap-3 group transition-opacity hover:opacity-80">
            <div className="w-10 h-10 rounded bg-primary text-primary-foreground flex items-center justify-center">
              <BookOpen className="w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <span className="font-serif font-medium text-xl tracking-tight leading-none text-foreground">
                The PM Confessional
              </span>
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">
                Lessons in Hindsight
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-6">
            {navItems.map((item) => {
              const isActive =
                location === item.href ||
                (item.href !== "/" && location.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                  className={`text-xs uppercase tracking-widest font-medium transition-colors ${
                    isActive
                      ? "text-primary border-b border-primary pb-1"
                      : "text-muted-foreground hover:text-foreground pb-1"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="flex-1 flex flex-col">
        {children}
      </main>

      <footer className="py-12 border-t border-border/40 text-center text-muted-foreground mt-auto bg-background">
        <div className="container mx-auto px-6 max-w-3xl">
          <p className="font-serif text-lg italic text-foreground/70 mb-6">
            "The pattern recognition that takes a decade to earn takes 10 seconds to access."
          </p>

          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 mb-8">
            <a
              href={aiStudioUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold text-primary hover:text-foreground transition-colors border border-primary/40 hover:border-primary px-3 py-2"
              data-testid="link-ai-studio"
            >
              <Sparkles className="w-3 h-3" />
              Try this in Google AI Studio
            </a>
            <Link
              href="/methodology"
              className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground hover:text-foreground"
            >
              Methodology
            </Link>
            <Link
              href="/how-it-works"
              className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground hover:text-foreground"
            >
              How it works
            </Link>
          </div>

          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70 max-w-xl mx-auto leading-relaxed">
            Not affiliated with Lenny's Podcast. All confessions are verbatim
            quotes from public episodes, surfaced under fair use for editorial
            commentary. To request removal of a confession, email{" "}
            <a
              href="mailto:sheldon.gomes@gmail.com"
              className="text-primary hover:text-foreground"
            >
              sheldon.gomes@gmail.com
            </a>
            .
          </p>

          <p className="text-[9px] uppercase tracking-widest opacity-30 mt-6">
            Anonymous usage analytics via PostHog (no personal data collected)
          </p>
        </div>
      </footer>
    </div>
  );
}
