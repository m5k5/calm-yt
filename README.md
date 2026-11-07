# calm-yt

**A calmer YouTube, on your terms.** calm-yt is a small, local-first Chrome/Chromium extension that hides recommendation-heavy surfaces while keeping search, the player, and ordinary navigation usable. Choose a preset, fine-tune individual sections, and turn everything off whenever you like.

No build step. No account. No remote service, analytics, or network blocking.

## Quick start

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome or a Chromium-based browser.
3. Turn on **Developer mode**.
4. Select **Load unpacked** and choose the repository's `extension/` folder.
5. Open YouTube and select the calm-yt toolbar button to choose your settings.

After changing extension files, return to `chrome://extensions` and press **Reload** on calm-yt. Refresh the YouTube tab to load changed content scripts and styles. Preferences are saved locally and survive both reloads.

## What it changes

The default **Focus** preset hides the home feed, related videos, Shorts, end-screen suggestions and cards, Mix/radio shelves, and supplemental search shelves. It also turns off an enabled autoplay control once per player instance. Search results, the search box, video, title, and normal playback controls remain available.

Choose **Balanced** for the home/related/Shorts/end-screen suggestion hides without hiding end-screen cards, Mixes, or search shelves or disabling autoplay. **Custom** preserves your individual switches. The collapsed **More controls** group can optionally hide comments, live chat, video information, the buttons bar, channel, description, header, notifications, Explore/Trending, subscriptions, and promotional shelves.

The master switch temporarily restores the YouTube UI without erasing your preferences. On the home page, a small local panel offers Search and Subscriptions links when the feed is hidden. Settings changes apply to open YouTube pages without reloading them.

## Privacy and permissions

- The only declared permission is `storage`; host access is limited to `www.youtube.com` and `m.youtube.com`.
- Preferences live in `chrome.storage.local`.
- The extension does not make network requests, load remote assets, inspect account data, or transmit page content.
- Content scripts run only in matching YouTube-origin frames, including YouTube embed frames. They do not run in arbitrary sites that embed a video.
- Hiding is presentation-only; calm-yt does not block requests or change YouTube's ranking.

## Development and tests

The `extension/` directory is the unpacked extension. It contains plain HTML, CSS, and JavaScript and needs no compilation or dependency installation. Run the dependency-free unit/static checks with Node.js:

```sh
node --test
```

Settings are stored as one schema-versioned `calmYtSettings` record. The content script maps each Boolean hide option from camelCase to a root `data-calm-*` attribute (for example, `hideRelated` becomes `data-calm-hide-related`); disabling the master switch removes only calm-yt-owned attributes.

Repeatable fixture coverage is in `tests/fixtures/youtube-page.html`. Before release, also smoke-test a clean browser profile on desktop and mobile YouTube: Home → Search → Watch → another video → Back/Forward; toggle individual settings and the master switch; check autoplay on and already off; and verify captions, seeking, pause/play, volume, fullscreen, and manual navigation.

## Compatibility notes

YouTube's DOM is third-party and changes over time. Rules use narrow custom-element, semantic, and route selectors and fail open when a selector no longer matches. Some optional selectors use `:has()` and require a modern Chromium browser. The included fixture checks source-level selector boundaries, not live YouTube markup. Actual browser smoke testing is still recommended after YouTube UI changes.

## Project layout

```text
extension/   Load this folder as an unpacked extension
tests/       Node tests and a local YouTube-like fixture
implementation-plan.md
features.md  Reference feature analysis; not runtime code
```

## License

See [LICENSE](LICENSE).
