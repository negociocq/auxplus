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
