# Unhook: technical feature analysis

## Scope and artifact identity

This analysis is based primarily on a Chrome Web Store package downloaded for the listing ID `khncfooichmfjbepaaaebmommgaepoid`, statically inspected with REA, and read from its extracted files. The package manifest identifies **Unhook - Remove YouTube Recommended & Shorts**, version **1.6.9**, Manifest V3. The Web Store listing reported the same version and a last-updated date of **2026-03-22** when consulted on **2026-11-07**.

| Item | Observation |
|---|---|
| Package SHA-256 | `8622b2698dff08baae26a8c3638f524e66dfc12562e728694819fa1ef2e28023` |
| Package size | 38,218 bytes (38.2 KB; the Web Store displays 37.32 KiB) |
| Inventory | 29 ZIP entries: 28 files and one directory; entry coverage complete; no integrity contradictions reported |
| Main implementation | `js/background.js`, `js/content.js`, `js/unhook-yt.js`, `js/popup.js`, `css/content.css`, `popup.html`, `manifest.json` |
| Key REA records | Package inventory `ev_8a5afe25f9c5782e5697e8aac60a659e6783fd2c2587b646396b31830f8198e2`; extraction `ev_dbbb3851586f5f1c4ea7020bd1154d79a9a4a755b248436be12a223b55f809fc`; static JS analysis summary `ev_2c6a374fdd6328232ff11978e46856ec9e87f681804aab2ed7cfbf3036168997` |

The package hash identifies the bytes analyzed; it is not, by itself, a cryptographic attestation of publisher identity. REA's archive inventory and extraction verified the listed ZIP entries and found no mismatch. REA also parsed all five JavaScript files without syntax errors. Static analysis does not execute the extension or prove that every candidate path is reached at runtime.

## What it does

Unhook is a **user-configurable YouTube interface simplifier**. It suppresses selected YouTube UI regions and recommendation surfaces, optionally redirects certain feed navigations, and can turn off the player’s autoplay and annotation controls. It is not implemented as a general-purpose network/content blocker: most hiding is done by attaching settings to the page's root `<html>` element and applying CSS selectors to YouTube's DOM. The player controls that cannot be hidden with CSS are adjusted by page-context JavaScript.

All options are independently configurable through the toolbar popup. A master `yt_on` switch disables/re-enables the feature set without erasing the individual options. Nested options are grouped in the UI (sidebar, video information, comments, and header); group toggles operate on their children and display a partial/indeterminate state when only some children are enabled.

## Features and implementation

The table maps the popup options to the code paths observed in the package. CSS-based features are activated by a matching root attribute such as `hide_shorts="true"`; `css/content.css` then uses `display:none!important` selectors against YouTube desktop and mobile markup. The selector list includes current YouTube custom elements and some legacy/mobile variants.

| User-facing option | Behavior and implementation |
|---|---|
| **Hide Home Feed** | Hides the home-page video grid/feed on desktop and the mobile `FEwhat_to_watch` section. Optional **Redirect to Subscriptions** changes a root YouTube navigation to `/feed/subscriptions` while the home feed is hidden, unless subscriptions themselves are hidden. |
| **Hide Video Sidebar** | Hides the watch-page secondary column. Its child switches independently hide **Recommended**, **Live Chat**, **Playlist**, and **Fundraiser**. The recommended-video option also handles the related-items section on mobile and the pause-overlay suggestion UI. |
| **Hide Shorts** | Hides Shorts navigation, shelves/grids, search results, compact video rows, notifications linking to Shorts, and the Shorts player surface, with separate mobile selectors. |
| **Hide End Screen Feed** | Hides the end-screen video suggestion wall, including mobile next/previous suggestions. |
| **Hide End Screen Cards** | Hides player end-screen card elements and their hide-button container. |
| **Hide Comments** | Hides the desktop comments and comment teaser and the mobile comments section/entry point/engagement panel. |
| **Hide Profile Photos** | Hides comment-author image elements (and the corresponding mobile comment icon container). This is a child option under the comments group. |
| **Hide Mixes** | Hides Mix/radio shelves and renderers, radio-related links, and Mix video-wall items on desktop/mobile. |
| **Hide Merch, Tickets, Offers** | Hides merchandise, ticket and offer shelves/modules, donation/alert-style promotions, and related player drawers. The separately exposed **Hide Fundraiser** option controls the donation shelf in the sidebar group. |
| **Hide Video Info** | Hides the watch-page video metadata block; child switches allow more granular hiding of **Buttons Bar** (share/like/dislike actions), **Channel** (owner/profile/subscribe area), and **Description**. Mobile metadata selectors are included. |
| **Hide Top Header** | Hides the desktop masthead/guide spacer and mobile top bar; layout offsets are adjusted so the player/content can move up. **Hide Notifications** separately hides the notification bell/button. |
| **Hide Inapt Search Results** | Hides search-result shelves such as horizontal cards and other supplemental/related-result modules (e.g. “related to your search” style blocks). It does not hide the primary search-result list. |
| **Hide Explore, Trending** | Hides Explore/Trending navigation and feed surfaces. The background listener also redirects matching Explore/Trending feed URLs to YouTube's root when this option is enabled. |
| **Hide More from YouTube** | Hides a “More from YouTube” guide section selected by its position in the guide's section list. |
| **Hide Subscriptions** | Hides subscriptions navigation and feed surfaces. The background listener redirects matching subscription URLs to the YouTube root while this option is on. |
| **Disable Autoplay** | In addition to hiding autoplay/next controls with CSS, page-context code checks the player’s autoplay toggle (`aria-checked` on desktop; `aria-pressed` on mobile) and clicks it off when active. It rechecks on YouTube navigation/update events and uses mutation observation when player UI is created or replaced. |
| **Disable Annotations** | The page-context script opens the player settings menu, locates annotation menu items (excluding Ambient mode), and clicks checked items off. Mutation observers and delayed retries handle the player menu appearing asynchronously. This is active DOM interaction, not a CSS-only hide. |
| **Master on/off** | `yt_on` gates the settings applied by the content script and is reflected in the toolbar icon. Turning it off removes the root `hide_*` attributes; turning it back on reapplies saved options. |
| **Popup dark mode / option groups** | Popup-only display preferences (`dark_mode`, plus group expansion/collapse states) are stored separately in `popup_settings`; dark mode does not change YouTube page styling. |

The Web Store's short feature list and the popup's labels are not perfectly identical: the package exposes additional granularity such as hiding fundraiser shelves and comment profile photos, and labels the search option “Hide Inapt Search Results.” The popup and selectors are the more specific evidence for the shipped build.

## Runtime architecture and state flow

1. **Manifest registration.** `manifest.json` declares a Manifest V3 service worker, `js/background.js`, and a toolbar action opening `popup.html`. The content script loads `css/content.css` and `js/content.js` at `document_start`, in all frames, on `https://www.youtube.com/*` and `https://m.youtube.com/*`.
2. **Settings persistence.** The code prefers the WebExtensions `browser` API when present, otherwise Chrome's `chrome` API. It prefers `storage.sync` when available and falls back to `storage.local` on storage errors. A settings object contains the Boolean feature flags and popup-only preferences. Empty storage receives defaults; a schema/key-count change is reconciled against known defaults and stored settings.
3. **Page attribute bridge.** On eligible pages the content script reads settings and writes Boolean `hide_*` values and `yt_on` onto `document.documentElement`. It listens to storage changes and updates/removes those attributes. The CSS consumes the attributes directly. The content script also appends the packaged `js/unhook-yt.js` script to the document so it can interact with the page's YouTube player DOM.
4. **Dynamic YouTube UI.** `js/unhook-yt.js` reacts to page load, YouTube's `yt-page-data-updated` and `state-navigateend` events, and changes to relevant root attributes. It uses `MutationObserver` to deal with dynamically inserted player controls/menus. For embedded player frames it waits for the player element/DOM to appear. The manifest's `all_frames` setting and YouTube-only match patterns are consistent with operation inside YouTube-hosted embed frames; this is not a claim of injection into arbitrary non-YouTube origins.
5. **Navigation handling.** The service worker caches the small subset of options needed for redirects and registers a `webRequest.onBeforeRequest` listener for selected YouTube root/feed URL patterns. Redirects are performed with `tabs.update`; the listener does not request the blocking mode. The Hide Home Feed → Redirect to Subscriptions rule is conditional on the home feed being hidden and subscriptions not being hidden.
6. **Install/uninstall behavior.** On a fresh install the service worker opens `https://unhook.app/welcome`; the manifest's service worker also sets `https://unhook.app/uninstall` as the uninstall URL. These are browser navigations, not evidence of background telemetry.

## Default configuration

The shipped defaults are defined in `js/background.js`. `yt_on` is enabled by default. The following feature switches default **on**: Home Feed; Video Sidebar and its Recommended, Live Chat, Playlist, and Fundraiser children; End Screen Feed; End Screen Cards; Merch/Tickets/Offers; Notifications; Inapt Search Results; More from YouTube; Autoplay off; Annotations off. The following default **off**: Redirect to Subscriptions; Comments; Profile Photos; Mixes; Video Info and its Buttons Bar/Channel/Description children; Top Header; Explore/Trending; Shorts; Subscriptions. These are defaults for a fresh/empty extension store; a returning install's persisted settings take precedence, subject to the code's settings-schema reconciliation.

## Permissions, data, and external contact

The manifest requests `storage` and `webRequest`, and host access to YouTube on `www.youtube.com` and `m.youtube.com` only. It does not declare a general `<all_urls>` content-script match. The observed implementation uses storage to persist preferences and the webRequest listener to recognize feed navigations; the listener reads the request URL/tab ID and updates the tab for redirect rules. No analytics SDK, remote configuration fetch, or extension-side upload of browsing data was found in the inspected package. This is a bounded static finding, not a proof about browser/network behavior outside the package.

The popup HTML links to Google Fonts (`fonts.googleapis.com` / `fonts.gstatic.com`), which may cause a font request when the popup is rendered. Install and uninstall can also navigate to `unhook.app` as described above. The Web Store listing's privacy disclosure says the developer does not collect or use user data; that is the publisher's disclosure and is separate from this code review.

## Compatibility and caveats

- The manifest's content-script scope is YouTube and mobile YouTube, not arbitrary websites. A video embedded on another site can be affected only insofar as its player is a matching YouTube-origin frame.
- Most controls rely on YouTube's internal DOM structure, custom-element names, CSS classes, and player accessibility attributes. YouTube markup changes can break individual selectors or player-control automation without changing the extension settings.
- Some selectors use CSS `:has()`. Although the package declares Chrome 88 as its minimum, `:has()` support arrived later in Chrome; selectors that depend on it may not work in older allowed browser versions. Other selectors remain independent of `:has()`.
- Hide/redirect behavior is not equivalent to blocking recommendations at the network layer. The principal mechanism is CSS suppression; selected feed navigations are redirected. The webRequest listener is declared for `main_frame`, `sub_frame`, and `xmlhttprequest` request types, while its action updates the tab URL; edge behavior on unusual matching subframe/request paths was not dynamically tested.
- The feature report describes code and selectors observed in package version 1.6.9. No controlled browser replay was performed, so timing, current YouTube DOM compatibility, and actual interaction outcomes remain unverified.

## Evidence and analysis limits

REA identified a complete ZIP-entry inventory and extracted the package with path containment verification. Its JavaScript application pass parsed five source files with no parse failures, but its generic semantic graph retained 850 unknown relationship records and reported semantic coverage as unknown. The technical feature mapping above therefore combines the shipped manifest and direct inspection of the extracted content script, background script, popup, and CSS; it should not be read as a claim that REA inferred every relationship or that runtime behavior was tested. The Web Store description was used as corroborating publisher-facing feature context, not as a substitute for implementation evidence.

Primary evidence records: package inventory `ev_8a5afe25f9c5782e5697e8aac60a659e6783fd2c2587b646396b31830f8198e2`; full entry inventory view `ev_f2674c013a1ac2f20b644cb17c9832fa7f46386e3ae44ceaab805ad594354082`; extraction `ev_dbbb3851586f5f1c4ea7020bd1154d79a9a4a755b248436be12a223b55f809fc`; JavaScript analysis parent `ev_98c78d1dae5f8d04427a233c666aacfebab16df4717c88e2d3758819bf893888` and summary `ev_2c6a374fdd6328232ff11978e46856ec9e87f681804aab2ed7cfbf3036168997`.

External listing: [Chrome Web Store — Unhook](https://chromewebstore.google.com/detail/unhook-remove-youtube-rec/khncfooichmfjbepaaaebmommgaepoid).
