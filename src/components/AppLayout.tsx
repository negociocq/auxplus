import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Camera,
  Eye,
  EyeOff,
  FolderKanban,
  KeyRound,
  LifeBuoy,
  Download,
  LogOut,
  Mail,
  Menu,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Shield,
  Trash2,
  Users,
  Workflow,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/context/AppContext";
import { useHideBalance } from "@/hooks/useHideBalance";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { useWhatsappAutoSend } from "@/hooks/useWhatsappAutoSend";
import { useLocalAlerts } from "@/hooks/useLocalAlerts";
import { useMpOrderAutoRelease } from "@/hooks/useMpOrderAutoRelease";
import { useCreditLog } from "@/hooks/useCreditLog";
import { fileToAvatarDataUrl, saveLocalAvatar } from "@/lib/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { HeaderUniplayCredits } from "@/components/layout/HeaderUniplayCredits";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { BrandLogo } from "@/components/shared/BrandLogo";
import { cn } from "@/lib/utils";
import { LoadingScreen } from "@/components/shared/LoadingScreen";

const COLLAPSED_KEY = "auxplus-sidebar-collapsed";

export function AppLayout() {
  const { user, data, setData, logout, loading } = useApp();
  const { hidden: hideBalance, toggle: toggleHideBalance } = useHideBalance();
  const {
    canOfferInstall,
    ios: isIosInstall,
    promptInstall,
  } = usePwaInstall();
  useWhatsappAutoSend(user, data);
  useLocalAlerts(user, data);
  useMpOrderAutoRelease(user, data, setData);
  useCreditLog(user);
  const navigate = useNavigate();
  const location = useLocation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileOpenRef = useRef(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === "true";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    mobileOpenRef.current = mobileOpen;
  }, [mobileOpen]);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, String(collapsed));
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  // Fecha menu mobile e limpa lock de pointer-events do Radix ao trocar de rota
  // (overlay/exit do Framer ou Dialog preso bloqueava toques no celular).
  useEffect(() => {
    setMobileOpen(false);
    document.body.style.removeProperty("pointer-events");
    document.body.style.removeProperty("overflow");
    document.documentElement.style.removeProperty("pointer-events");
    document.documentElement.style.removeProperty("overflow");
  }, [location.pathname]);

  // Mobile: arrastar ←→ abre/fecha o menu lateral
  useEffect(() => {
    const THRESHOLD = 56;
    let startX = 0;
    let startY = 0;
    let tracking = false;

    const isMobileViewport = () =>
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 1023px)").matches;

    const onTouchStart = (e: TouchEvent) => {
      if (!isMobileViewport() || e.touches.length !== 1) return;
      const target = e.target as HTMLElement | null;
      if (
        target?.closest(
          "input, textarea, select, [contenteditable=true], [data-no-swipe-menu]",
        )
      ) {
        return;
      }
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      tracking = true;
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!tracking || !isMobileViewport()) return;
      tracking = false;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (Math.abs(dx) < THRESHOLD || Math.abs(dx) < Math.abs(dy) * 1.25) {
        return;
      }

      if (dx > 0 && !mobileOpenRef.current) {
        // Esquerda → direita: abrir
        setMobileOpen(true);
      } else if (dx < 0 && mobileOpenRef.current) {
        // Direita → esquerda: fechar / minimizar
        setMobileOpen(false);
      }
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  if (loading) return <LoadingScreen />;
  if (!user) return null;

  const isAdminArea = location.pathname.startsWith("/admin");
  const clientLinks = [
    { to: "/dashboard", label: "Pastas", icon: FolderKanban },
    { to: "/whatsapp", label: "WhatsApp", icon: MessageCircle },
    { to: "/automations", label: "Automações", icon: Workflow },
    { to: "/tickets", label: "Tickets", icon: LifeBuoy },
    { to: "/settings", label: "Configuração", icon: Settings },
  ];
  const adminLinks = [
    { to: "/admin", label: "Usuários", icon: Users },
    { to: "/admin/tickets", label: "Tickets", icon: LifeBuoy },
    { to: "/admin/api", label: "API", icon: KeyRound },
    { to: "/admin/automations", label: "Automações", icon: Workflow },
  ];
  const links = isAdminArea ? adminLinks : clientLinks;

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const handleInstallApp = async () => {
    const result = await promptInstall();
    if (result === "accepted") {
      toast.success("AuxPlus instalado");
      setMobileOpen(false);
      return;
    }
    if (result === "dismissed") {
      setMobileOpen(false);
      return;
    }
    if (isIosInstall) {
      toast.message("Instalar no iPhone", {
        description:
          "Toque em Compartilhar e depois em “Adicionar à Tela de Início”.",
      });
    } else {
      toast.message("Quase lá", {
        description:
          "Recarregue a página e toque de novo em Instalar app. Se ainda não abrir, use o menu ⋮ do Chrome → Instalar app.",
      });
    }
    setMobileOpen(false);
  };

  const setAvatar = (avatarUrl: string | null) => {
    if (!user) return;
    saveLocalAvatar(user.id, avatarUrl);
    setData({
      ...data,
      users: data.users.map((u) =>
        u.id === user.id ? { ...u, avatarUrl } : u,
      ),
    });
  };

  const onPickAvatar = async (file: File | undefined) => {
    if (!file) return;
    setAvatarBusy(true);
    try {
      const url = await fileToAvatarDataUrl(file);
      setAvatar(url);
      toast.success("Foto de perfil atualizada");
      setProfileOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar foto");
    } finally {
      setAvatarBusy(false);
    }
  };

  const initials = user.username.slice(0, 2).toUpperCase();
  const sidebarWidth = collapsed ? "w-[4.5rem]" : "w-72";
  const mainPad = collapsed ? "lg:pl-[4.5rem]" : "lg:pl-72";
  const footerActionClass = cn(
    "flex h-10 w-full shrink-0 items-center overflow-hidden whitespace-nowrap rounded-lg text-sm font-medium transition-colors",
    collapsed ? "justify-center px-0" : "justify-start gap-3 px-3",
    "text-sidebar-foreground/75 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
  );
  const wrapFooterTooltip = (label: string, button: ReactNode) => {
    if (!collapsed) return button;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="w-full">{button}</div>
        </TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    );
  };
  const profileAvatar = (
    <Avatar className="h-9 w-9 cursor-pointer ring-offset-sidebar transition hover:ring-2 hover:ring-sidebar-primary">
      {user.avatarUrl ? (
        <AvatarImage src={user.avatarUrl} alt={user.username} />
      ) : null}
      <AvatarFallback className="bg-sidebar-primary text-xs font-bold text-sidebar-primary-foreground">
        {initials}
      </AvatarFallback>
    </Avatar>
  );

  return (
    <div className="min-h-screen ax-gradient-mesh">
      <CommandPalette />

      {mobileOpen ? (
        <button
          type="button"
          aria-label="Fechar menu"
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width,transform] duration-300 ease-out",
          sidebarWidth,
          mobileOpen
            ? "translate-x-0 pointer-events-auto"
            : "-translate-x-full pointer-events-none lg:translate-x-0 lg:pointer-events-auto",
        )}
      >
        <div
          className={cn(
            "flex items-center py-3",
            collapsed ? "justify-center px-2" : "gap-2 px-3",
          )}
        >
          <BrandLogo
            size="sm"
            markOnly={collapsed}
            inline={!collapsed}
            className={cn(!collapsed && "min-w-0 flex-1")}
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="shrink-0 text-sidebar-foreground lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className={cn("hidden pb-2 lg:block", collapsed ? "px-2" : "px-3")}>
          {wrapFooterTooltip(
            collapsed ? "Expandir menu" : "Minimizar menu",
            <button
              type="button"
              className={footerActionClass}
              onClick={() => setCollapsed((v) => !v)}
              aria-label={collapsed ? "Expandir menu" : "Minimizar menu"}
            >
              {collapsed ? (
                <PanelLeftOpen className="h-4 w-4 shrink-0 opacity-90" />
              ) : (
                <PanelLeftClose className="h-4 w-4 shrink-0 opacity-90" />
              )}
              {!collapsed ? (
                <span className="truncate">Minimizar</span>
              ) : null}
            </button>,
          )}
        </div>

        <Separator className="bg-sidebar-border" />

        <nav
          className={cn(
            "min-h-0 flex-1 space-y-1 overflow-hidden p-2",
            !collapsed && "p-3",
          )}
        >
          {links.map((link) => {
            const navClass = ({ isActive }: { isActive: boolean }) =>
              cn(
                "flex h-10 items-center overflow-hidden whitespace-nowrap rounded-lg text-sm font-medium transition-colors",
                collapsed
                  ? "justify-center px-0"
                  : "justify-start gap-3 px-3",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                  : "text-sidebar-foreground/75 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
              );

            const linkInner = (
              <NavLink
                to={link.to}
                onClick={() => {
                  if (window.innerWidth < 1024) setMobileOpen(false);
                }}
                className={navClass}
              >
                <link.icon className="h-4 w-4 shrink-0 opacity-90" />
                {!collapsed ? (
                  <span className="min-w-0 truncate">{link.label}</span>
                ) : null}
              </NavLink>
            );

            if (!collapsed) {
              return <div key={link.to}>{linkInner}</div>;
            }

            return (
              <Tooltip key={link.to}>
                <TooltipTrigger asChild>
                  <div>{linkInner}</div>
                </TooltipTrigger>
                <TooltipContent side="right">{link.label}</TooltipContent>
              </Tooltip>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              void onPickAvatar(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            aria-label="Foto de perfil"
            title="Editar foto de perfil"
            className={cn(
              "mb-2 flex h-14 w-full shrink-0 items-center overflow-hidden rounded-lg bg-sidebar-accent/50 text-left transition-colors hover:bg-sidebar-accent",
              collapsed
                ? "justify-center px-0"
                : "justify-start gap-3 px-3",
            )}
          >
            {profileAvatar}
            {!collapsed ? (
              <div className="min-w-0 flex-1 overflow-hidden whitespace-nowrap">
                <p className="truncate text-sm font-semibold">
                  {user.username}
                </p>
                <p className="truncate text-xs text-sidebar-foreground/60">
                  {user.isAdmin ? "Admin" : "Operador"}
                  <span className="text-sidebar-foreground/45"> · foto</span>
                </p>
              </div>
            ) : null}
          </button>
          {user.isAdmin
            ? wrapFooterTooltip(
                isAdminArea ? "Voltar ao painel" : "Painel admin",
                <button
                  type="button"
                  className={cn(footerActionClass, "mb-1")}
                  onClick={() =>
                    navigate(isAdminArea ? "/dashboard" : "/admin")
                  }
                  aria-label={
                    isAdminArea ? "Voltar ao painel" : "Painel admin"
                  }
                >
                  {isAdminArea ? (
                    <ArrowLeft className="h-4 w-4 shrink-0 opacity-90" />
                  ) : (
                    <Shield className="h-4 w-4 shrink-0 opacity-90" />
                  )}
                  {!collapsed ? (
                    <span className="truncate">
                      {isAdminArea ? "Voltar ao painel" : "Painel admin"}
                    </span>
                  ) : null}
                </button>,
              )
            : null}
          {canOfferInstall
            ? wrapFooterTooltip(
                "Instalar app",
                <button
                  type="button"
                  className={cn(footerActionClass, "mb-1")}
                  onClick={() => void handleInstallApp()}
                  aria-label="Instalar app"
                >
                  <Download className="h-4 w-4 shrink-0 opacity-90" />
                  {!collapsed ? (
                    <span className="truncate">Instalar app</span>
                  ) : null}
                </button>,
              )
            : null}
          {wrapFooterTooltip(
            "Sair",
            <button
              type="button"
              className={footerActionClass}
              onClick={handleLogout}
              aria-label="Sair"
            >
              <LogOut className="h-4 w-4 shrink-0 opacity-90" />
              {!collapsed ? <span className="truncate">Sair</span> : null}
            </button>,
          )}
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
            className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border bg-card px-3 text-left text-sm text-muted-foreground shadow-sm transition hover:bg-accent lg:max-w-xl"
          >
            <Search className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate">Busca rápida…</span>
            <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 text-[10px] font-semibold sm:inline">
              Ctrl K
            </kbd>
          </button>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <HeaderUniplayCredits user={user} hideBalance={hideBalance} />
            <NotificationBell />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={
                    hideBalance
                      ? "Mostrar números e saldos"
                      : "Ocultar números e saldos"
                  }
                  onClick={toggleHideBalance}
                >
                  {hideBalance ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {hideBalance
                  ? "Mostrar números e saldos"
                  : "Ocultar números e saldos"}
              </TooltipContent>
            </Tooltip>
            <ThemeToggle />
          </div>
        </header>

        <main className="ax-page animate-slide-up">
          {!user.email?.trim() ? (
            <div
              role="status"
              className="mb-4 flex flex-col gap-3 rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-start gap-3">
                <Mail className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-amber-950 dark:text-amber-50">
                    {user.pendingEmail?.trim()
                      ? "Confirme seu e-mail"
                      : "Adicione um e-mail à sua conta"}
                  </p>
                  <p className="mt-0.5 text-sm text-amber-950/80 dark:text-amber-100/80">
                    {user.pendingEmail?.trim()
                      ? `Enviamos um link para ${user.pendingEmail.trim()}. O e-mail só será vinculado à conta depois que você clicar na confirmação.`
                      : "Contas novas já exigem e-mail com confirmação. Vincule o seu para manter o acesso e poder entrar também pelo e-mail."}
                  </p>
                </div>
              </div>
              {location.pathname !== "/settings" ? (
                <Button
                  type="button"
                  size="sm"
                  className="shrink-0"
                  onClick={() => navigate("/settings")}
                >
                  {user.pendingEmail?.trim()
                    ? "Reenviar / alterar"
                    : "Adicionar e-mail"}
                </Button>
              ) : null}
            </div>
          ) : null}
          <Outlet />
        </main>
      </div>

      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Foto de perfil</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2">
            <Avatar className="h-24 w-24">
              {user.avatarUrl ? (
                <AvatarImage src={user.avatarUrl} alt={user.username} />
              ) : null}
              <AvatarFallback className="bg-primary text-2xl font-bold text-primary-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            <p className="text-sm text-muted-foreground">
              {user.username}
            </p>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              type="button"
              disabled={avatarBusy}
              onClick={() => fileRef.current?.click()}
              className="w-full"
            >
              <Camera className="h-4 w-4" />
              {avatarBusy ? "Processando…" : "Escolher foto"}
            </Button>
            {user.avatarUrl ? (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => {
                  setAvatar(null);
                  toast.message("Foto removida");
                  setProfileOpen(false);
                }}
              >
                <Trash2 className="h-4 w-4" />
                Remover foto
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
