import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  FolderKanban,
  KeyRound,
  LifeBuoy,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Users,
  X,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { cn } from "@/lib/utils";
import { LoadingScreen } from "@/components/shared/LoadingScreen";

const COLLAPSED_KEY = "auxplus-sidebar-collapsed";

export function AppLayout() {
  const { user, logout, loading } = useApp();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, String(collapsed));
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  if (loading) return <LoadingScreen />;
  if (!user) return null;

  const links = user.isAdmin
    ? [
        { to: "/admin", label: "Usuários", icon: Users },
        { to: "/admin/tickets", label: "Tickets", icon: LifeBuoy },
      ]
    : [
        { to: "/dashboard", label: "Pastas", icon: FolderKanban },
        { to: "/tickets", label: "Tickets", icon: LifeBuoy },
        { to: "/change-password", label: "Senha", icon: KeyRound },
      ];

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const initials = user.username.slice(0, 2).toUpperCase();
  const sidebarWidth = collapsed ? "w-[4.5rem]" : "w-72";
  const mainPad = collapsed ? "lg:pl-[4.5rem]" : "lg:pl-72";

  return (
    <div className="min-h-screen ax-gradient-mesh">
      <CommandPalette />

      <AnimatePresence>
        {mobileOpen && (
          <motion.button
            type="button"
            aria-label="Fechar menu"
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileOpen(false)}
          />
        )}
      </AnimatePresence>

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-300 ease-out",
          sidebarWidth,
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div
          className={cn(
            "flex items-center py-4",
            collapsed ? "justify-center px-2" : "gap-3 px-4",
          )}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sidebar-primary font-bold text-sidebar-primary-foreground">
            A+
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/60">
                Operações
              </p>
              <p className="truncate text-lg font-bold tracking-tight">
                AuxPlus
              </p>
            </div>
          )}
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="text-sidebar-foreground lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div
          className={cn(
            "hidden px-2 pb-2 lg:block",
            collapsed ? "px-2" : "px-3",
          )}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size={collapsed ? "icon" : "sm"}
                className={cn(
                  "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                  !collapsed && "w-full justify-start gap-2",
                )}
                onClick={() => setCollapsed((v) => !v)}
                aria-label={collapsed ? "Expandir menu" : "Minimizar menu"}
              >
                {collapsed ? (
                  <PanelLeftOpen className="h-4 w-4" />
                ) : (
                  <>
                    <PanelLeftClose className="h-4 w-4" />
                    Minimizar
                  </>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {collapsed ? "Expandir menu" : "Minimizar menu"}
            </TooltipContent>
          </Tooltip>
        </div>

        <Separator className="bg-sidebar-border" />

        <nav className={cn("flex-1 space-y-1 p-2", !collapsed && "p-3")}>
          {links.map((link) => {
            const navClass = ({ isActive }: { isActive: boolean }) =>
              cn(
                "flex items-center rounded-lg text-sm font-medium transition-colors",
                collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                  : "text-sidebar-foreground/75 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
              );

            if (!collapsed) {
              return (
                <NavLink
                  key={link.to}
                  to={link.to}
                  onClick={() => {
                    if (window.innerWidth < 1024) setMobileOpen(false);
                  }}
                  className={navClass}
                >
                  <link.icon className="h-4 w-4 shrink-0 opacity-90" />
                  {link.label}
                </NavLink>
              );
            }

            return (
              <Tooltip key={link.to}>
                <TooltipTrigger asChild>
                  <div>
                    <NavLink
                      to={link.to}
                      onClick={() => {
                        if (window.innerWidth < 1024) setMobileOpen(false);
                      }}
                      className={navClass}
                    >
                      <link.icon className="h-4 w-4 shrink-0 opacity-90" />
                    </NavLink>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right">{link.label}</TooltipContent>
              </Tooltip>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-2">
          {!collapsed ? (
            <div className="mb-2 flex items-center gap-3 rounded-lg bg-sidebar-accent/50 px-3 py-2.5">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-sidebar-primary text-xs font-bold text-sidebar-primary-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {user.username}
                </p>
                <p className="text-xs text-sidebar-foreground/60">
                  {user.isAdmin ? "Administrador" : "Operador"}
                </p>
              </div>
            </div>
          ) : (
            <div className="mb-2 flex justify-center">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-sidebar-primary text-xs font-bold text-sidebar-primary-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </div>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size={collapsed ? "icon" : "default"}
                className={cn(
                  "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                  collapsed ? "mx-auto" : "w-full justify-start gap-2",
                )}
                onClick={handleLogout}
                aria-label="Sair"
              >
                <LogOut className="h-4 w-4" />
                {!collapsed && "Sair"}
              </Button>
            </TooltipTrigger>
            {collapsed ? (
              <TooltipContent side="right">Sair</TooltipContent>
            ) : null}
          </Tooltip>
        </div>
      </aside>

      <div className={cn("transition-[padding] duration-300", mainPad)}>
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-md sm:px-6">
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="lg:hidden"
            aria-label="Abrir menu"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-4 w-4" />
          </Button>

          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event("auxplus:command"))}
            className="flex h-10 flex-1 items-center gap-2 rounded-lg border bg-card px-3 text-left text-sm text-muted-foreground shadow-sm transition hover:bg-accent sm:max-w-md"
          >
            <Search className="h-4 w-4" />
            <span className="flex-1 truncate">Busca rápida…</span>
            <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 text-[10px] font-semibold sm:inline">
              Ctrl K
            </kbd>
          </button>

          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
          </div>
        </header>

        <main className="ax-page animate-slide-up">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
