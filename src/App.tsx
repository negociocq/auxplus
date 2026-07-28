import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";
import { AppProvider } from "@/context/AppContext";
import { AppLayout } from "@/components/AppLayout";
import { RequireAuth } from "@/components/RequireAuth";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import FolderItems from "./pages/FolderItems";
import Tickets from "./pages/Tickets";
import ChangePassword from "./pages/ChangePassword";
import { AdminTickets, AdminUsers } from "./pages/Admin";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AppProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            <Route element={<RequireAuth />}>
              <Route element={<AppLayout />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/folders/:folderId" element={<FolderItems />} />
                <Route path="/tickets" element={<Tickets />} />
                <Route path="/change-password" element={<ChangePassword />} />
              </Route>
            </Route>

            <Route element={<RequireAuth adminOnly />}>
              <Route element={<AppLayout />}>
                <Route path="/admin" element={<AdminUsers />} />
                <Route path="/admin/tickets" element={<AdminTickets />} />
              </Route>
            </Route>

            <Route path="/home" element={<Navigate to="/" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AppProvider>
  </QueryClientProvider>
);

export default App;
