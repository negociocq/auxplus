import { Navigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";

const Index = () => {
  const { user } = useApp();

  if (!user) return <Navigate to="/login" replace />;
  if (user.isAdmin) return <Navigate to="/admin" replace />;
  return <Navigate to="/dashboard" replace />;
};

export default Index;
