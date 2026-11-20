import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/shared/BrandLogo";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname,
    );
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center p-6 ax-gradient-mesh">
      <div className="ax-surface w-full max-w-md p-8 text-center animate-slide-up">
        <div className="flex justify-center">
          <BrandLogo size="md" />
        </div>
        <h1 className="mt-4 text-5xl font-bold tracking-tight">404</h1>
        <p className="mt-2 text-muted-foreground">Página não encontrada.</p>
        <Button asChild className="mt-6">
          <Link to="/">
            <Home className="h-4 w-4" />
            Voltar ao início
          </Link>
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
