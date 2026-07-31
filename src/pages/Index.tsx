import { Navigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { LoadingScreen } from "@/components/shared/LoadingScreen";

const Index = () => {
  const { user, loading } = useApp();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.isAdmin) return <Navigate to="/admin" replace />;
  return <Navigate to="/dashboard" replace />;
};

export default Index;
