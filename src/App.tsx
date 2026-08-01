import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";
import { AppProvider } from "@/context/AppContext";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { AppLayout } from "@/components/AppLayout";
import { RequireAuth } from "@/components/RequireAuth";
import { LoadingScreen } from "@/components/shared/LoadingScreen";
import Login from "./pages/Login";
import Register from "./pages/Register";
import AuthConfirm from "./pages/AuthConfirm";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const FolderItems = lazy(() => import("./pages/FolderItems"));
const Tickets = lazy(() => import("./pages/Tickets"));
const WhatsApp = lazy(() => import("./pages/WhatsApp"));
const Automations = lazy(() => import("./pages/Automations"));
const Settings = lazy(() => import("./pages/Settings"));
const AdminUsers = lazy(() =>
  import("./pages/Admin").then((m) => ({ default: m.AdminUsers })),
);
const AdminTickets = lazy(() =>
  import("./pages/Admin").then((m) => ({ default: m.AdminTickets })),
);
const AdminApi = lazy(() => import("./pages/AdminApi"));
const AdminAutomations = lazy(() => import("./pages/AdminAutomations"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <AppProvider>
        <TooltipProvider delayDuration={200}>
          <Toaster />
          <Sonner position="top-right" richColors closeButton />
          <BrowserRouter>
            <Suspense fallback={<LoadingScreen />}>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/auth/confirm" element={<AuthConfirm />} />

                <Route element={<RequireAuth />}>
                  <Route element={<AppLayout />}>
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route
                      path="/folders/:folderId"
                      element={<FolderItems />}
                    />
                    <Route path="/tickets" element={<Tickets />} />
                    <Route path="/whatsapp" element={<WhatsApp />} />
                    <Route path="/automations" element={<Automations />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route
                      path="/change-password"
                      element={<Navigate to="/settings" replace />}
                    />
                  </Route>
                </Route>

                <Route element={<RequireAuth adminOnly />}>
                  <Route element={<AppLayout />}>
                    <Route path="/admin" element={<AdminUsers />} />
                    <Route path="/admin/tickets" element={<AdminTickets />} />
                    <Route path="/admin/api" element={<AdminApi />} />
                    <Route
                      path="/admin/automations"
                      element={<AdminAutomations />}
                    />
                  </Route>
                </Route>

                <Route path="/home" element={<Navigate to="/" replace />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
      </AppProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
