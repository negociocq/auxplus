# Automatic football WhatsApp Status

The feature is opt-in per AuxPlus account. The switch and Brasília posting time appear in the banner dialog and the Status banners section. Saving configuration uses the existing authenticated AuxPlus session, validated by `wa-football-status`; browser-supplied user IDs are never trusted.

- `wa-football-banner` is a public, read-only PNG renderer. It uses the same drawing routine as the site, with a recording context and bundled resvg WebAssembly, fonts and stadium artwork. It exposes a dated manifest and skips empty schedules. ESPN, Onde Assistir and Futebol na TV provide the public data. It has no WhatsApp credentials.
- `wa-football-status` serves authenticated settings/history actions and a private-token cron action. It checks the account's existing Evolution instance and uses Evolution v2 `message/sendStatus` with an explicit list of the account's contacts, excluding groups/invalid addresses and including the owner first so the linked phone sees its own story. The UI states the audience explicitly. One image is processed per cron cycle, allowing up to 110 seconds for Evolution 2.3.7 to finish its recipient batches.
- Migration `20261027170000_football_status.sql` installs private settings/posts tables, RLS, service-role-only access and the authenticated five-minute cron. The authenticated minute cron in `wa-content-status` also checks the game queue as a fallback, so scheduled and manual game posts do not depend on the dedicated cron alone. Both workers share a per-account delivery lock. All accounts default to disabled. Cron tokens are stored only in `platform_private_secrets`.
- Each daily batch contains only the national and featured international pages for today (Brasília). Tomorrow is preview/download only. Pages are unique per account, posting day, banner day, region and page. Multiple pages may be published over successive cron cycles. Changing the posting time or toggling off/on does not repost successful pages.
- Each account has an expiring lease. Settings are checked before and after image generation. Disabling stops further sends; it cannot retract a request already handed to WhatsApp. The worker first reconciles `status@broadcast` records by message ID or image hash. If a post remains unconfirmed for 10 minutes and a successful history query finds no matching image, it queues one recovery retry; this prioritizes delivery but can create a duplicate if WhatsApp published without retaining the matching history. `recovery_attempts` limits this to one retry. `provider_recorded` means Evolution has a PENDING record, while `sent` requires an explicit WhatsApp acknowledgement. National pages precede international pages within each day.

Deployment:

1. Apply the migration once and record its version in Supabase migration history.
2. Deploy `wa-football-banner` and `wa-football-status` with their config entries, including static assets.
3. Deploy the frontend through the usual app release process.
4. Connect WhatsApp, choose a Brasília time and enable the switch. Enabling checks the connection and renderer health before saving.

The renderer defaults to the same Supabase project's `wa-football-banner` URL. Optional server secret `FOOTBALL_BANNER_RENDER_URL` can override the full HTTPS endpoint. Never put Evolution API credentials in that public endpoint.

Verification: `node scripts/verify-football-status.mjs`, `node scripts/verify-football-banners.mjs`, `node scripts/verify-uniplay-discover.mjs`, `npm run build`. The worker tests mock all WhatsApp requests: they do not post real Status. Live read-only checks may query the renderer's `?mode=health`, `?mode=manifest`, and a manifest entry's `?day=…&region=…&page=…` PNG.

Font licenses are bundled in `wa-football-banner/assets`; the stadium artwork's generation prompt is recorded in `public/banners/README.md`.

Customer-facing Status captions use only `Comente "teste" para testar grátis.` Internal dates/page identifiers remain in the banner and private queue. Migration `20261027190000_football_status_media_hash.sql` stores the original image SHA-256 so a lost HTTP reply can be correlated with its provider image record without confusing pages that share the same promotional caption. Existing technical captions remain supported for historical reconciliation. Already published captions are not edited or resent.

## Unified banner hub and manual queues

Migration `20261028230000_status_hub.sql` adds a manual-day flag for games, a private catalog settings/queue pair, an authenticated minute cron and a service-role-only delivery lease shared by both workers. Each minute, the content worker processes both its own queue and all eligible game queues; the dedicated game cron remains as a second trigger. The shared per-account lock prevents simultaneous/duplicate posts. The migration does not enable catalog automation, change existing game settings, or enqueue anything. The game automatic time remains per account; `Postar agora` sets a separate manual request and never changes that switch/time.

`wa-content-status` validates the same custom AuxPlus sessions as the game endpoint. It reads only that account's UniPlay catalog, groups DUB/LEG/4K editions and selects four actual recent releases per image, separately for movies and series. When the source provides only a year, the current-year policy is inherited from the catalog page. One to three pages per kind can be configured, defaulting to one movie and one series page. Daily page payloads are durable snapshots; accepted or uncertain pages are never retried. Successful earlier titles are excluded from subsequent selections.

The catalog renderer uses the native SVG layout in `src/lib/catalogBanner.ts`, real catalog covers from allowed HTTPS image hosts and bundled resvg/Roboto resources. `renderAssets.ts` contains gzip/base64 copies because the API deploy path did not reliably mount static files; the original license files remain in `wa-content-status/assets`. `GET ?mode=health` performs a small render without accessing accounts or publishing anything. Other actions require login. Preview requests do not create posting queues.

The hub separates games from catalog banners, with independent scheduling, preview/download and explicit `Postar agora`. State polls show confirmed, pending, failed and unconfirmed images. `Concluído` requires every current page to be WhatsApp-confirmed; a provider record alone is never counted complete. Manual queues start via background work and continue through the server cron, including when the site is closed. The only publication endpoint is Evolution `message/sendStatus`, with `status@broadcast` required in the response; no direct-message endpoint is used.

Checks: `node scripts/verify-football-status.mjs`, `node --experimental-strip-types scripts/verify-content-status.mjs`, `deno check --no-config supabase/functions/wa-content-status/index.ts supabase/functions/wa-football-status/index.ts`, `npm run build`. Worker tests mock every network request. Headless browser checks exercise both manual buttons with fully mocked backend services and never post real Status.
