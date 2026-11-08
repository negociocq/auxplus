# Instagram through Buffer

The Banners panel contains a private API-key field linked to the existing AuxPlus recovery session.
Users connect Instagram in Buffer, create a key at https://publish.buffer.com/settings/api,
enter it in AuxPlus, choose an Instagram channel, select feed/Stories and save.
The daily schedule is opt-in, defaults to 07:00 America/Sao_Paulo and is independent of WhatsApp.
No keys are returned to the frontend, stored in browser storage or included in provider error logs.

Backend: `buffer-instagram`, private settings/posts tables and a token-authenticated minute cron.
Migration: `20261108090000_buffer_instagram.sql`. The installation script applies that exact file.
Cron processing uses per-user leases, durable unique jobs and no automatic retry of unknown submissions.
Only today's dated manifest is eligible. Past dates and accepted jobs are never resubmitted.
Failed/rejected posts are visible for review in Buffer; clicking Publish again does not duplicate them.
Changing channels/formats cancels queued jobs; already received posts must be managed in Buffer.

Stories use the existing 9:16 artwork. Feed frames contain the complete artwork within 4:5;
no games or dates are cropped. Generated PNGs are frozen in public storage by account/date/format
before sending so delayed Buffer requests never retrieve tomorrow's artwork.
Feed groups use at most 10 pages; all remaining pages form subsequent groups.
Stories use one image per job. Only channels whose service is instagram are accepted.
The UI distinguishes Buffer acceptance from actual publication on Instagram.

Verified against official Buffer documentation (2026-11-08):
- https://developers.buffer.com/guides/getting-started.html
- https://developers.buffer.com/examples/get-channels.html
- https://developers.buffer.com/types/CreatePostInput.html
- https://developers.buffer.com/types/InstagramPostMetadataInput.html
- https://developers.buffer.com/types/ShareMode.html

Tests: `node scripts/verify-buffer-instagram.mjs` and existing football banner/status tests.
Tests use only mocks. No live Instagram post is created during verification.

## Editorial film/series posts

Migration `20261108110000_instagram_editorial.sql` adds independent editorial settings,
two time slots (12:00 and 16:00 Brasília) and persisted per-slot plans. Games remain at
their existing time. The owner explicitly requested both editorial slots and both formats.
WhatsApp movie/series automation remains retired; this feature publishes through Buffer only.

Selections group audio/quality variants, require recognized titles with actual covers,
exclude poor ratings/future dates, verify current-year genres and season availability,
and exclude the previous six days and other same-day editions. Public metadata comes
from existing Wikidata reference helpers; provider/catalog addition dates are not premieres.
Unverified seasons cannot be advertised as newly available. A missing theme falls back
to an eligible current/recent selection; counts always match actual titles. "Best" and
"most discussed" rankings are not fabricated. The copy identifies an editorial selection.

Policy v2 requires strong mainstream recognition (45+ in the curated reference), or at
least 5,000 audience votes with a rating of 7+. Known lower ratings are excluded. Missing
ratings are never invented. Recognition takes priority over recency within release themes.
Recent-year genre recommendations may include the previous two years and are never
labelled as new premieres. Famous series can be recommended without claiming a new season.
The 14-slot rotation includes science fiction, suspense, comedy, action, adventure,
animation, premieres and series; horror occupies only one slot. Unpublished owner previews
can be refreshed with `refresh-instagram-editorial-policy.mjs`; accepted or uncertain
posts are preserved. Asset filenames include the policy version to avoid old cached artwork.
Feed uses a cover plus two-title slides at 4:5;
Stories use corresponding 9:16 slides. Covers and captions point to the profile's bio link.
Frozen assets and publication uniqueness include topic and edition so two daily selections
do not suppress each other or duplicate football jobs. Previewing creates no Buffer posts.

Validation: `verify-instagram-editorial.mjs`, extended `verify-buffer-instagram.mjs`, and
read-only production-catalog previews with `preview-instagram-editorial.ts` via Deno.

## Synopsis pages and visible gallery (policy v3)

The Banners screen automatically shows both saved editorial slots, like the football
previews. Each card supports cover/detail pagination, feed/Stories switching, enlargement
and PNG download. Initial requests run in slot order so selections do not reuse titles.
Account/date/channel/slot/format/page isolate browser cache entries and stale requests.

Detail pages contain short synopsis text from provider metadata or the exact recognized
work's Portuguese Wikipedia plot/premise section. Wikidata sitelinks resolve article identity;
there is no title-guess search or generated plot. Missing information is labelled unavailable.
Wikipedia excerpts include visible credit and CC BY-SA attribution/source links in captions.
HTML is converted to bounded plain text and escaped in SVG. Grouped editions retain metadata.

Preview and publishing share the canonical stored plan and versioned public image paths.
Preview checks the cached image first; already-published assets are preserved. Creating
previews prepares plans/images but does not create a Buffer post. New unpublished plans
use v3, while published selections retain their existing plans and artwork.

Validation: `verify-editorial-synopses.mjs`; `prepare-editorial-gallery.ts` generates actual
cached preview pages for account 1 in both formats without creating social posts.
