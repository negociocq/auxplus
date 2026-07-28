import { Navigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";

const Index = () => {
  const { user, loading } = useApp();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-600">
        Carregando AuxPlus...
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (user.isAdmin) return <Navigate to="/admin" replace />;
  return <Navigate to="/dashboard" replace />;
};

export default Index;
