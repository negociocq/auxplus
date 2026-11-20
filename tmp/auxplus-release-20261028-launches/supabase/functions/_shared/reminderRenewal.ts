/** A paid renewal retires its old expiration cycle, even after midnight or a stale sync. */
export function isPaidReminderCycle(
  item: { id: unknown; item_id: unknown; due_date: unknown },
  orders: Record<string, unknown>[],
): boolean {
  const due = String(item.due_date || "").slice(0, 10);
  if (!due) return false;
  const username = String(item.item_id || "").trim().toLowerCase();
  return orders.some((order) => {
    if (!["approved", "released"].includes(String(order.status))) return false;
    if (order.kind && order.kind !== "renew") return false;
    const sameId = Boolean(order.itemRefId) && String(order.itemRefId) === String(item.id);
    const sameUser = Boolean(username) && String(order.panelUsername || "").trim().toLowerCase() === username;
    const oldDue = String(order.dueDate || "").slice(0, 10);
    return (sameId || sameUser) && Boolean(oldDue) && due <= oldDue;
  });
}
