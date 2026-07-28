import { Navigate, Outlet } from "react-router-dom";
import { useApp } from "@/context/AppContext";

export function RequireAuth({ adminOnly = false }: { adminOnly?: boolean }) {
  const { user } = useApp();

  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && !user.isAdmin) return <Navigate to="/dashboard" replace />;
  if (!adminOnly && user.isAdmin) return <Navigate to="/admin" replace />;
  return <Outlet />;
}
