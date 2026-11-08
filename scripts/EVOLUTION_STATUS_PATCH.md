# Reviewable Evolution 2.3.7 Status adjustment

## Current deployment — 2026-11-08, Status rejection 479

Today's nine football pages were absent on the owner's phone and had no provider message IDs.
Live recovery exposed `WhatsApp rejected Status: 479`; diagnostics located it mid-fanout
(batch 22/250, later 20/250), after earlier batches had been acknowledged. Refreshing
device lookup and capping batches at twenty devices did not resolve the repeated-ID rejection.
Independent publication IDs for disjoint audiences resolved it: national page 1 was accepted
as `3EB0BFF6F024A83AB2D40F`, and the owner explicitly confirmed it appeared on the phone.
The remaining eight current-day pages were placed back in the owner's durable queue.

Recovery reached four confirmed pages, then WhatsApp returned explicit 429 rate rejections
for the remaining five. Automatic attempts were paused immediately, and the owner-only helper
was stopped. Migration `20261108123000_football_status_cooldown.sql` adds a durable cooldown.
Both football cron endpoints now honor it; explicit 429 jobs remain queued for automatic
resumption after thirty minutes, and successful posts impose a sixty-second inter-post gap.
Other uncertain outcomes retain their existing no-blind-retry policy. Today's five rejected
pages are queued with resumption no earlier than 08:33 Brasília; four sent pages are untouched.
The normal daily 07:00 switch remains enabled. No complete-nine-pages claim was made.

Owner transport now uses at most forty accounts/eighty devices per packet with a 150ms gap,
reducing fanout packet count while preserving disjoint audiences and distinct IDs. Other
instances retain default ten-account/twenty-device batching. Compact fanout, explicit-rejection
handling, persistent 429 cooldown, manual-request non-bypass and delayed resumption are tested.
This final pacing adjustment is installed and persisted; its live verification must wait until
the WhatsApp cooldown ends. Do not bypass the interval with a direct recovery call.

Follow-up verification during the synopsis/gallery task found all nine 2026-11-08 football
pages in `sent` state and the account's `last_error` null. Automatic recovery completed.
The preceding four-sent/five-waiting note describes the earlier rate-limit pause, not the
current final state. The owner explicitly confirmed first-page phone visibility.

The legacy `auxplusStatusStableId` owner flag remains enabled ONLY to retain the existing
deferred network dispatch after the Signal transaction commits. Both calls to
`sendStatusWireBatches` now pass `false` for stable publication IDs. All batch acknowledgements
are still required, and explicit rejection still stops delivery. Groups/private sends keep
their existing paths. Audience groups retain all devices for each account and cap at ten
accounts/twenty devices. The owner's device lookup is refreshed. No auth/session records
were removed and no QR reconnect was needed.

The persistent image `auxplus/evolution-api:2.3.7-status-audiences-20261028` was rebuilt from
the public pinned base with updated `apply.mjs` and wire helper in the sibling Docker context.
Football queue errors now expose the numeric provider rejection instead of hiding it in a
generic message. The secret-authenticated tick supports an optional user scope for recovery.
Tests: wire batch IDs/acknowledgements/device bounds and private Signal transaction release.

Movie/series posts are enabled on Instagram through Buffer, separately from WhatsApp.
WhatsApp movie/series automation remains disabled; the current missing-Status report was
explicitly clarified by the owner as football, not an instruction to enable catalog Status.

## Current deployment — 2026-11-07, reply latency correction

Movie/series banners were explicitly removed by the owner. `StatusBannerHub` now renders only football; `wa-content-status` retains the authenticated minute tick for football only and returns 410 for retired catalog actions. Account 1's content automation is disabled and its queued catalog posts were removed. Do not re-enable catalog banners. Existing attempted posts and archives remain for audit.

All ten football pages for 2026-11-07 were confirmed `sent` after restoring a stable publication ID across batches on the owner's instance only (`auxplus:status-stable-id:v4`). Other instances retain distinct-ID behavior. This does not establish phone visibility or view counts independently.

The owner's private menu reply at 13:30:50Z → 13:31:24Z took 34 seconds. Source inspection found the Status batch/ack loop inside `authState.keys.transaction(..., meId)`, blocking private-message encryption for that account. `evolution-status-release-transaction.mjs` now prepares encryption in the transaction, commits its writes, and waits for the Status network acknowledgements afterward. The original send promise still waits for all acknowledgements and propagates rejections. The deferred path applies only when the owner's existing `auxplusStatusStableId` socket flag is true. No private-message/group transport was replaced.

`evolution-webhook` is published with no simulated typing delay, a 250ms bubble gap, photo configuration reads only for photos, and stable payment idempotency derived from the incoming event's reference. Payment requests have a 12-second deadline. No real payment was created by tests; existing pending PIX reuse remains active. Do not promise zero network latency or guaranteed immediate Mercado Pago responses.

Tests passed: `verify-status-transaction.mjs` (private-message transaction proceeds while Status ACKs remain pending), `verify-status-wire-batches.mjs`, `verify-whatsapp-handoff.mjs`, `verify-bot-pix-idempotency.mjs` (all payment calls mocked). Evolution reconnected `open` after activation. The persistent Compose image `auxplus/evolution-api:2.3.7-status-audiences-20261028` was rebuilt from the pinned base with public code only. Its sender SHA-256 exactly matches the live sender: `71ec869814d10ed39ce09a3daa07079ced466d966b9f8c2fd513d46fadba34a0`. Public build inputs in `clickpede-app/docker/evolution-status/` were updated with `.before-latency` backups; `scripts/build-status-image-apply.mjs` is the reproducible apply source. The running container was restarted, not recreated; no QR or credential deletion occurred. A new live customer greeting was requested to measure post-change latency.

## Latest clarification: keep all existing automations enabled

The user explicitly objected to disabling the attendant/reminders and requested investigation only. The temporary `enabled=false` changes to `wa_bot_user_1` and `wa_settings_user_1` were restored to true. The previous campaign-pause query matched zero running campaigns, so no campaign was changed. Football Status remains enabled at 07:00. Do not interpret requests about unsolicited messages as permission to disable configured features again.

Root defect found: `evolution-webhook` skipped groups but did not skip `status@broadcast`. `extractRemotePhone` could use a Status author's participant PN, and captions/audio were then treated as private chat input. Correlation confirmed outgoing bot replies at 16:31:08Z and 16:43:47Z after a contact's image/audio Status 6/3 seconds earlier, with no private incoming message in the preceding 90 seconds. Another case at 16:55:35Z also followed Status events without private input. The 16:51:02Z case had an actual private conversation event 5 seconds earlier; do not claim every screenshot item was proven to be Status-triggered.

Fix deployed: `_shared/waInbound.ts` / `skipAttendantEvent`, called in `evolution-webhook` before extracting phones or loading bot state. Only private-chat upserts can proceed; Status, broadcast, groups, newsletters, message updates/receipt/history events are skipped. Actual private replies quoting a Status remain supported. Offline tests passed, and synthetic live requests **without an instance** returned `status`, `not_message_upsert` and `incomplete` as expected, without any account lookup or possible customer send. No test messages were sent to people. All enabled flags were rechecked true after deployment.

## Latest user constraints — 2026-10-28

Automatic publication is now **only for the current Brasília date**, national and international. The user explicitly rejected automatic tomorrow banners and explicitly requested no private messages, group messages or further text tests: publish banner images in Status only. Manual banner previews/downloads can still include tomorrow.

`wa-football-status` was redeployed with both manifest filtering (`entry.day === clock.today`) and queue filtering (`banner_day === clock.today`). Tests cover mixed today/tomorrow manifests and a future job left by the previous version. A read-only check found no queued/sending future job when this change was applied. Existing historical records are retained; do not claim already-published future Status images were removed.

Delivery investigation continued after the earlier validation: same-ID split packets did not establish recipient visibility. Current provider code uses PN/LID resolution plus `auxplus:status-distinct-audiences:v3`: disjoint groups of accounts, unique child IDs, Status-only destination and acknowledgement checks. Persistent image is `auxplus/evolution-api:2.3.7-status-audiences-20261028`; its hashes matched the live main/sender and Compose references it. The worker now sends the already-validated PNG as a data URI, avoiding the provider's second fetch/render. The national today and all three international today jobs were recorded accepted. Future-date jobs had mixed accepted/uncertain states and are no longer eligible for automatic publication.

An offline draft in `evolution-status-batches.mjs` explores fresh native encryption per audience; it has **not** been installed. Do not mistake it for current production or deploy further transport experiments for the current date-policy change. The user reported seeing tomorrow pictures after v3; do not keep claiming that only the original directly targeted image has been visible. No private/group/text-test messages have been authorized by the latest instructions.

The connected installation's `sendMessage('status@broadcast', ...)` divides its audience into groups of ten, then calls `client.sendMessage` with the original image URL for every batch. With 2,433 eligible contacts, this creates more than 240 media-send operations for one Status and can outlast the caller's request. A provider database `PENDING` record is not proof of WhatsApp acknowledgement.

`evolution-status-single-upload.mjs` changes only this compiled Status branch to use a single Baileys `sendMessage` call with the complete validated audience and `broadcast: true`, matching the documented Baileys API. It also includes the connected socket's own PN and LID addresses, with device suffixes removed, so both address families of the linked phone are targeted. This is a targeted workaround to test, not a guarantee against separate WhatsApp/LID compatibility issues.

Already validated:

- Offline mock tests cover 2,433 recipients, duplicate/group removal, the normal-message path, an idempotency marker and refusal to patch unrecognized source.
- A read-only `--check` successfully matched and parsed the exact installed `dist/main.js`.
- The user's automatic Status setting is paused pending review; other WhatsApp instances have not been modified or restarted.

The inspected container currently serves eight open WhatsApp instances. The user explicitly authorized the shared-service restart on 2026-10-27. Both adjustments below were applied with backups, the container was restarted and all eight connections returned to `open`.

## Own-phone synchronization

The installed Baileys group/status path called `createParticipantNodes` without a device-sent copy. The normal direct-message path already supports substituting a `deviceSentMessage` for the owner's other PN/LID devices. `evolution-status-own-device-sync.mjs` supplies that existing mechanism only for Status: its destination stays `status@broadcast`, and it includes the full uploaded media and sender-key distribution. Other contacts receive the original sender-key payload, and group handling stays unchanged.

```powershell
node scripts/verify-evolution-own-status-sync.mjs
node scripts/evolution-status-own-device-sync.mjs --check clickpede-app-evolution-api-1
node scripts/evolution-status-own-device-sync.mjs --apply clickpede-app-evolution-api-1
docker restart clickpede-app-evolution-api-1
```

The dedicated backup is `messages-send.js.auxplus-own-status-backup` alongside the Baileys module, with a SHA-256-labelled workspace copy. Roll back with `node scripts/evolution-status-own-device-sync.mjs --rollback clickpede-app-evolution-api-1`, then restart the container. The same warning about recreating the container applies to both adjustments.

Read-only installation checks confirmed both markers and eight open instances. The single-upload test returned a provider message ID for tomorrow's national banner; the own-device synchronization test returned a provider message ID for tomorrow's first international page. The user subsequently confirmed that **neither test appeared in My Status on the connected phone**. Own-phone visibility remains unresolved; do not describe either patch as a successful synchronization fix. Provider `PENDING` and offline unit tests do not prove phone visibility. Previously published images were not resent.

Commands after approval:

```powershell
node scripts/verify-evolution-status-patch.mjs
node scripts/evolution-status-single-upload.mjs --check clickpede-app-evolution-api-1
node scripts/evolution-status-single-upload.mjs --apply clickpede-app-evolution-api-1
docker restart clickpede-app-evolution-api-1
```

The script saves a SHA-256-labelled workspace backup and an in-container backup, checks the file has not changed since it was read, parses the complete patched JavaScript and refuses to overwrite an existing backup. Do not recreate the container for this test: the patch is to its writable layer and will be lost on recreation. A successful workaround must later be captured in a reproducible image/startup workflow.

Rollback after approval if needed:

```powershell
node scripts/evolution-status-single-upload.mjs --rollback clickpede-app-evolution-api-1
docker restart clickpede-app-evolution-api-1
```

After either restart, verify connection state before resuming the user's selected schedule. Do not reset or resend `uncertain`, `provider_recorded` or acknowledged pages merely to test the patch. Use a still-queued image and check the provider result plus actual phone visibility.

References: [Baileys broadcast/status example](https://github.com/WhiskeySockets/Baileys#send-broadcast--stories), [Evolution 2.3.7 timeout report](https://github.com/evolution-foundation/evolution-api/issues/2528), [separate LID rejection report](https://github.com/WhiskeySockets/Baileys/issues/2794).

## Delivery rejection captured on 2026-10-28

The user confirmed today's banners are absent even from another WhatsApp account. All seven queued images have provider IDs but remain PENDING; delivery is unconfirmed. A separate text Status was explicitly authorized once. Its provider response was HTTP 201/PENDING, ID `3EB0CF278391BB5CE0C9A6`, but the actual WhatsApp acknowledgement at `2026-10-28T14:26:25.126Z` rejected it with error `400`. Evolution still stored PENDING afterwards. This is a delivery failure, separate from My Status synchronization. The rejection alone does not establish whether audience size, recipient addressing, or another payload field caused it.

A diagnostic-only addition is installed in `/evolution/node_modules/baileys/lib/Socket/messages-recv.js`: marker `auxplus:status-ack-diagnostic:v1`, backup suffix `.auxplus-status-ack-backup`. It records only acknowledgements whose `from` is `status@broadcast`, writing time, message ID, error code and whether a participant hash was present to `/tmp/auxplus-status-acks.jsonl`. No message content or recipient addresses are logged. Syntax was checked and the service restarted; all eight instances returned open. Like the earlier changes, this diagnostic is lost on container recreation. No automatic retry of previously attempted banners was performed. Do not infer delivery from Evolution's HTTP 201/PENDING response.

## Current installation after restoration

The later attempt in `evolution-status-batches.mjs` passed mock tests but the live national-banner attempt failed without a usable acknowledgement. It is **not installed now**. The main module has been restored byte-for-byte from `main.js.auxplus-status-backup`, restoring Evolution's original batches of ten with a shared message ID. The own-device DSM patch was also rolled back. Only the acknowledgement diagnostic remains installed. All eight instances returned open after restarting. The national banner for 2026-10-28 is currently `uncertain`; other six pages remain `provider_recorded`. Do not reset any more jobs without assessing delivery evidence.

Automatic approval review rejected an additional send of the already-authorized-once text test; that command was not executed. A new explicit authorization is needed before repeating that text test. No test-publication success has been claimed. Restoration to the previously working implementation still requires real delivery verification.

## Latest verification and rollback

The user explicitly authorized one repeat of the text test. Original Evolution batching produced ID `3EB0290DB2B12094E18989`: 311 acknowledgements, 126 without errors and 185 with error 400. The user confirmed it still did not appear on the other WhatsApp. The API call timed out after 180 seconds; the provider finished receiving acknowledgements later. Neither partial acks nor the recorded message prove a visible Status.

Following the user's request to fix and publish today's banners, only the national banner was retried after explicit rejection. An experimental explicit PN sender identity produced only error-479 acknowledgements (ID `3EB0CA3521EB0CCD539FED`), and was rolled back. A second attempt with explicit LID addressing and status metadata (`status_setting=contacts`, `session_scope=status`) was rejected on its first batch with error 479 (ID `3EB089814105CD29410D4D`), with no subsequent batches sent. That adjustment was also rolled back.

Current live `dist/main.js` is again the original `main.js.auxplus-status-backup`; `messages-send.js` is the original sender with neither DSM, PN identity nor metadata patches. Only the status acknowledgement diagnostic in `messages-recv.js` remains. The national banner is `uncertain`, not queued; no other banner was reset. Delivery is unresolved. The next proposed step is renewing only the AuxPlus session; **do not log out or disconnect it without explicit user approval**, since a new QR scan on the phone will be required. This is a diagnostic next step, not a guaranteed remedy.

The user subsequently **declined disconnecting or renewing the session**. Do not log out, delete credentials or require a new QR scan. Read-only verification found both PN and LID identifiers present in the existing session. A final limited experiment changed only the Status sender-key identity to PN, leaving stanza attributes untouched; its national-banner attempt at `2026-10-28T15:05:26.928Z` failed without a usable acknowledgement. That experiment and the acknowledged-batch wrapper were rolled back. Original main/sender code is active; only the acknowledgement diagnostic remains. Delivery remains unresolved. No additional text Status was sent. Do not present ongoing investigation as a completed fix.

## Transport-level investigation, later on 2026-10-28

Normal direct messages have SERVER_ACK/DELIVERY_ACK, so the observed failure is specific to Status. Contact API counts matched the intended instance; there were no foreign-instance contacts. `evolution-status-wire-batches.mjs` and `verify-status-wire-batches.mjs` prepared/tested splitting one encrypted stanza into ten-device batches with identical message ID/ciphertext, deduplication and explicit acknowledgements. The initial integration had an undefined `ws` reference; it was corrected to `sock.ws` before the subsequent attempt. That subsequent attempt was explicitly rejected on the first batch: ID `3EB0DF2585BCCD20C375E8`, error 400, `15:14:19.826Z`.

A further Status-only guard excluded the exact sending PN/LID device, addressing the incorrect full-LID-versus-user comparison in the installed `extractDeviceJids`. Its national-banner attempt was also rejected on the first batch: ID `3EB0542E23415A20E23AF3`, error 400, `15:16:30.823Z`. No remaining batches were sent. All these functional changes were rolled back: main from `.auxplus-status-backup`, sender from `.auxplus-wire-batches-backup`. Only acknowledgement diagnostics remain installed. Eight connections returned open. The national banner's latest attempt is `2026-10-28T15:16:15.782Z`, not a confirmed publication. Do not repeat the already twice-authorized text test again.

Next diagnostic: ask the user whether a Status published directly in the phone's WhatsApp Business appears to the other number. This distinguishes a provider path failure from an account/audience restriction without logging out. Do not assume a restriction has been established from error 400 alone.

## VALIDATED FIX — current installation, 2026-10-28

The user confirmed a manual phone Status was visible. A stored incoming reply to yesterday's successful automatic image (`3EB02AF09C72737E2C302C`) identified a verified recipient: its PN alias was eligible in today's audience, but its LID contact had no pushName and was excluded. Its PN-to-LID mapping was present and matched that reply. No phone numbers were printed or placed in source code.

Sending today's national image to that verified LID without adding the sender produced ID `3EB00C47900363F4778523`, a real error-free WhatsApp ack and **explicit user confirmation that the image appeared**. A prior HTTP-400 attempt did not generate a message ID; the successful attempt was not inferred from PENDING alone.

`install-status-delivery.mjs` is now installed and validated. It composes:

- `evolution-status-audience.mjs`: resolve eligible PN addresses to verified LID aliases through the socket's native `getLIDsForPNs`, deduplicate aliases, exclude both own PN/LID identities, preserve unresolved PN addresses, limit resolution queries to 100.
- `evolution-status-wire-batches.mjs`: prepare media/encryption once, split device nodes into same-domain batches of ten, retain the exact ciphertext and message ID across batches, deduplicate device nodes, wait for every server ack and stop on explicit rejection/timeout. Socket reference is `sock.ws`.
- Main marker `auxplus:status-resolved-delivery:v1`, sender marker `auxplus:status-wire-batches:v1`. The main returns SERVER_ACK only after all wire batches have been acknowledged. No PN identity, metadata, DSM or self-device experimental patches remain.

Today's national remainder excluded the already-confirmed recipient's PN and LID to avoid resending its image. It completed with HTTP201/SERVER_ACK, ID `3EB08D0EC0DE0759808A35`, **325 accepted batches, zero rejected**, and was recorded sent. The six previously unconfirmed remaining jobs were released back to the queue at the user's request to publish today. The normal automatic worker then completed today's first international page with ID `3EB024620A9A457493AA1B`, SERVER_ACK and **325 accepted batches, zero rejected**; its job is sent. The second international page was sending and the remaining pages queued at the last check. Do not resend completed pages.

Only the AuxPlus instance setting `readStatus` was changed false→true to stop ignoring incoming Status events, preserving all other instance settings; backup is `/tmp/auxplus-settings-before-status-sync.json`. Credentials were never deleted and no logout/new QR was performed. All eight connections returned open. Diagnostic ack logging remains installed in the currently running container but is not required by the correction.

Persistence is now prepared and configured: `C:/Users/Premium PC/dyad-apps/clickpede-app/docker/evolution-status/` contains only five public code/build files. Its Dockerfile pins the original image digest and applies the same transformations. Image `auxplus/evolution-api:2.3.7-status-20261028` was built locally and its main/sender SHA-256 hashes matched the validated live files byte-for-byte. `docker-compose.evolution.yml` now references that image and `build: ./docker/evolution-status`; `docker compose ... config --quiet` passed. The original Compose backup is `docker-compose.evolution.yml.auxplus-status-backup`. No container recreation was needed while the queue was running: current code is active, and future recreation uses the corrected image. Volumes and environment settings were untouched.

Passed checks: `verify-status-audience.mjs`, `verify-status-wire-batches.mjs`, `verify-football-status.mjs`, full source syntax, isolated image build and image/live hash comparison. Keep this validated implementation; earlier sections describe failed experiments, not the current state. Own-phone My Status visibility and view counts have not been newly validated; do not claim those are fixed.
