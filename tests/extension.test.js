"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Settings = require("../extension/settings.js");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Manifest V3 stays within the declared privacy and host boundaries", () => {
  const manifest = JSON.parse(read("extension/manifest.json"));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.deepEqual(manifest.host_permissions, ["https://www.youtube.com/*", "https://m.youtube.com/*"]);
  assert.equal(manifest.content_scripts[0].all_frames, true);
  assert.equal(manifest.content_scripts[0].run_at, "document_start");
  assert.equal(manifest.content_scripts[0].js[0], "settings.js");
  for (const size of [16, 48, 128]) {
    const icon = `extension/icons/icon-${size}.png`;
    assert.equal(manifest.icons[String(size)], `icons/icon-${size}.png`);
    assert.equal(manifest.action.default_icon[String(size)], `icons/icon-${size}.png`);
    assert.ok(fs.existsSync(path.join(root, icon)), `missing local icon ${icon}`);
  }
  assert.equal("background" in manifest, false);
  assert.equal("web_accessible_resources" in manifest, false);
});

test("every CSS selector is extension-root scoped or belongs to the local empty state", () => {
  const css = read("extension/youtube.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  assert.ok(rules.length > 15, "expected feature-scoped CSS rules");
  for (const [, selectorText, declarations] of rules) {
    const selectors = selectorText.trim().split(",").map((selector) => selector.trim());
    for (const selector of selectors) {
      assert.ok(
        selector.startsWith('html[data-calm-enabled="true"]') || selector.startsWith(".calm-yt-home-state"),
        `unscoped selector: ${selector}`
      );
    }
    if (declarations.includes("display: none")) assert.match(declarations, /display:\s*none\s*!important/);
  }
});

test("all Boolean preferences have popup controls and CSS-backed hide attributes", () => {
  const popup = read("extension/popup.html");
  const css = read("extension/youtube.css");
  for (const key of Settings.BOOLEAN_KEYS) {
    if (key === "enabled") {
      assert.ok(popup.includes('id="enabled"'), "popup is missing the master switch");
      continue;
    }
    assert.ok(popup.includes(`data-setting="${key}"`), `popup is missing ${key}`);
    if (key === "disableAutoplay") continue;
    const attribute = key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
    assert.ok(css.includes(`data-calm-${attribute}`), `CSS is missing data-calm-${attribute}`);
  }
});

test("popup exposes native labeled controls and a clear master-off disabled state", () => {
  const popup = read("extension/popup.html");
  const script = read("extension/popup.js");
  assert.match(popup, /<input id="enabled" type="checkbox" role="switch">/);
  assert.match(popup, /<fieldset class="presets" id="presets">/);
  assert.match(popup, /<details class="advanced">/);
  assert.match(script, /input\.disabled = !settings\.enabled/);
  assert.match(script, /aria-disabled/);
});

test("fixture covers recommendation targets while preserving primary viewing controls", () => {
  const fixture = read("tests/fixtures/youtube-page.html");
  for (const target of [
    'page-subtype="home"', "ytd-rich-grid-renderer", 'id="related"', "ytd-reel-shelf-renderer",
    'class="ytp-endscreen-content"', 'class="ytp-cards-teaser"', "ytd-radio-renderer", "ytd-shelf-renderer",
    "ytm-browse", "ytm-rich-grid-renderer", "ytm-watch-next-secondary-results-renderer", "ytm-reel-shelf-renderer"
  ]) assert.ok(fixture.includes(target), `fixture is missing ${target}`);
  for (const preserved of ['id="movie_player"', 'id="search"', "ytd-video-primary-info-renderer", 'class="ytp-play-button"', 'class="ytp-time-slider"']) {
    assert.ok(fixture.includes(preserved), `fixture is missing preserved UI ${preserved}`);
  }
  assert.match(fixture, /<ytm-browse><ytm-rich-grid-renderer/);
  const content = read("extension/content.js");
  assert.match(content, /calm-yt-home-state/);
  assert.match(content, /Search YouTube/);
  assert.match(content, /\/feed\/subscriptions/);
  assert.match(content, /data-calm-home-route/);
  assert.match(read("extension/youtube.css"), /data-calm-home-route="true"\]\[data-calm-hide-home-feed="true"\] ytm-browse ytm-rich-grid-renderer/);
});

test("extension source has no remote fetch or third-party assets", () => {
  for (const file of ["extension/popup.html", "extension/popup.css", "extension/popup.js", "extension/content.js", "extension/settings.js", "extension/youtube.css"]) {
    const source = read(file);
    assert.doesNotMatch(source, /https?:\/\//i, `${file} contains a remote URL`);
    assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|WebSocket\s*\(/, `${file} contains a network API`);
  }
});

test("content observers have bounded lifetimes and explicit cleanup paths", () => {
  const content = read("extension/content.js");
  assert.equal((content.match(/new MutationObserver\(/g) || []).length, 3);
  assert.match(content, /homeObserver\.disconnect\(\)/);
  assert.match(content, /entry\.observer\.disconnect\(\)/);
  assert.match(content, /routeObserver\?\.disconnect\(\)/);
  assert.match(content, /setTimeout\(stopHomeObserver, 12000\)/);
  assert.match(content, /setTimeout\(\(\) => \{[\s\S]*?stopPlayerObserver\(player\)/);
  assert.match(content, /for \(const eventName of \[[\s\S]*?document\.addEventListener\(eventName/);
});
