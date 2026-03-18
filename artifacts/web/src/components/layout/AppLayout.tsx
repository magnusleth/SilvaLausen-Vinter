import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { 
  Map, 
  LayoutDashboard, 
  Siren, 
  Users, 
  Briefcase, 
  Menu, 
  X,
  Bell,
  Search,
  Settings,
  MapPinned,
} from "lucide-react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/kort", label: "Kort", icon: Map },
  { href: "/udkald/nyt", label: "Nyt udkald", icon: Siren, isAction: true },
];

const secondaryNavItems = [
  { href: "/pladser", label: "Pladser", icon: MapPinned },
  { href: "/kunder", label: "Kunder", icon: Briefcase },
  { href: "/chaufforer", label: "Chauffører", icon: Users },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border z-20">
        <div className="h-16 flex items-center px-6 border-b border-sidebar-border">
          <Siren className="w-6 h-6 text-primary mr-3" />
          <span className="font-display font-bold text-lg tracking-wide">VinterDrift</span>
        </div>
        
        <div className="flex-1 overflow-y-auto py-6 px-4 space-y-8">
          <div>
            <h4 className="px-2 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-3">
              Drift
            </h4>
            <nav className="space-y-1">
              {navItems.map((item) => {
                const isActive = location === item.href;
                return (
                  <Link 
                    key={item.href} 
                    href={item.href}
                    className={cn(
                      "flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group",
                      isActive 
                        ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm" 
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      item.isAction && !isActive && "text-primary hover:text-primary hover:bg-primary/10"
                    )}
                  >
                    <item.icon className={cn("w-5 h-5 mr-3 transition-colors", isActive ? "text-sidebar-primary-foreground" : "text-sidebar-foreground/50 group-hover:text-sidebar-accent-foreground", item.isAction && !isActive && "text-primary")} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div>
            <h4 className="px-2 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-3">
              Katalog
            </h4>
            <nav className="space-y-1">
              {secondaryNavItems.map((item) => {
                const isActive = location === item.href || location.startsWith(item.href + "/");
                return (
                  <Link 
                    key={item.href} 
                    href={item.href}
                    className={cn(
                      "flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group",
                      isActive 
                        ? "bg-sidebar-primary text-sidebar-primary-foreground" 
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <item.icon className={cn("w-5 h-5 mr-3", isActive ? "text-sidebar-primary-foreground" : "text-sidebar-foreground/50 group-hover:text-sidebar-accent-foreground")} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
        
        <div className="p-4 border-t border-sidebar-border">
          <button className="flex items-center w-full px-3 py-2.5 rounded-xl text-sm font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent transition-colors">
            <Settings className="w-5 h-5 mr-3 text-sidebar-foreground/50" />
            Indstillinger
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden relative">
        {/* Topbar */}
        <header className="h-16 flex items-center justify-between px-4 sm:px-6 border-b bg-card/80 backdrop-blur-sm z-10 shrink-0">
          <div className="flex items-center">
            <button 
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 -ml-2 mr-2 text-muted-foreground hover:bg-muted rounded-lg"
            >
              <Menu className="w-6 h-6" />
            </button>
            <div className="hidden sm:flex items-center bg-muted/50 rounded-full px-3 py-1.5 border border-border/50">
              <Search className="w-4 h-4 text-muted-foreground mr-2" />
              <input 
                type="text" 
                placeholder="Søg..." 
                className="bg-transparent border-none outline-none text-sm w-48 text-foreground placeholder:text-muted-foreground"
              />
            </div>
          </div>
          
          <div className="flex items-center space-x-3 sm:space-x-4">
            <button className="relative p-2 text-muted-foreground hover:bg-muted rounded-full transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-destructive rounded-full border-2 border-card"></span>
            </button>
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-primary to-accent flex items-center justify-center text-primary-foreground font-semibold text-sm shadow-sm ring-2 ring-background">
              JD
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto relative">
          {children}
        </main>
      </div>

      {/* Mobile Menu Backdrop */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border z-50 transform transition-transform duration-300 ease-in-out md:hidden",
        mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="h-16 flex items-center justify-between px-6 border-b border-sidebar-border">
          <span className="font-display font-bold text-lg">VinterDrift</span>
          <button onClick={() => setMobileMenuOpen(false)} className="p-1 text-sidebar-foreground/50 hover:text-sidebar-foreground">
            <X className="w-6 h-6" />
          </button>
        </div>
        <nav className="p-4 space-y-2">
          {[...navItems, ...secondaryNavItems].map((item) => (
            <Link 
              key={item.href} 
              href={item.href}
              onClick={() => setMobileMenuOpen(false)}
              className={cn(
                "flex items-center px-4 py-3 rounded-xl text-sm font-medium",
                location === item.href 
                  ? "bg-sidebar-primary text-sidebar-primary-foreground" 
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent"
              )}
            >
              <item.icon className="w-5 h-5 mr-3" />
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
    </div>
  );
}
