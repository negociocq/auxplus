import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Cable,
  FolderKanban,
  KeyRound,
  LifeBuoy,
  LogOut,
  MessageCircle,
  Moon,
  Settings,
  Shield,
  Sun,
  Tv,
  Users,
  Workflow,
} from "lucide-react";
import { useTheme } from "next-themes";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useApp } from "@/context/AppContext";
import { normSearch } from "@/lib/utils";

export function CommandPalette({
  uniplayConnected = false,
}: {
  uniplayConnected?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { user, logout, data } = useApp();
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("auxplus:command", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("auxplus:command", onOpen);
    };
  }, []);

  const folders = useMemo(
    () =>
      data.folders
        .filter((f) => f.userId === user?.id)
        .filter((f) => !/^Pasta recuperada\b/i.test(f.name))
        .slice(0, 12),
    [data.folders, user?.id],
  );

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  if (!user) return null;

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      filter={(value, search) =>
        normSearch(value).includes(normSearch(search)) ? 1 : 0
      }
    >
      <CommandInput placeholder="Buscar páginas, pastas e ações…" />
      <CommandList>
        <CommandEmpty>Nenhum resultado.</CommandEmpty>
        <CommandGroup heading="Navegação">
          <CommandItem onSelect={() => go("/dashboard")}>
            <FolderKanban className="mr-2 h-4 w-4" />
            Pastas
          </CommandItem>
          <CommandItem onSelect={() => go("/whatsapp")}>
            <MessageCircle className="mr-2 h-4 w-4" />
            WhatsApp
          </CommandItem>
          {uniplayConnected ? (
            <CommandItem onSelect={() => go("/uniplay")}>
              <Tv className="mr-2 h-4 w-4" />
              UniPlay
            </CommandItem>
          ) : null}
          <CommandItem onSelect={() => go("/conexoes")}>
            <Cable className="mr-2 h-4 w-4" />
            Conexões
          </CommandItem>
          <CommandItem onSelect={() => go("/tickets")}>
            <LifeBuoy className="mr-2 h-4 w-4" />
            Tickets
          </CommandItem>
          <CommandItem onSelect={() => go("/settings")}>
            <Settings className="mr-2 h-4 w-4" />
            Configuração
          </CommandItem>
        </CommandGroup>
        {user.isAdmin ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Administração">
              <CommandItem onSelect={() => go("/admin")}>
                <Shield className="mr-2 h-4 w-4" />
                Painel admin
              </CommandItem>
              <CommandItem onSelect={() => go("/admin")}>
                <Users className="mr-2 h-4 w-4" />
                Usuários
              </CommandItem>
              <CommandItem onSelect={() => go("/admin/tickets")}>
                <LifeBuoy className="mr-2 h-4 w-4" />
                Tickets admin
              </CommandItem>
              <CommandItem onSelect={() => go("/admin/api")}>
                <KeyRound className="mr-2 h-4 w-4" />
                API
              </CommandItem>
              <CommandItem onSelect={() => go("/admin/automations")}>
                <Workflow className="mr-2 h-4 w-4" />
                Automações
              </CommandItem>
              <CommandItem onSelect={() => go("/dashboard")}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar ao painel
              </CommandItem>
            </CommandGroup>
          </>
        ) : null}
        {folders.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Pastas recentes">
              {folders.map((f) => (
                <CommandItem
                  key={f.id}
                  onSelect={() => go(`/folders/${f.id}`)}
                >
                  <FolderKanban className="mr-2 h-4 w-4" />
                  {f.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
        <CommandSeparator />
        <CommandGroup heading="Preferências">
          <CommandItem
            onSelect={() =>
              setTheme(resolvedTheme === "dark" ? "light" : "dark")
            }
          >
            {resolvedTheme === "dark" ? (
              <Sun className="mr-2 h-4 w-4" />
            ) : (
              <Moon className="mr-2 h-4 w-4" />
            )}
            Alternar tema
          </CommandItem>
          <CommandItem
            onSelect={() => {
              setOpen(false);
              logout();
              navigate("/login");
            }}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
