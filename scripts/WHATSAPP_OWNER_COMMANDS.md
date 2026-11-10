# Owner PIX shortcut

Send `enviar pix` from the connected WhatsApp account in a client's private chat.
The webhook accepts this shortcut only for `fromMe` messages with the exact
command (case insensitive). `enviar pix USERNAME` explicitly chooses an access
when several client records share the recipient's phone number. Selection stays
within that account and phone's client records; unknown or ambiguous recipients
cannot create a charge.

The shortcut keeps the conversation paused for human service. It uses the stored
plan price and plan months, reuses a still-valid pending PIX, and sends the intro
and copy/paste code without an automatic menu or an extra "generating" message.
Missing price/payment configuration produces an error and leaves human service
open. A customer typing the same text cannot bypass the human pause. Explicit
owner resends can resend the existing code despite automatic-message caps; event
ID deduplication still blocks replay of the same incoming command.

PIX generation shares the normal customer renewal implementation and serializes
invoice creation so simultaneous renewal commands preserve both pending orders.
No panel renewal is performed here: the separate verified-payment fulfillment
and permanent payment claims remain responsible for renewal after payment.

Validation: `node scripts/verify-whatsapp-handoff.mjs` covers human pause, owner
authorization, saved price, pending-code reuse, event dedup, ambiguous access,
original customer renewal and concurrent invoice creation. All payments and
WhatsApp sends in these checks are mocked.
