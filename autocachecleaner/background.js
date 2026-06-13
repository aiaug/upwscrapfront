function clearData(options) {
  chrome.browsingData.remove({}, options, () => {
    const now = new Date().toLocaleString();
    chrome.storage.local.set({ lastClean: now });
    console.log("Data cleared at " + now);
  });
}

// Handle alarm
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "autoClean") {
    chrome.storage.local.get(["settings"], (result) => {
      if (result.settings && result.settings.autoClean) {
        clearData(result.settings.options);
      }
    });
  }
});