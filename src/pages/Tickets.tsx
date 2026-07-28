import { useMemo, useState, type FormEvent } from "react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/context/AppContext";
import { createTicket } from "@/lib/storage";

export default function Tickets() {
  const { user, data, setData } = useApp();
  const [question, setQuestion] = useState("");

  const tickets = useMemo(
    () => data.tickets.filter((t) => t.userId === user?.id),
    [data.tickets, user?.id],
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!user || !question.trim()) return;
    setData(createTicket(data, user.id, question.trim()));
    setQuestion("");
    toast.success("Ticket enviado com sucesso!");
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Suporte</h1>
        <p className="text-sm text-slate-600">Envie dúvidas ou problemas para o admin.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Novo ticket</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="question">Sua mensagem</Label>
              <Textarea
                id="question"
                rows={4}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Descreva seu problema..."
                required
              />
            </div>
            <Button type="submit" className="bg-sky-600 hover:bg-sky-700">
              Enviar
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {tickets.length === 0 ? (
          <p className="rounded-lg border border-dashed bg-white p-6 text-sm text-slate-500">
            Nenhum ticket ainda.
          </p>
        ) : (
          tickets.map((ticket) => (
            <Card key={ticket.id}>
              <CardContent className="space-y-2 pt-6">
                <p className="text-xs text-slate-500">
                  {format(parseISO(ticket.createdAt), "dd/MM/yyyy HH:mm")}
                </p>
                <p className="font-medium">{ticket.question}</p>
                {ticket.response ? (
                  <div className="rounded-md bg-sky-50 p-3 text-sm text-sky-900">
                    <strong>Resposta:</strong> {ticket.response}
                  </div>
                ) : (
                  <p className="text-sm text-amber-600">Aguardando resposta...</p>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
