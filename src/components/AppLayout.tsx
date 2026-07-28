import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  FolderOpen,
  HeadphonesIcon,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Shield,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApp } from "@/context/AppContext";
import { cn } from "@/lib/utils";

export function AppLayout() {
  const { user, logout } = useApp();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  const links = user.isAdmin
    ? [
        { to: "/admin", label: "Usuários", icon: Users },
        { to: "/admin/tickets", label: "Tickets", icon: HeadphonesIcon },
      ]
    : [
        { to: "/dashboard", label: "Pastas", icon: FolderOpen },
        { to: "/tickets", label: "Suporte", icon: HeadphonesIcon },
        { to: "/change-password", label: "Alterar senha", icon: KeyRound },
      ];

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4 shadow-sm">
        <Button
          variant="outline"
          size="icon"
          className="md:hidden"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X /> : <Menu />}
        </Button>
        <Link to={user.isAdmin ? "/admin" : "/dashboard"} className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-sky-600 text-white">
            {user.isAdmin ? <Shield className="h-4 w-4" /> : <LayoutDashboard className="h-4 w-4" />}
          </div>
          <span className="text-lg font-bold tracking-tight text-sky-700">AuxPlus</span>
        </Link>
        <div className="ml-auto flex items-center gap-3 text-sm text-slate-600">
          <span>
            Olá, <strong>{user.username}</strong>
          </span>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl">
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 w-64 translate-x-0 border-r border-slate-200 bg-slate-900 pt-14 text-white transition-transform md:static md:translate-x-0 md:pt-0",
            !open && "-translate-x-full md:translate-x-0",
          )}
        >
          <nav className="flex flex-col gap-1 p-4">
            {links.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors",
                    isActive
                      ? "bg-sky-600 text-white"
                      : "text-slate-200 hover:bg-slate-800",
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>
        </aside>

        {open && (
          <button
            className="fixed inset-0 z-30 bg-black/40 md:hidden"
            aria-label="Fechar menu"
            onClick={() => setOpen(false)}
          />
        )}

        <main className="min-h-[calc(100vh-3.5rem)] flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
