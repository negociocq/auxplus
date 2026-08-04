import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck, Clock, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useApp } from "@/context/AppContext";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  clearNotifications,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  subscribeNotifications,
  unreadNotificationsCount,
  type InAppNotification,
} from "@/lib/notificationsCenter";
import { cn } from "@/lib/utils";

function relativeTime(at: number) {
  try {
    return formatDistanceToNow(new Date(at), {
      addSuffix: true,
      locale: ptBR,
    });
  } catch {
    return "";
  }
}

/**
 * Sino de notificações no topo: mostra toda notificação enviada ao mobile
 * (`showLocalAlert`), com badge de não-lidas, marcar todas lidas e limpar.
 */
export function NotificationBell() {
  const { user } = useApp();
  const userId = user?.id;
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);

  const refresh = () => {
    if (!userId) {
      setNotifications([]);
      setUnread(0);
      return;
    }
    setNotifications(getNotifications(userId));
    setUnread(unreadNotificationsCount(userId));
  };

  useEffect(() => {
    refresh();
    const off = subscribeNotifications(refresh);
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) refresh();
  };

  const select = (n: InAppNotification) => {
    if (userId) markNotificationRead(userId, n.id);
    if (n.url) navigate(n.url);
  };

  const list = notifications.slice(0, 50);

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Notificações"
              className="relative"
            >
              <Bell className="h-4 w-4" />
              {unread > 0 ? (
                <Badge
                  variant="destructive"
                  className="pointer-events-none absolute -right-0.5 -top-0.5 h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none"
                >
                  {unread > 99 ? "99+" : unread}
                </Badge>
              ) : null}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Notificações</TooltipContent>
      </Tooltip>

      <PopoverContent align="end" sideOffset={8} className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
          <p className="text-sm font-semibold">Notificações</p>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              aria-label="Marcar todas como lidas"
              title="Marcar todas como lidas"
              disabled={!notifications.length || unread === 0}
              onClick={() => userId && markAllNotificationsRead(userId)}
            >
              <CheckCheck className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-destructive hover:text-destructive"
              aria-label="Limpar notificações"
              title="Limpar todas"
              disabled={!notifications.length}
              onClick={() => userId && clearNotifications(userId)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {notifications.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
            <Bell className="h-6 w-6 opacity-40" />
            <p>Nenhuma notificação por enquanto.</p>
          </div>
        ) : (
          <ScrollArea className="h-80">
            <ul className="divide-y divide-border">
              {list.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => select(n)}
                    className={cn(
                      "flex w-full items-start gap-3 px-3 py-3 text-left transition hover:bg-accent",
                      !n.read && "bg-accent/40",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                        n.read ? "bg-transparent" : "bg-primary",
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block text-sm",
                          n.read
                            ? "font-medium text-muted-foreground"
                            : "font-semibold text-foreground",
                        )}
                      >
                        {n.title}
                      </span>
                      {n.body ? (
                        <span className="mt-0.5 block text-sm text-muted-foreground">
                          {n.body}
                        </span>
                      ) : null}
                      <span className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground/70">
                        <Clock className="h-3 w-3" />
                        {relativeTime(n.at)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}