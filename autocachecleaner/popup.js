document.addEventListener("DOMContentLoaded", () => {
  const cache = document.getElementById("cache");
  const cookies = document.getElementById("cookies");
  const history = document.getElementById("history");
  const downloads = document.getElementById("downloads");
  const interval = document.getElementById("interval");
  const start = document.getElementById("start");
  const stop = document.getElementById("stop");
  const lastClean = document.getElementById("lastClean");

  // Load last cleaned time
  chrome.storage.local.get("lastClean", (data) => {
    if (data.lastClean) lastClean.textContent = "Last cleaned: " + data.lastClean;
  });

  // Start auto clean
  start.addEventListener("click", () => {
    const options = {
      cache: cache.checked,
      cookies: cookies.checked,
      history: history.checked,
      downloads: downloads.checked
    };

    const minutes = parseInt(interval.value);

    chrome.storage.local.set({ settings: { autoClean: true, options } });
    chrome.alarms.create("autoClean", { periodInMinutes: minutes });
    alert("Auto clean started!");
  });

  // Stop auto clean
  stop.addEventListener("click", () => {
    chrome.alarms.clear("autoClean");
    chrome.storage.local.get("settings", (result) => {
      const settings = result.settings || {};
      settings.autoClean = false;
      chrome.storage.local.set({ settings });
    });
    alert("Auto clean stopped!");
  });
});