# Automatic football WhatsApp Status

The feature is opt-in per AuxPlus account. The switch and Brasília posting time appear in the banner dialog and the Status banners section. Saving configuration uses the existing authenticated AuxPlus session, validated by `wa-football-status`; browser-supplied user IDs are never trusted.

- `wa-football-banner` is a public, read-only PNG renderer. It uses the same drawing routine as the site, with a recording context and bundled resvg WebAssembly, fonts and stadium artwork. It exposes a dated manifest and skips empty schedules. ESPN, Onde Assistir and Futebol na TV provide the public data. It has no WhatsApp credentials.
- `wa-football-status` serves authenticated settings/history actions and a private-token cron action. It checks the account's existing Evolution instance and uses Evolution v2 `message/sendStatus` with an explicit list of the account's contacts, excluding groups/invalid addresses and including the owner first so the linked phone sees its own story. The UI states the audience explicitly. One image is processed per cron cycle, allowing up to 110 seconds for Evolution 2.3.7 to finish its recipient batches.
- Migration `20261027170000_football_status.sql` installs private settings/posts tables, RLS, service-role-only access and the authenticated five-minute cron. All accounts default to disabled. Its token is stored only in `platform_private_secrets`.
- Each daily batch contains the national and featured international pages for today and tomorrow. Pages are unique per account, posting day, banner day, region and page. Multiple pages may be published over successive cron cycles. Changing the posting time or toggling off/on does not repost successful pages.
- Each account has an expiring lease. Settings are checked before and after image generation. Disabling stops further sends; it cannot retract a request already handed to WhatsApp. The worker never retries a `sending`/uncertain publication because the provider may have accepted it despite a lost response. It reconciles existing `status@broadcast` records by message ID or dated caption/time window. `provider_recorded` means Evolution has a PENDING record, while `sent` requires an explicit WhatsApp acknowledgement. National pages precede international pages within each day. The user can check the phone and post the download manually.

Deployment:

1. Apply the migration once and record its version in Supabase migration history.
2. Deploy `wa-football-banner` and `wa-football-status` with their config entries, including static assets.
3. Deploy the frontend through the usual app release process.
4. Connect WhatsApp, choose a Brasília time and enable the switch. Enabling checks the connection and renderer health before saving.

The renderer defaults to the same Supabase project's `wa-football-banner` URL. Optional server secret `FOOTBALL_BANNER_RENDER_URL` can override the full HTTPS endpoint. Never put Evolution API credentials in that public endpoint.

Verification: `node scripts/verify-football-status.mjs`, `node scripts/verify-football-banners.mjs`, `node scripts/verify-uniplay-discover.mjs`, `npm run build`. The worker tests mock all WhatsApp requests: they do not post real Status. Live read-only checks may query the renderer's `?mode=health`, `?mode=manifest`, and a manifest entry's `?day=…&region=…&page=…` PNG.

Font licenses are bundled in `wa-football-banner/assets`; the stadium artwork's generation prompt is recorded in `public/banners/README.md`.

Customer-facing Status captions use only `Comente "teste" para testar grátis.` Internal dates/page identifiers remain in the banner and private queue. Migration `20261027190000_football_status_media_hash.sql` stores the original image SHA-256 so a lost HTTP reply can be correlated with its provider image record without confusing pages that share the same promotional caption. Existing technical captions remain supported for historical reconciliation. Already published captions are not edited or resent.
