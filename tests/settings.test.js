"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Settings = require("../extension/settings.js");

test("fresh settings are versioned Focus defaults", () => {
  const settings = Settings.normalizeSettings();
  assert.equal(settings.schemaVersion, Settings.SCHEMA_VERSION);
  assert.equal(settings.preset, "focus");
  assert.equal(settings.enabled, true);
  for (const key of ["hideHomeFeed", "hideRelated", "hideShorts", "hideEndscreen", "hideCards", "hideMixes", "hideSearchShelves", "disableAutoplay"]) {
    assert.equal(settings[key], true, `${key} should be enabled in Focus`);
  }
  assert.equal(settings.hideComments, false);
});

test("normalization rejects malformed data and ignores unknown keys", () => {
  const result = Settings.normalizeSettings({
    enabled: "yes",
    preset: "unknown",
    hideRelated: false,
    hideComments: 1,
    arbitrary: true,
    schemaVersion: 900
  });
  assert.equal(result.enabled, true);
  assert.equal(result.preset, "focus");
  assert.equal(result.hideRelated, false);
  assert.equal(result.hideComments, false);
  assert.equal("arbitrary" in result, false);
  assert.equal(result.schemaVersion, Settings.SCHEMA_VERSION);
});

test("partial and older records merge with current defaults", () => {
  const result = Settings.normalizeSettings({ schemaVersion: 0, enabled: false, hideShorts: false });
  assert.equal(result.enabled, false);
  assert.equal(result.hideShorts, false);
  assert.equal(result.hideRelated, true);
  assert.equal(result.hideComments, false);
  assert.equal(result.schemaVersion, Settings.SCHEMA_VERSION);
});

test("presets apply named Boolean sets and Custom preserves choices", () => {
  const balanced = Settings.applyPreset(Settings.DEFAULTS, "balanced");
  assert.equal(balanced.preset, "balanced");
  assert.equal(balanced.hideHomeFeed, true);
  assert.equal(balanced.hideMixes, false);
  assert.equal(balanced.hideSearchShelves, false);
  assert.equal(balanced.disableAutoplay, false);

  const custom = Settings.applyPreset({ ...balanced, hideRelated: false }, "custom");
  assert.equal(custom.preset, "custom");
  assert.equal(custom.hideRelated, false);
  assert.equal(custom.hideHomeFeed, true);
  assert.throws(() => Settings.applyPreset(custom, "bogus"), TypeError);
});

test("editing any Boolean moves to Custom; invalid edits are rejected", () => {
  const changed = Settings.updateSetting(Settings.applyPreset(Settings.DEFAULTS, "balanced"), "hideRelated", false);
  assert.equal(changed.preset, "custom");
  assert.equal(changed.hideRelated, false);
  assert.equal(changed.hideHomeFeed, true);
  assert.throws(() => Settings.updateSetting(changed, "unknown", true), TypeError);
  assert.throws(() => Settings.updateSetting(changed, "enabled", "false"), TypeError);
});

test("storage helpers read, normalize, and persist only the versioned record", async () => {
  const data = { [Settings.STORAGE_KEY]: { hideComments: true, typo: true } };
  const area = {
    async get(key) { return { [key]: data[key] }; },
    async set(value) { Object.assign(data, value); }
  };
  const loaded = await Settings.readSettings(area);
  assert.equal(loaded.hideComments, true);
  assert.equal("typo" in loaded, false);
  const saved = await Settings.writeSettings({ ...loaded, enabled: false }, area);
  assert.equal(saved.enabled, false);
  assert.equal(data[Settings.STORAGE_KEY].schemaVersion, Settings.SCHEMA_VERSION);
});
