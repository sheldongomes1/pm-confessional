import { Link, useLocation } from "wouter";
import { BookOpen, Trophy, Database, Search } from "lucide-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const navItems = [
    { href: "/", label: "Search", icon: Search },
    { href: "/browse", label: "Archive", icon: BookOpen },
    { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
    { href: "/ingest", label: "Operations", icon: Database },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground selection:bg-primary/20">
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group transition-opacity hover:opacity-80">
            <div className="w-8 h-8 rounded-sm bg-foreground text-background flex items-center justify-center shadow-sm">
              <BookOpen className="w-4 h-4" />
            </div>
            <span
              className="text-2xl leading-none text-foreground tracking-tight"
              style={{ fontFamily: "var(--app-font-blackletter)" }}
            >
              The PM Confessional
            </span>
          </Link>
          
          <nav className="flex items-center gap-6">
            {navItems.map((item) => {
              const isActive = location === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  data-testid={`nav-${item.label.toLowerCase()}`}
                  className={`text-[11px] uppercase tracking-widest font-semibold transition-colors ${
                    isActive
                      ? "text-primary border-b-2 border-primary pb-1"
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

      <footer className="py-12 border-t border-border text-center text-muted-foreground mt-auto bg-background">
        <div className="container mx-auto px-6 max-w-2xl">
          <p className="font-serif text-lg italic text-foreground/80 mb-4">
            "The pattern recognition that takes a decade to earn takes 10 seconds to access."
          </p>
          <p className="text-[10px] uppercase tracking-widest opacity-60 font-semibold">
            A Research Publication for Product Leaders
          </p>
        </div>
      </footer>
    </div>
  );
}
