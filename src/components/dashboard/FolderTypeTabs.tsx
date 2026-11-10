import { useEffect, useRef, useState } from "react";
import { Reorder } from "framer-motion";
import { toast } from "sonner";
import type { FolderType } from "@/types";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cacheFolderTabOrder, fetchFolderTabOrder, localFolderTabOrder, normalizeFolderTabOrder, persistFolderTabOrder } from "@/lib/folderTabOrder";

const labels: Record<FolderType, string> = { Cliente: "Clientes", Produto: "Empréstimos", Dívida: "Dívidas" };
export function FolderTypeTabs({ userId, onInitialTab }: { userId?: string; onInitialTab: (type: FolderType) => void }) {
  const [order, setOrder] = useState<FolderType[]>(() => localFolderTabOrder(userId));
  const latest = useRef(order);
  const dirty = useRef(false);
  const reordered = useRef(false);
  const touched = useRef(false);
  const saves = useRef(Promise.resolve());
  useEffect(() => {
    let cancelled = false;
    const local = localFolderTabOrder(userId);
    setOrder(local); latest.current = local;
    dirty.current = false; reordered.current = false; touched.current = false;
    onInitialTab(local[0]);
    if (userId) void fetchFolderTabOrder(userId).then(remote => {
      if (cancelled || !remote || reordered.current) return;
      latest.current = remote; setOrder(remote); cacheFolderTabOrder(userId, remote);
      if (!touched.current) onInitialTab(remote[0]);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [userId, onInitialTab]);
  const reorder = (values: FolderType[]) => {
    const next = normalizeFolderTabOrder(values);
    latest.current = next; setOrder(next);
    touched.current = true; reordered.current = true; dirty.current = true;
    if (userId) cacheFolderTabOrder(userId, next);
  };
  const commit = () => {
    if (!dirty.current || !userId) return;
    dirty.current = false;
    const next = [...latest.current];
    saves.current = saves.current.catch(() => {}).then(() => persistFolderTabOrder(userId, next)).catch(() => {
      toast.error("A ordem ficou salva neste aparelho, mas não foi possível sincronizar com sua conta.");
    });
  };
  return <TabsList asChild className="max-w-full bg-background/80">
    <Reorder.Group as="div" axis="x" values={order} onReorder={reorder} aria-label="Tipos de pasta — arraste para reordenar">
      {order.map(type => <Reorder.Item key={type} as="div" value={type} className="relative min-w-0" style={{ touchAction: "pan-y" }} onDragEnd={commit} onPointerCancel={commit}>
        <TabsTrigger value={type} className="cursor-grab select-none px-2 text-xs active:cursor-grabbing min-[360px]:px-3 min-[360px]:text-sm" title="Arraste para mudar a ordem. No teclado, use Alt + seta para a esquerda ou direita." onPointerDown={() => { touched.current = true; }} onKeyDown={event => {
          touched.current = true;
          if (!event.altKey || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
          event.preventDefault(); event.stopPropagation();
          const from = latest.current.indexOf(type);
          const to = from + (event.key === "ArrowLeft" ? -1 : 1);
          if (to < 0 || to >= latest.current.length) return;
          const next = [...latest.current]; [next[from], next[to]] = [next[to], next[from]];
          reorder(next); commit();
        }}>{labels[type]}</TabsTrigger>
      </Reorder.Item>)}
    </Reorder.Group>
  </TabsList>;
}
