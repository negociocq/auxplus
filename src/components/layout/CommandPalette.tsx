import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FolderKanban,
  KeyRound,
  LifeBuoy,
  LogOut,
  Moon,
  Sun,
  Users,
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

export function CommandPalette() {
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
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Buscar páginas, pastas e ações…" />
      <CommandList>
        <CommandEmpty>Nenhum resultado.</CommandEmpty>
        <CommandGroup heading="Navegação">
          {user.isAdmin ? (
            <>
              <CommandItem onSelect={() => go("/admin")}>
                <Users className="mr-2 h-4 w-4" />
                Usuários
              </CommandItem>
              <CommandItem onSelect={() => go("/admin/tickets")}>
                <LifeBuoy className="mr-2 h-4 w-4" />
                Tickets admin
              </CommandItem>
            </>
          ) : (
            <>
              <CommandItem onSelect={() => go("/dashboard")}>
                <FolderKanban className="mr-2 h-4 w-4" />
                Pastas
              </CommandItem>
              <CommandItem onSelect={() => go("/tickets")}>
                <LifeBuoy className="mr-2 h-4 w-4" />
                Tickets
              </CommandItem>
              <CommandItem onSelect={() => go("/change-password")}>
                <KeyRound className="mr-2 h-4 w-4" />
                Trocar senha
              </CommandItem>
            </>
          )}
        </CommandGroup>
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
