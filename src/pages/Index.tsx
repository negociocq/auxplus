import { Navigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { LoadingScreen } from "@/components/shared/LoadingScreen";

function hasAuthCallbackInUrl() {
  const url = new URL(window.location.href);
  if (url.searchParams.get("code")) return true;
  if (url.searchParams.get("error") || url.searchParams.get("error_code")) {
    return true;
  }
  const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
  if (!hash) return false;
  const params = new URLSearchParams(hash);
  return Boolean(
    params.get("access_token") ||
      params.get("error") ||
      params.get("error_code") ||
      params.get("type"),
  );
}

const Index = () => {
  const { user, loading } = useApp();

  // Supabase (Site URL) redireciona para "/" com tokens ou erro no hash
  if (typeof window !== "undefined" && hasAuthCallbackInUrl()) {
    const { search, hash } = window.location;
    return <Navigate to={`/auth/confirm${search}${hash}`} replace />;
  }

  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to="/dashboard" replace />;
};

export default Index;
