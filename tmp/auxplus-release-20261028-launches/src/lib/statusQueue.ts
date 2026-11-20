export type StatusPost = { id: string; post_day: string; banner_day?: string; region?: string; kind?: string; page: number; total: number; status: string; error?: string; sent_at?: string };
export function statusQueueSummary(posts: StatusPost[], day: string) {
  const current = posts.filter(post => post.post_day === day && (!post.banner_day || post.banner_day === day));
  const counts = { total: current.length, sent: 0, pending: 0, failed: 0, awaiting: 0 };
  for (const post of current) {
    if (post.status === "sent") counts.sent++;
    else if (["queued", "sending"].includes(post.status)) counts.pending++;
    else if (post.status === "failed") counts.failed++;
    else counts.awaiting++;
  }
  return { ...counts, label: !counts.total ? "Nenhuma postagem hoje" : counts.sent === counts.total ? "Concluído" : counts.pending ? "Fila em andamento" : counts.failed ? "Fila com erro" : "Aguardando confirmação" };
}
