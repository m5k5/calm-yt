(function () {
  "use strict";

  const { STORAGE_KEY, readSettings, normalizeSettings } = globalThis.CalmSettings;
  const ATTRIBUTE_KEYS = Object.keys(normalizeSettings()).filter((key) => key.startsWith("hide") || key === "disableAutoplay");
  const handledPlayers = new WeakMap();
  const playerObservers = new Map();
  let settings = normalizeSettings();
  let routeKey = "";
  let routeTimer = 0;
  let playerReadyTimer = 0;
  let routeObserver = null;
  let routeObserverRoot = null;
  let homeObserver = null;
  let homeObserverTimeout = 0;
  let homeReadyListener = false;

  function attributeName(key) {
    return `data-calm-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
  }

  function rootElement() {
    return document.documentElement;
  }

  function applyAttributes() {
    const root = rootElement();
    if (!root) return;
    if (!settings.enabled) {
      root.removeAttribute("data-calm-enabled");
      root.removeAttribute("data-calm-home-route");
      for (const key of ATTRIBUTE_KEYS) root.removeAttribute(attributeName(key));
      return;
    }

    root.setAttribute("data-calm-enabled", "true");
    if (isHomeRoute()) root.setAttribute("data-calm-home-route", "true");
    else root.removeAttribute("data-calm-home-route");
    for (const key of ATTRIBUTE_KEYS) {
      root.setAttribute(attributeName(key), String(settings[key]));
    }
  }

  function isHomeRoute() {
    return location.pathname === "/" || location.pathname === "/feed";
  }

  function homeContainer() {
    return document.querySelector('ytd-browse[page-subtype="home"] #primary') ||
      document.querySelector('ytm-browse[page-subtype="home"] #primary') ||
      document.querySelector('ytd-browse[page-subtype="home"]') ||
      document.querySelector('ytm-browse[page-subtype="home"]') ||
      document.querySelector('ytm-browse');
  }

  function stopHomeObserver() {
    if (!homeObserver) return;
    homeObserver.disconnect();
    homeObserver = null;
    clearTimeout(homeObserverTimeout);
    homeObserverTimeout = 0;
  }

  function startHomeObserver() {
    if (homeObserver || !settings.enabled || !settings.hideHomeFeed || !isHomeRoute() || typeof MutationObserver === "undefined") return;
    const root = document.querySelector("ytm-app") || document.querySelector("ytd-app") || document.body;
    if (!root) {
      if (!homeReadyListener) {
        homeReadyListener = true;
        document.addEventListener("DOMContentLoaded", () => {
          homeReadyListener = false;
          startHomeObserver();
        }, { once: true });
      }
      return;
    }
    homeObserver = new MutationObserver(() => updateHomePanel());
    homeObserver.observe(root, { childList: true, subtree: true });
    homeObserverTimeout = setTimeout(stopHomeObserver, 12000);
  }

  function updateHomePanel() {
    const existing = document.querySelector(".calm-yt-home-state");
    if (!settings.enabled || !settings.hideHomeFeed || !isHomeRoute()) {
      existing?.remove();
      stopHomeObserver();
      return;
    }
    startHomeObserver();
    if (existing) return;
    const container = homeContainer();
    if (!container) return;

    const panel = document.createElement("section");
    panel.className = "calm-yt-home-state";
    panel.setAttribute("aria-label", "calm-yt home feed is hidden");
    panel.innerHTML = '<p class="calm-yt-home-state__eyebrow">A quieter starting point</p><h2>Your home feed is hidden</h2><p>Choose what you want to watch, without the recommendations.</p><nav aria-label="YouTube destinations"><a href="/results?search_query=">Search YouTube</a><a href="/feed/subscriptions">Subscriptions</a></nav>';
    container.prepend(panel);
  }

  function playerElement() {
    return document.querySelector("#movie_player") ||
      document.querySelector("ytm-player") ||
      document.querySelector(".html5-video-player");
  }

  function playbackKey() {
    if (location.pathname === "/watch") {
      const videoId = new URLSearchParams(location.search).get("v");
      return videoId ? `watch:${videoId}` : `watch:${location.pathname}${location.search}`;
    }
    const embedMatch = location.pathname.match(/^\/embed\/([^/]+)/);
    return embedMatch ? `embed:${embedMatch[1]}` : null;
  }

  function autoplayControl(player) {
    return player.querySelector(".ytp-autonav-toggle-button") ||
      player.querySelector("player-autonav-toggle button[aria-pressed]") ||
      player.querySelector('ytm-autonav-toggle-button-renderer button') ||
      player.querySelector('button[aria-label*="autoplay" i]') ||
      document.querySelector("player-autonav-toggle button[aria-pressed]") ||
      document.querySelector('ytm-autonav-toggle-button-renderer button') ||
      document.querySelector('button[aria-label*="autoplay" i]');
  }

  function autoplayIsOn(control) {
    const state = control.getAttribute("aria-checked") ?? control.getAttribute("aria-pressed");
    if (state === "true") return true;
    if (state === "false") return false;
    return null;
  }

  function stopPlayerObserver(player) {
    const entry = playerObservers.get(player);
    if (!entry) return;
    clearTimeout(entry.timeout);
    entry.observer.disconnect();
    playerObservers.delete(player);
  }

  function observePlayer(player, key) {
    const existing = playerObservers.get(player);
    if (existing?.key === key || typeof MutationObserver === "undefined") return;
    if (existing) stopPlayerObserver(player);
    const observer = new MutationObserver(() => {
      if (!player.isConnected) {
        stopPlayerObserver(player);
        return;
      }
      inspectPlayer(player, false);
    });
    const timeout = setTimeout(() => {
      const entry = playerObservers.get(player);
      if (!entry || entry.key !== key) return;
      const control = player.isConnected && playbackKey() === key ? autoplayControl(player) : null;
      const state = control && autoplayIsOn(control);
      if (state === true) {
        handledPlayers.set(player, key);
        stopPlayerObserver(player);
        control.click();
      } else {
        if (state === false) handledPlayers.set(player, key);
        stopPlayerObserver(player);
      }
    }, 6000);
    playerObservers.set(player, { observer, timeout, key });
    observer.observe(player.parentElement || player, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-checked", "aria-pressed"] });
  }

  function inspectPlayer(player) {
    if (!settings.enabled || !settings.disableAutoplay || !player?.isConnected) return;
    const key = playbackKey();
    if (!key) {
      stopPlayerObserver(player);
      return;
    }
    if (handledPlayers.get(player) === key) return;
    const existingObserver = playerObservers.get(player);
    if (existingObserver && existingObserver.key !== key) stopPlayerObserver(player);

    const control = autoplayControl(player);
    const state = control && autoplayIsOn(control);
    if (state === false) {
      observePlayer(player, key);
      return;
    }
    if (state === true) {
      // Mark before clicking so a synchronous player update cannot cause a second click.
      handledPlayers.set(player, key);
      stopPlayerObserver(player);
      control.click();
      return;
    }
    observePlayer(player, key);
  }

  function clearAutoplayObservers() {
    for (const [player, entry] of playerObservers) {
      clearTimeout(entry.timeout);
      entry.observer.disconnect();
      playerObservers.delete(player);
    }
  }

  function handleAutoplay() {
    if (!settings.enabled || !settings.disableAutoplay) {
      clearAutoplayObservers();
      return;
    }
    const player = playerElement();
    if (player) inspectPlayer(player);
  }

  function applySettings() {
    observeAppRoute();
    applyAttributes();
    updateHomePanel();
    handleAutoplay();
  }

  function onNavigation(event) {
    observeAppRoute();
    if (event?.type === "yt-player-updated") {
      clearTimeout(playerReadyTimer);
      playerReadyTimer = setTimeout(() => {
        playerReadyTimer = 0;
        handleAutoplay();
      }, 500);
    }
    clearTimeout(routeTimer);
    routeTimer = setTimeout(() => {
      const nextRoute = `${location.pathname}${location.search}`;
      if (nextRoute !== routeKey) {
        routeKey = nextRoute;
        const player = playerElement();
        if (player) {
          handledPlayers.delete(player);
          stopPlayerObserver(player);
        }
      }
      applySettings();
    }, 80);
  }

  function observeAppRoute() {
    if (!settings.enabled || typeof MutationObserver === "undefined") {
      routeObserver?.disconnect();
      routeObserver = null;
      routeObserverRoot = null;
      return;
    }
    const root = document.querySelector("ytm-app") || document.querySelector("ytd-app");
    if (!root || root === routeObserverRoot) return;
    routeObserver?.disconnect();
    routeObserverRoot = root;
    routeObserver = new MutationObserver(() => {
      if (!routeObserverRoot?.isConnected) {
        observeAppRoute();
        return;
      }
      const currentRoute = `${location.pathname}${location.search}`;
      if (currentRoute !== routeKey) onNavigation();
    });
    routeObserver.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["page-subtype", "video-id"] });
  }

  routeKey = `${location.pathname}${location.search}`;
  for (const eventName of ["yt-navigate-start", "yt-navigate-finish", "yt-page-data-updated", "state-navigateend", "yt-player-updated"]) {
    document.addEventListener(eventName, onNavigation, true);
  }
  addEventListener("popstate", onNavigation);
  addEventListener("hashchange", onNavigation);

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[STORAGE_KEY]) return;
    const wasDisablingAutoplay = settings.disableAutoplay;
    const wasEnabled = settings.enabled;
    settings = normalizeSettings(changes[STORAGE_KEY].newValue);
    if (!settings.disableAutoplay || !settings.enabled) clearAutoplayObservers();
    if ((!wasDisablingAutoplay && settings.disableAutoplay) || (!wasEnabled && settings.enabled)) {
      const player = playerElement();
      if (player) handledPlayers.delete(player);
    }
    applySettings();
  });

  readSettings().then((saved) => {
    settings = saved;
    applySettings();
  }).catch(() => {
    // Defaults are safe; a storage failure should never interfere with viewing.
    applySettings();
  });
})();
