# Owner WhatsApp inbound queue

Investigation on 2026-11-08 found the owner's instance reporting `open`, while its
last persisted inbound event was 18:56:56 Brasília. Neither the reported 20:18
trial request nor the 20:33 owner command was present in the local message store.
The bot state had last changed at 18:57:22. The exact trial phrase resolves to the
current Zuxo flow; `Liberar teste` is recognized only on `fromMe` owner messages.

Evolution 2.3.7 queues `connection.update` and `creds.update` behind message work,
including remote profile-picture and read-receipt queries. Its restart controller
closes the socket then immediately checks the old cached `open` state, returning
without waiting for reconnection. A blocked lane can therefore prevent lifecycle
events from updating that state and reconnecting. The specific outstanding call
in the previous process could not be identified from the available diagnostics.

`evolution-inbound-queue.mjs` moves lifecycle/credential events outside that lane
for `auxplus-tarciocq1`, bounds socket queries to eight seconds, and limits profile
and read-receipt waits to two seconds. Other instances retain their event routing.
It does not bypass bot payment safeguards or alter trial eligibility rules.

Validation: `node scripts/verify-inbound-queue.mjs` simulates a permanently blocked
message lane, and verifies that connection/credential events still run. Syntax and
source contracts are checked against the actual installed bundle. The reproducible
image in `tools/evolution-status` retains existing Status transport protections.
The live bundle was backed up and the service restarted without deleting auth.
Image tag: `auxplus/evolution-api:2.3.7-inbound-queue-20261108`; the existing compose
image alias points to it, with the prior image kept under a rollback tag.

A fresh owner message is still required to measure real end-to-end latency. A
healthy socket flag alone does not prove WhatsApp delivery. No synthetic request
is sent to a real customer as a test.

## Recovery without pairing again

Further investigation found the existing authenticated socket answering profile
queries while not delivering pending message frames. Sending the standard
`ib/offline_batch` request resumed delivery immediately. Six additional recovery
requests drained the pending delivery and the server emitted offline completion.
The recovered records included the owner's actual commands at 20:33:42, 20:41:46
and 20:42:44 Brasília. The latest verified command retained its original message
ID when re-delivered to the webhook, so retries remained deduplicated.

The confirmation `Teste liberado` was issued at 21:06:43 and has `DELIVERY_ACK`.
The 0323 conversation is idle and its consumed-trial marker has been removed.
No logout, QR code, replacement authentication or new trial was used for recovery.

`evolution-offline-delivery.mjs` now resumes pending batches on the owner socket
when startup delivery is quiet, postpones requests while messages are advancing,
and stops on server completion, socket close or its finite request budget. It
does not periodically poll after completion. Queue patch v2 clones the shared
event map before extracting lifecycle events, preserving other subscribers.

The high-volume owner also used one processing lease for every conversation.
Owner requests and MAC follow-ups now use a per-conversation lease, with a brief
account lease only while merging changed state into a fresh database snapshot.
Other chats' sessions, trial markers, message IDs and send logs are preserved.
The inactivity sweep continues using the account lease for its short update.

Validation includes held-network-send concurrency in `verify-whatsapp-handoff`,
state merge and failure checks in `verify-conversation-state`, pending-delivery
recovery and shutdown checks in `verify-offline-delivery`, and existing payment,
recovery and device-flow regressions. Production timing of a new inbound message
after recovery has not been measured; a duplicate command check completed in
about two seconds, which is not an end-to-end response-time measurement.

Persistent image: `auxplus/evolution-api:2.3.7-offline-delivery-20261108`. Existing
auth was retained; the temporary local inspector and probes were removed.
