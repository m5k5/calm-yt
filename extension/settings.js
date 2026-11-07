(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CalmSettings = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SCHEMA_VERSION = 1;
  const STORAGE_KEY = "calmYtSettings";
  const DEFAULTS = Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    enabled: true,
    preset: "focus",
    hideHomeFeed: true,
    hideRelated: true,
    hideShorts: true,
    hideEndscreen: true,
    hideCards: true,
    hideMixes: true,
    hideSearchShelves: true,
    disableAutoplay: true,
    hideComments: false,
    hideLiveChat: false,
    hideVideoInfo: false,
    hideButtonsBar: false,
    hideChannel: false,
    hideDescription: false,
    hideHeader: false,
    hideNotifications: false,
    hideExplore: false,
    hideSubscriptions: false,
    hidePromotions: false
  });

  const BOOLEAN_KEYS = Object.freeze(Object.keys(DEFAULTS).filter((key) =>
    typeof DEFAULTS[key] === "boolean"
  ));
  const PRESETS = Object.freeze({
    focus: Object.freeze({
      hideHomeFeed: true,
      hideRelated: true,
      hideShorts: true,
      hideEndscreen: true,
      hideCards: true,
      hideMixes: true,
      hideSearchShelves: true,
      disableAutoplay: true
    }),
    balanced: Object.freeze({
      hideHomeFeed: true,
      hideRelated: true,
      hideShorts: true,
      hideEndscreen: true,
      hideCards: true,
      hideMixes: false,
      hideSearchShelves: false,
      disableAutoplay: false
    })
  });

  function normalizeSettings(input) {
    const source = input && typeof input === "object" && !Array.isArray(input)
      ? input
      : {};
    const settings = { ...DEFAULTS };

    for (const key of BOOLEAN_KEYS) {
      if (typeof source[key] === "boolean") settings[key] = source[key];
    }

    if (source.preset === "focus" || source.preset === "balanced" || source.preset === "custom") {
      settings.preset = source.preset;
    }
    // Older or partial records are safely merged with current defaults. Unknown
    // keys and unsupported schema versions are deliberately ignored.
    settings.schemaVersion = SCHEMA_VERSION;
    return settings;
  }

  function applyPreset(current, preset) {
    const settings = normalizeSettings(current);
    if (preset === "focus" || preset === "balanced") {
      Object.assign(settings, PRESETS[preset]);
      settings.preset = preset;
    } else if (preset === "custom") {
      settings.preset = "custom";
    } else {
      throw new TypeError("Unknown calm-yt preset");
    }
    return settings;
  }

  function updateSetting(current, key, value) {
    if (!BOOLEAN_KEYS.includes(key) || typeof value !== "boolean") {
      throw new TypeError("Unknown setting or non-Boolean value");
    }
    const settings = normalizeSettings(current);
    settings[key] = value;
    settings.preset = "custom";
    return settings;
  }

  async function readSettings(storageArea) {
    const area = storageArea || (globalThis.chrome && globalThis.chrome.storage.local);
    if (!area || typeof area.get !== "function") return normalizeSettings();
    const result = await area.get(STORAGE_KEY);
    return normalizeSettings(result && result[STORAGE_KEY]);
  }

  async function writeSettings(settings, storageArea) {
    const area = storageArea || (globalThis.chrome && globalThis.chrome.storage.local);
    if (!area || typeof area.set !== "function") throw new Error("Extension storage is unavailable");
    const normalized = normalizeSettings(settings);
    await area.set({ [STORAGE_KEY]: normalized });
    return normalized;
  }

  return Object.freeze({
    SCHEMA_VERSION,
    STORAGE_KEY,
    DEFAULTS,
    BOOLEAN_KEYS,
    PRESETS,
    normalizeSettings,
    applyPreset,
    updateSetting,
    readSettings,
    writeSettings
  });
});
