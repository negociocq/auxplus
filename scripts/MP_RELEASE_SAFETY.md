# PIX fulfillment safety

Incident on 2026-11-08: the same payment produced a completed server renewal at
12:29 Brasília and a completed browser renewal at 13:21. The browser could replace
a server completion with a newer local snapshot, then reclaim the two-minute
execution lease and spend another credit.

Financial execution now belongs exclusively to `mp-webhook`. The browser requests
server processing and reads the resulting item; it never renews the panel itself.
Claims are permanent, unique by owner/payment and by legacy order ID. Database
triggers preserve those claims even against old tabs attempting to delete them,
and prevent completed orders from becoming pending/approved again. Historical
completed orders are backfilled without executing panel operations.

Panel writes use one HTTP method and one transport attempt. Network errors and
partial failures retain their claims. They require an operator to inspect panel
history and payment history; neither a timeout nor elapsed time authorizes replay.
Read-only panel requests retain transport fallback. This trades automatic retry
for protection against a second credit debit when the provider has no idempotency
contract. Never clear a claim merely because it is old.

Validation: `node scripts/verify-mp-release-idempotency.mjs`, Vite build, Deno check
of `mp-webhook`, and PostgreSQL trigger checks with rolled-back synthetic records.
No real payment or panel mutation is necessary for these checks.

The incident's extra month/credit is not reversed by this change. Reconciliation
of an already consumed provider credit is a separate operation.
