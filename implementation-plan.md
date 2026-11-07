# calm-yt implementation plan

## 1. Product goal

Build a small, locally installable browser extension that makes YouTube substantially less recommendation-driven **without breaking ordinary viewing**. It should intervene at the browser/UI layer: prevent recommendation surfaces from being displayed, keep them hidden across YouTube's single-page navigation, and disable automatic playback when the user chooses. It does not change YouTube's server-side ranking algorithm, modify account data, or block YouTube network requests.

The first release targets Chrome and Chromium-based browsers with Manifest V3. Keep it dependency-free and loadable as an unpacked extension directly from the repository; no build step, remote service, or account is required.

## 2. Design principles

1. **Strong against recommendations, gentle to the player.** Hide the home recommendation feed, related-video sidebar, Shorts shelves, end-screen suggestions/cards, Mix/radio shelves, and supplemental search suggestion shelves. Preserve the player, primary search results, search box, title, and normal playback controls.
2. **Keep YouTube usable.** Keep the top header and search available by default. Do not hide subscriptions, comments, descriptions, channels, or live chat by default; make those optional. When the home feed is hidden, show a small local empty-state panel with links to Search and Subscriptions rather than a broken/empty page.
3. **Fail open.** Use narrow, feature-specific selectors. If YouTube changes its markup, an unmatched surface may remain visible, but the page and player must continue to work. Never hide a broad page container as a fallback.
4. **Make changes reversible.** Provide a visible master switch and grouped settings. Changing a setting should affect the current page without requiring a reload; reloading must preserve settings.
5. **Local-first and minimal permissions.** Store preferences in extension storage. No analytics, telemetry, remote configuration, page-content collection, or external code/assets. Do not request `webRequest`, `tabs`, or broad `<all_urls>` permissions for the initial design.
6. **Avoid fragile injection.** Prefer a normal isolated-world content script that manipulates the DOM and root attributes. Do not inject code into YouTube's page world or depend on internal YouTube JavaScript APIs.

## 3. Recommended implementation shape

Use plain HTML, CSS, and JavaScript so the source directory itself is the installable extension:

```text
extension/
  manifest.json
  popup.html
  popup.css
  popup.js
  settings.js
  content.js
  youtube.css
  icons/
    icon-16.png
    icon-48.png
    icon-128.png
tests/
  settings.test.js
  fixtures/
    youtube-page.html
README.md
```

`settings.js` should contain the default settings, schema version, normalization, and small read/write helpers. Load it before `popup.js` in the popup and before `content.js` in the content-script list. Keep feature rules in `youtube.css`, not duplicated between JavaScript selectors and UI handlers. Use descriptive setting names and one documented mapping from a setting to a root `data-calm-*` attribute.

Start without a background/service-worker script. The popup and content scripts can both use `chrome.storage`; live storage change events update open pages. Add a worker only if a later, explicitly requested feature cannot be implemented reliably in the content script.

## 4. Initial settings and user experience

### Presets

- **Focus (default):** hide home feed, related videos/sidebar recommendations, Shorts, end-screen recommendations/cards, Mix/radio shelves, and supplemental search suggestions; disable autoplay. Leave the header/search, primary search results, player, video metadata, comments, subscriptions, and normal navigation usable.
- **Balanced:** hide home feed, related videos, Shorts, and end-screen suggestions; leave autoplay and supplemental shelves as they are unless the user changes them.
- **Custom:** expose individual switches and retain the user's choices.

Presets are convenience actions, not a second source of truth: selecting one applies a named set of Boolean options, after which editing any individual option switches the UI to **Custom**. Store the individual options so the result is predictable and inspectable.

### Popup layout

Keep the popup short and scannable:

1. Header: **calm-yt** and a prominent master on/off switch.
2. Preset selector: Focus, Balanced, Custom.
3. **Recommendations** group: Home feed, Related videos, Shorts, End-screen suggestions, Mixes, Search suggestion shelves.
4. **Playback** group: Disable autoplay.
5. Collapsed **More controls** group: Comments, Live chat, video information, buttons bar, channel, description, top header/notifications, Explore/Trending, subscriptions, and promotional shelves.
6. One-sentence helper text explaining that hidden sections can be restored by turning off the corresponding option.

Use native checkbox/label controls, keyboard focus, accessible names, and a responsive popup width. Show an explicit disabled state when the master switch is off. Avoid a popup full of every fine-grained option on first open.

## 5. Feature implementation

### 5.1 Manifest and scope

- Manifest V3 `action` opens `popup.html`.
- Register `youtube.css` and `content.js` at `document_start` for `https://www.youtube.com/*` and `https://m.youtube.com/*`; enable all frames so YouTube-origin embed frames can be handled.
- Request only `storage` and the YouTube host access needed by the content script.
- Do not add permissions for blocking requests, reading all browsing history, arbitrary websites, or accessing credentials.
- Use system fonts and local icons so the popup makes no third-party font/image requests.

### 5.2 State and DOM bridge

- Keep one versioned settings object, e.g. `{ schemaVersion, enabled, preset, hideHomeFeed, hideRelated, hideShorts, hideEndscreen, hideCards, hideMixes, hideSearchShelves, disableAutoplay, ... }`.
- Validate settings when reading storage: accept only known Boolean keys and known preset names; merge missing keys with defaults; ignore malformed/unknown data safely.
- On startup, set root attributes such as `data-calm-hide-related="true"`. When disabled, remove the extension's attributes rather than clearing unrelated page attributes.
- Listen for `chrome.storage.onChanged` and update root attributes immediately. A popup change should not need a page reload.
- Store settings in `storage.local` initially. Sync is not required for local installation; add `storage.sync` only if cross-device sync becomes a product requirement.

### 5.3 CSS suppression

- Apply root-attribute-scoped selectors in `youtube.css`; target specific home, watch-sidebar, Shorts, end-screen, Mix, and search-supplemental components.
- Include desktop and `m.youtube.com` selectors where the corresponding UI exists. Prefer stable custom-element names, semantic attributes, and link destinations; isolate selectors using `:has()` as optional fallbacks rather than making a whole feature depend on it.
- Use `display: none` for presentation, not DOM removal. Do not hide the player, primary results, search input, or broad page roots.
- Build and test each feature independently so a stale selector for one surface cannot affect another.
- Add a small, extension-owned home empty-state panel when the home feed is suppressed. It should have a Search action and a Subscriptions link; it must not look like a YouTube recommendation or include remote content.

### 5.4 Dynamic navigation and player behavior

- CSS automatically applies to matching nodes inserted later; avoid a page-wide `MutationObserver` for CSS-only features.
- Handle YouTube SPA navigation using documented/custom navigation events when present, plus `popstate` and a narrowly scoped route check. Reapply root settings idempotently after route changes.
- For autoplay, inspect the player toggle's current accessibility state and click it only when it is enabled. Recheck after navigation/player replacement and use a narrowly scoped observer on the player while its control is being initialized. Debounce observer work and stop observing when the control is found or the player is removed.
- Never repeatedly click controls on a timer. Track whether the extension has handled the current player instance, and verify the control state before acting.
- Do not implement annotation-menu automation in the first release. Ship CSS/UI suppression first; add annotation control only if it remains a real user need and can be done without repeated or surprising player-menu interactions.

### 5.5 Navigation choices

Do not redirect feeds automatically in the initial version. Hiding recommendations while leaving navigation and search available is more predictable and avoids request interception. If users later request redirects, make each one opt-in, preserve a clear route back, and implement/test it separately from the core hiding rules.

## 6. Delivery milestones

### Milestone A — Installable skeleton

- Add the Manifest V3 extension directory and minimal popup.
- Verify it loads unpacked in Chrome without errors and matches only YouTube desktop/mobile pages.
- Document the local installation and reload process in `README.md`.

**Exit check:** Chrome accepts `extension/` through **Load unpacked**; popup opens; no build or network dependency is needed.

### Milestone B — Settings and intuitive controls

- Implement versioned defaults, normalization, persistence, preset application, master switch, and live storage updates.
- Add keyboard-accessible grouped UI and clear on/off state.
- Add unit tests for defaults, malformed values, migration/merge behavior, preset application, and custom mode.

**Exit check:** Settings survive reload; popup changes update an already-open YouTube page; turning the master switch off restores page UI without deleting preferences.

### Milestone C — Core anti-recommendation mode

- Add feature-scoped CSS for home feed, watch related sidebar, Shorts, end-screen suggestions/cards, Mixes, and supplemental search shelves.
- Add the home empty-state panel while keeping search and Subscriptions accessible.
- Test desktop, mobile YouTube, logged-out pages, and YouTube-origin embed frames where available.

**Exit check:** Targeted recommendation surfaces are suppressed on initial load and after SPA navigation; primary search results and video playback still work.

### Milestone D — Playback and optional controls

- Add idempotent autoplay-off handling for desktop/mobile player controls.
- Add optional comment, chat, metadata, header, notification, Explore/Trending, subscription, and promotion controls in the collapsed advanced group.
- Keep all optional controls independently reversible and scoped.

**Exit check:** Autoplay is switched off only when enabled; captions, seek, pause/play, fullscreen, manual next/previous, and other non-autoplay player controls remain usable. Optional hides do not alter unrelated regions.

### Milestone E — Hardening and documentation

- Add a local HTML fixture that represents the target surfaces and exercise CSS/settings logic against it.
- Run static checks for manifest validity, selector scoping, duplicate listeners/observers, accidental remote URLs, and permission creep.
- Complete the manual browser test matrix below and document known YouTube DOM limitations.
- Update the Readme to create a nice GitHub page with easy quickstart guide

**Exit check:** All acceptance criteria pass; extension source remains directly loadable; no console errors in the tested flows.

## 7. Test and acceptance matrix

| Area                   | Acceptance criteria                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Local installation     | Load unpacked from `extension/`; update by pressing Reload on `chrome://extensions`; no compilation, login, or server needed.                    |
| Initial state          | Fresh install starts in Focus mode with recommendation surfaces hidden and the header/search/player intact.                                      |
| Reversibility          | Master switch restores the targeted UI; individual options restore only their surface; saved choices survive extension/page reload.              |
| SPA behavior           | Home → search → watch → another watch → back/forward transitions preserve the selected hides without a full page reload.                         |
| Usability              | Search box, primary search results, video title, player, pause/play, seeking, captions, volume, fullscreen, and manual navigation remain usable. |
| Autoplay               | When enabled in settings, an active autoplay toggle is turned off once per player instance; already-disabled controls are not clicked.           |
| Surface boundaries     | Hiding comments, metadata, or the sidebar does not hide the video player or primary content. A missing selector fails open.                      |
| Responsive/frame scope | Desktop and mobile YouTube layouts are checked; matching YouTube embed frames are handled without injecting into arbitrary host sites.           |
| Privacy/permissions    | Only storage and YouTube host access are declared; no network calls or remote assets originate from the extension.                               |
| UI accessibility       | Controls work with keyboard, have associated labels, and expose checked/disabled states clearly.                                                 |

Use a local fixture for repeatable selector checks, then perform a small manual smoke test on YouTube in a clean browser profile. YouTube's DOM is third-party and changes over time, so fixture success is not proof of current production compatibility.

## 8. Out of scope for the first release

- Changing YouTube's recommendation ranking, model, or server-side behavior.
- Blocking API/network requests, ads, scripts, or analytics traffic.
- Requiring account access, collecting watch/search history, or sending telemetry.
- Automatic feed redirects, annotation-menu automation, or broad DOM removal.
- Supporting arbitrary video sites or promising compatibility with every third-party browser.

These boundaries keep the initial implementation small, locally installable, and focused on preventing recommendation surfaces from steering the user while preserving normal YouTube search and playback.
