import { useMemo, useState, type FormEvent } from "react";
import { LifeBuoy, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/context/AppContext";
import { createTicket } from "@/lib/storage";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export default function Tickets() {
  const { user, data, setData } = useApp();
  const [question, setQuestion] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const tickets = useMemo(
    () => data.tickets.filter((t) => t.userId === user?.id),
    [data.tickets, user?.id],
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!user || !question.trim()) return;
    setData(createTicket(data, user.id, question.trim()));
    setQuestion("");
    toast.success("Ticket enviado com sucesso");
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Tickets"
        description="Fale com o suporte do AuxPlus."
      />

      <form className="ax-surface mb-6 space-y-3 p-5" onSubmit={onSubmit}>
        <div className="flex items-center gap-2 text-sm font-medium">
          <MessageSquare className="h-4 w-4 text-primary" />
          Nova solicitação
        </div>
        <Textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Descreva sua dúvida…"
          required
          className="min-h-[120px]"
        />
        <Button type="submit">Enviar ticket</Button>
      </form>

      <h2 className="mb-3 text-lg font-semibold tracking-tight">Meus tickets</h2>
      {tickets.length === 0 ? (
        <EmptyState
          icon={LifeBuoy}
          title="Nenhum ticket ainda"
          description="Quando enviar uma dúvida, ela aparecerá aqui."
        />
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket) => (
            <Collapsible
              key={ticket.id}
              open={openId === ticket.id}
              onOpenChange={(o) => setOpenId(o ? ticket.id : null)}
            >
              <div
                className={`ax-surface p-4 ${
                  ticket.response ? "border-primary/30" : ""
                }`}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <Badge variant={ticket.response ? "default" : "secondary"}>
                    {ticket.response ? "Respondido" : "Aberto"}
                  </Badge>
                  <CollapsibleTrigger asChild>
                    <Button type="button" variant="ghost" size="sm">
                      {openId === ticket.id ? "Ocultar" : "Ver resposta"}
                    </Button>
                  </CollapsibleTrigger>
                </div>
                <p className="text-sm">
                  <span className="font-semibold">Pergunta: </span>
                  {ticket.question}
                </p>
                <CollapsibleContent className="mt-3 border-t pt-3 text-sm">
                  <span className="font-semibold">Resposta: </span>
                  {ticket.response || "Nenhuma resposta ainda."}
                </CollapsibleContent>
              </div>
            </Collapsible>
          ))}
        </div>
      )}
    </div>
  );
}
