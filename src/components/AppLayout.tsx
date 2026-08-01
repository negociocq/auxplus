import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Camera,
  Eye,
  EyeOff,
  FolderKanban,
  KeyRound,
  LifeBuoy,
  LogOut,
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
import { useWhatsappAutoSend } from "@/hooks/useWhatsappAutoSend";
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
import { BrandLogo } from "@/components/shared/BrandLogo";
import { cn } from "@/lib/utils";
import { LoadingScreen } from "@/components/shared/LoadingScreen";

const COLLAPSED_KEY = "auxplus-sidebar-collapsed";

export function AppLayout() {
  const { user, data, setData, logout, loading } = useApp();
  const { hidden: hideBalance, toggle: toggleHideBalance } = useHideBalance();
  useWhatsappAutoSend(user, data);
  const navigate = useNavigate();
  const location = useLocation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
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
          {!collapsed ? (
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              className="mb-2 flex w-full items-center gap-3 rounded-lg bg-sidebar-accent/50 px-3 py-2.5 text-left transition hover:bg-sidebar-accent"
            >
              {profileAvatar}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {user.username}
                </p>
                <p className="text-xs text-sidebar-foreground/60">
                  {user.isAdmin ? "Operador · Admin" : "Operador"}
                  {" · editar foto"}
                </p>
              </div>
            </button>
          ) : (
            <div className="mb-2 flex justify-center">
              <button
                type="button"
                onClick={() => setProfileOpen(true)}
                aria-label="Foto de perfil"
              >
                {profileAvatar}
              </button>
            </div>
          )}
          {user.isAdmin ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size={collapsed ? "icon" : "default"}
                  className={cn(
                    "mb-1 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                    collapsed ? "mx-auto" : "w-full justify-start gap-2",
                  )}
                  onClick={() =>
                    navigate(isAdminArea ? "/dashboard" : "/admin")
                  }
                  aria-label={
                    isAdminArea ? "Voltar ao painel" : "Painel admin"
                  }
                >
                  {isAdminArea ? (
                    <ArrowLeft className="h-4 w-4" />
                  ) : (
                    <Shield className="h-4 w-4" />
                  )}
                  {!collapsed &&
                    (isAdminArea ? "Voltar ao painel" : "Painel admin")}
                </Button>
              </TooltipTrigger>
              {collapsed ? (
                <TooltipContent side="right">
                  {isAdminArea ? "Voltar ao painel" : "Painel admin"}
                </TooltipContent>
              ) : null}
            </Tooltip>
          ) : null}
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
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={hideBalance ? "Mostrar saldo" : "Ocultar saldo"}
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
                {hideBalance ? "Mostrar saldo" : "Ocultar saldo"}
              </TooltipContent>
            </Tooltip>
            <ThemeToggle />
          </div>
        </header>

        <main className="ax-page animate-slide-up">
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
