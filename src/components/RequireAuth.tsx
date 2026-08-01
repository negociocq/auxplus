import { Navigate, Outlet } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { LoadingScreen } from "@/components/shared/LoadingScreen";

export function RequireAuth({ adminOnly = false }: { adminOnly?: boolean }) {
  const { user, loading } = useApp();

  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  // Admin também usa o painel do cliente; só bloqueia rotas adminOnly
  if (adminOnly && !user.isAdmin) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
