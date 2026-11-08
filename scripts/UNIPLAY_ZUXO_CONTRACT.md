# UniPlay partner apps — checked 2026-11-08

Source: the panel at `https://searchdefense.top`, public bundle `/js/app.fbac467c.js`. Only its static string table was decoded; the panel application and activation functions were not executed.

The `activateZuxo` dialog says “Ativar Zuxo Player”, asks for MAC, and passes `{ id_user: customer.id, mac: input }` to `activeAppZuxo`. The latter posts to `/api/activate-zuxo`. AuxPlus proxies API paths without the `/api` prefix, so it must call `/activate-zuxo`.

Current contracts are centralized in `supabase/functions/_shared/partnerAppContract.ts`:

- Zuxo Player: `/activate-zuxo`, `id_user`, `mac`.
- Pixel Player: `/activate-pixel`, `id_usuario`, `device_identifier`.
- UTM Play: `/activate-utm`, `id_usuario`, `mac`, `device_key`.

Prime was removed from current selectors and bot actions. Flow versions below 10 migrate stored Prime choices to Zuxo while preserving custom prices and unrelated messages. An in-progress Prime device entry returns to app selection, preserving existing trial credentials; its old MAC is not activated automatically in Zuxo. Historical local records are preserved but retired app entries are filtered from current device lists.

No Zuxo screen screenshot was verified. Do not reuse the old Prime illustration or its bottom-right screen coordinates. Zuxo guidance asks for the MAC on its activation screen; OCR uses full-screen reads plus label-based refinement.

Tests use mocks or locally generated images. No real activation, subscription renewal or credit-consuming request was made.

WhatsApp catalog v12 uses only Zuxo for Samsung, LG, Roku, Android TV, phones and tablets. Official App Store/Play Store links replace legacy phone downloads. Samsung is manual: Listas, URL/code jung777, trial username/password. All other listed devices request MAC text or photo for remote activation. Existing trial credentials are reused during recovery. Pixel/UTM remain available only in the separate manual partner activation UI. PC login is retained when configured.
