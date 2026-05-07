import { Link, useLocation } from "wouter";
import { BookOpen, Trophy, Database, Home } from "lucide-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const navItems = [
    { href: "/", label: "Search", icon: Home },
    { href: "/browse", label: "Browse", icon: BookOpen },
    { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
    { href: "/ingest", label: "Ingest", icon: Database },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground dark selection:bg-primary/30">
      <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group transition-opacity hover:opacity-80">
            <div className="w-8 h-8 rounded-sm bg-primary/20 flex items-center justify-center border border-primary/30 text-primary group-hover:bg-primary/30 transition-colors">
              <BookOpen className="w-4 h-4" />
            </div>
            <span className="font-serif font-semibold text-lg tracking-tight">The PM Confessional</span>
          </Link>
          
          <nav className="flex items-center gap-1 md:gap-4">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  data-testid={`nav-${item.label.toLowerCase()}`}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden md:inline">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="flex-1 flex flex-col">
        {children}
      </main>

      <footer className="py-8 border-t border-border/50 text-center text-muted-foreground mt-auto">
        <div className="container mx-auto px-4">
          <p className="font-serif text-sm italic">The pattern recognition that takes a decade to earn takes 10 seconds to access.</p>
        </div>
      </footer>
    </div>
  );
}
