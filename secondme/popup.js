const statusEl = document.getElementById("status");

async function updateStatus() {
  const res = await chrome.storage.local.get(["running"]);
  statusEl.innerText = "Status: " + (res.running ? "RUNNING" : "STOPPED");
}

document.getElementById("start").onclick = async () => {
  await chrome.storage.local.set({ running: true });
  updateStatus();
};

document.getElementById("stop").onclick = async () => {
  await chrome.storage.local.set({ running: false });
  updateStatus();
};

updateStatus();