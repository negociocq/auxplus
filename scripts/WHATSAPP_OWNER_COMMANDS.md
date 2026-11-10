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

## Trial release

`liberar teste` is accepted only from the connected owner (`fromMe`) in the
customer's private conversation. It grants one new trial and resets the old
device-selection state. Customers cannot release their own test.

`wa_trial_history` preserves usage independently of the UniPlay account and
browser/conversation state. Its claim is reserved atomically before contacting
UniPlay. An uncertain creation is never retried automatically; a new owner
release is required. Only the server role can write or grant a release.

Expired legacy activation sessions stop before recovery or photo recognition.
Unknown mobile OS is requested again instead of assuming Android. iPhone users
receive the App Store link and Settings/gear instructions for their MAC.

Validation: the handoff check covers the expired legacy-session regression,
deleted browser state, owner-only one-use release, and MAC acknowledgement/error
responses. Personal-device and partner checks cover iOS routing and no replay
of creation/activation through multiple proxies. None creates a real trial.
