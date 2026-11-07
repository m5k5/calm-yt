(function () {
  "use strict";

  const { STORAGE_KEY, readSettings, writeSettings, applyPreset, updateSetting } = globalThis.CalmSettings;
  const enabledInput = document.getElementById("enabled");
  const masterState = document.getElementById("master-state");
  const status = document.getElementById("status");
  const settingInputs = [...document.querySelectorAll("[data-setting]")];
  const presetInputs = [...document.querySelectorAll('input[name="preset"]')];
  let current = null;
  let statusTimer;
  let saveRevision = 0;
  let saveQueue = Promise.resolve();
  let pendingSaves = 0;

  function render(settings) {
    current = settings;
    enabledInput.checked = settings.enabled;
    masterState.textContent = settings.enabled ? "On" : "Off";
    document.body.classList.toggle("is-disabled", !settings.enabled);
    for (const input of settingInputs) {
      input.checked = settings[input.dataset.setting];
      input.disabled = !settings.enabled;
    }
    for (const input of presetInputs) {
      input.checked = input.value === settings.preset;
      input.disabled = !settings.enabled;
    }
    const advanced = document.querySelector(".advanced");
    const summary = advanced.querySelector("summary");
    summary.setAttribute("aria-disabled", String(!settings.enabled));
    summary.tabIndex = settings.enabled ? 0 : -1;
    if (!settings.enabled) advanced.open = false;
  }

  function save(settings, message) {
    // Update the source of truth synchronously so a second quick change is
    // based on the first one, then serialize writes to preserve that order.
    current = settings;
    render(settings);
    const revision = ++saveRevision;
    pendingSaves += 1;
    const pending = saveQueue.then(() => writeSettings(settings));
    saveQueue = pending.catch(() => {});
    pending.then((saved) => {
      pendingSaves -= 1;
      if (revision !== saveRevision) return;
      render(saved);
      status.textContent = message || "Saved — open YouTube pages update automatically.";
      clearTimeout(statusTimer);
      statusTimer = setTimeout(() => { status.textContent = ""; }, 2400);
    }, (error) => {
      pendingSaves -= 1;
      if (revision !== saveRevision) return;
      status.textContent = "Could not save settings. Check extension storage permissions.";
      console.error("calm-yt: settings save failed", error);
    });
  }

  enabledInput.addEventListener("change", () => {
    if (current) save({ ...current, enabled: enabledInput.checked });
  });

  document.querySelector(".advanced summary").addEventListener("click", (event) => {
    if (current && !current.enabled) event.preventDefault();
  });

  for (const input of settingInputs) {
    input.addEventListener("change", () => {
      if (current) save(updateSetting(current, input.dataset.setting, input.checked));
    });
  }

  for (const input of presetInputs) {
    input.addEventListener("change", () => {
      if (current && input.checked) save(applyPreset(current, input.value), `${input.value[0].toUpperCase()}${input.value.slice(1)} settings applied.`);
    });
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[STORAGE_KEY]) return;
    if (pendingSaves > 0) return;
    render(globalThis.CalmSettings.normalizeSettings(changes[STORAGE_KEY].newValue));
  });

  readSettings().then(render).catch((error) => {
    status.textContent = "Could not load saved settings.";
    console.error("calm-yt: settings load failed", error);
  });
})();
