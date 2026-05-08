import { Link, useLocation } from "wouter";
import { BookOpen, Trophy, Search } from "lucide-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const navItems = [
    { href: "/", label: "Search", icon: Search },
    { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground dark selection:bg-primary/30">
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur-sm">
        <div className="container mx-auto px-6 h-20 flex items-center justify-between">
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
          
          <nav className="flex items-center gap-6">
            {navItems.map((item) => {
              const isActive = location === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  data-testid={`nav-${item.label.toLowerCase()}`}
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
        <div className="container mx-auto px-6 max-w-2xl">
          <p className="font-serif text-lg italic text-foreground/70 mb-4">
            "The pattern recognition that takes a decade to earn takes 10 seconds to access."
          </p>
          <p className="text-[10px] uppercase tracking-widest opacity-50">
            A private space for public failures
          </p>
        </div>
      </footer>
    </div>
  );
}
