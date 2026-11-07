"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Settings = require("../extension/settings.js");

function startContent(initialSettings, player, externalControl = null) {
  const attributes = new Map([["data-page-owner", "youtube"]]);
  const root = {
    setAttribute(name, value) { attributes.set(name, value); },
    removeAttribute(name) { attributes.delete(name); },
    getAttribute(name) { return attributes.get(name) ?? null; }
  };
  const documentListeners = new Map();
  const windowListeners = new Map();
  const location = { pathname: "/watch", search: "?v=fixture" };
  let storageListener;
  const document = {
    documentElement: root,
    addEventListener(name, listener) { documentListeners.set(name, () => listener({ type: name })); },
    querySelector(selector) {
      if (selector.includes("ytd-browse") || selector === ".calm-yt-home-state") return null;
      if (externalControl && (selector === "player-autonav-toggle button[aria-pressed]" || selector === 'button[aria-label*="autoplay" i]')) return externalControl;
      if (selector === "#movie_player" || selector === "ytm-player" || selector === ".html5-video-player") return player || null;
      return null;
    }
  };
  const context = {
    CalmSettings: Settings,
    document,
    location,
    URLSearchParams,
    chrome: {
      storage: {
        local: { async get(key) { return { [key]: initialSettings }; } },
        onChanged: { addListener(listener) { storageListener = listener; } }
      }
    },
    addEventListener(name, listener) { windowListeners.set(name, listener); },
    setTimeout,
    clearTimeout,
    MutationObserver: undefined
  };
  const source = fs.readFileSync(path.join(__dirname, "../extension/content.js"), "utf8");
  vm.runInNewContext(source, context);
  return { attributes, storageListener, documentListeners, windowListeners, location };
}

test("content bridge applies option attributes and removes only its own attributes when disabled", async () => {
  const state = startContent(Settings.DEFAULTS);
  await new Promise(setImmediate);
  assert.equal(state.attributes.get("data-calm-enabled"), "true");
  assert.equal(state.attributes.get("data-calm-hide-home-feed"), "true");
  assert.equal(state.attributes.get("data-calm-hide-related"), "true");

  state.location.pathname = "/";
  state.documentListeners.get("yt-page-data-updated")();
  await new Promise((resolve) => setTimeout(resolve, 110));
  assert.equal(state.attributes.get("data-calm-home-route"), "true");

  state.storageListener({ [Settings.STORAGE_KEY]: { newValue: { ...Settings.DEFAULTS, enabled: false } } }, "local");
  assert.equal(state.attributes.has("data-calm-enabled"), false);
  assert.equal(state.attributes.has("data-calm-home-route"), false);
  assert.equal(state.attributes.has("data-calm-hide-related"), false);
  assert.equal(state.attributes.get("data-page-owner"), "youtube");
});

test("autoplay is clicked once only when the player accessibility state is on", async () => {
  let clicks = 0;
  const control = {
    state: "true",
    getAttribute(name) { return name === "aria-checked" ? this.state : null; },
    click() { clicks += 1; this.state = "false"; }
  };
  const player = {
    isConnected: true,
    querySelector(selector) { return selector === ".ytp-autonav-toggle-button" ? control : null; }
  };
  const state = startContent(Settings.DEFAULTS, player);
  await new Promise(setImmediate);
  assert.equal(clicks, 1);

  state.documentListeners.get("yt-navigate-finish")();
  await new Promise((resolve) => setTimeout(resolve, 110));
  assert.equal(clicks, 1, "navigation must not click the same player twice");
});

test("a reused player is rechecked for a different SPA video exactly once", async () => {
  let clicks = 0;
  const control = {
    state: "true",
    getAttribute(name) { return name === "aria-checked" ? this.state : null; },
    click() { clicks += 1; this.state = "false"; }
  };
  const player = {
    isConnected: true,
    querySelector(selector) { return selector === ".ytp-autonav-toggle-button" ? control : null; }
  };
  const state = startContent(Settings.DEFAULTS, player);
  await new Promise(setImmediate);
  assert.equal(clicks, 1);
  state.location.search = "?v=another-video";
  control.state = "true";
  state.documentListeners.get("yt-navigate-finish")();
  await new Promise((resolve) => setTimeout(resolve, 110));
  assert.equal(clicks, 2, "new video route must be handled even when #movie_player is reused");
  state.documentListeners.get("yt-player-updated")();
  await new Promise((resolve) => setTimeout(resolve, 110));
  assert.equal(clicks, 2, "the same video route must not be clicked twice");
});

test("a stale off state during SPA navigation stays provisional until player update", async () => {
  let clicks = 0;
  const control = {
    state: "false",
    getAttribute(name) { return name === "aria-checked" ? this.state : null; },
    click() { clicks += 1; this.state = "false"; }
  };
  const player = {
    isConnected: true,
    querySelector(selector) { return selector === ".ytp-autonav-toggle-button" ? control : null; }
  };
  const state = startContent(Settings.DEFAULTS, player);
  await new Promise(setImmediate);
  assert.equal(clicks, 0);
  state.location.search = "?v=next-video";
  state.documentListeners.get("yt-navigate-finish")();
  await new Promise((resolve) => setTimeout(resolve, 110));
  assert.equal(clicks, 0, "a stale off control is not toggled during navigation");
  state.documentListeners.get("yt-player-updated")();
  await new Promise((resolve) => setTimeout(resolve, 180));
  control.state = "true";
  await new Promise((resolve) => setTimeout(resolve, 450));
  assert.equal(clicks, 1, "player initialization's on state is turned off");
  assert.equal(control.state, "false");
});

test("an already-disabled autoplay control is never clicked", async () => {
  let clicks = 0;
  const control = {
    getAttribute(name) { return name === "aria-pressed" ? "false" : null; },
    click() { clicks += 1; }
  };
  const player = {
    isConnected: true,
    querySelector(selector) {
      return selector === 'button[aria-label*="autoplay" i]' ? control : null;
    }
  };
  const state = startContent(Settings.DEFAULTS, player);
  await new Promise(setImmediate);
  assert.equal(clicks, 0);
  state.documentListeners.get("yt-player-updated")();
  await new Promise((resolve) => setTimeout(resolve, 110));
  assert.equal(clicks, 0);
});

test("mobile player-autonav-toggle aria-pressed state is turned off", async () => {
  let clicks = 0;
  const control = {
    state: "true",
    getAttribute(name) { return name === "aria-pressed" ? this.state : null; },
    click() { clicks += 1; this.state = "false"; }
  };
  const player = {
    isConnected: true,
    querySelector(selector) {
      return selector === "player-autonav-toggle button[aria-pressed]" ? control : null;
    }
  };
  startContent(Settings.DEFAULTS, player);
  await new Promise(setImmediate);
  assert.equal(clicks, 1);
  assert.equal(control.state, "false");
});

test("mobile autoplay toggle outside the player subtree is still found", async () => {
  let clicks = 0;
  const control = {
    state: "true",
    getAttribute(name) { return name === "aria-pressed" ? this.state : null; },
    click() { clicks += 1; this.state = "false"; }
  };
  const player = { isConnected: true, parentElement: {}, querySelector() { return null; } };
  startContent(Settings.DEFAULTS, player, control);
  await new Promise(setImmediate);
  assert.equal(clicks, 1);
  assert.equal(control.state, "false");
});
