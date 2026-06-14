chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ running: false });
});

let JOBS = [];
let busy = false;


const THRESHOLD_MINUTES = 10;
const ALARM = "upwork_tick";

const loadurl = "http://160.187.141.72:5001/firstmejob"
const sendurl = "http://160.187.141.72:5001/firstmelog"
// --------------------
// LOAD JOBS FROM PYTHON
// --------------------
async function loadJobs() {
  try {
    const res = await fetch(loadurl);

    JOBS = await res.json();
  } catch (e) {
    console.error("Failed to load jobs", e);
  }
}

// --------------------
// NOTIFICATION
// --------------------
function notify(url, raw) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icon.png",
    title: "🔥 Upwork Hot Lead",
    message: `Last viewed: ${raw}`
  });
}

// --------------------
// WAIT TAB LOAD
// --------------------
function waitTab(tabId) {
  return new Promise((resolve) => {
    function listener(id, info) {
      if (id === tabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}
async function sendLog(payload) {
  try {
    await fetch(sendurl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    console.error("log failed", e);
  }
}

async function scrape(tabId, url) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: async () => {
      let items = [...document.querySelectorAll(".ca-item")];
      if (!items.length) {      
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 1000));
          items = [...document.querySelectorAll(".ca-item")];
          if (items.length) {
            break;
          }
        }
        if (!items.length) {
          return {
              proposals: "",
              lastViewed: "",
              interviewing: "",
              hires: "",
              invites: "",
              unanswered: ""
          };
        }
    }
      const findValue = (label) => {
        const el = items.find(e => e.innerText.includes(label));
        return el?.querySelector(".value")?.innerText || "";
      };
      const proposals = findValue("Proposals");
      const lastViewed = findValue("Last viewed by client");
      const hires = findValue("Hires");
      const interviewing = findValue("Interviewing");
      const invites = findValue("Invites sent");
      const unanswered = findValue("Unanswered invites");

      const n = parseInt(lastViewed) || 0;
      const lower = lastViewed.toLowerCase();
      let lastViewedMinutes = 999999;
      if (lower.includes("second")) lastViewedMinutes = 0;
      else if (lower.includes("minute")) lastViewedMinutes = n;
      else if (lower.includes("hour")) lastViewedMinutes = n * 60;
      else if (lower.includes("yesterday")) lastViewedMinutes = 1440;
      else if (lower.includes("day")) lastViewedMinutes = n * 1440;

      return {
        proposals: proposals,
        lastViewed: lastViewedMinutes,
        interviewing: interviewing,
        hires: hires,
        invites,
        unanswered
      };
    }
  });

  return result;
}

async function checkJob(url) {
  let tab;

  try {
    tab = await chrome.tabs.create({ url, active: false });

    // ⏱ safety timeout so it never hangs forever
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("TIMEOUT")), 20000)
    );

    await Promise.race([waitTab(tab.id), timeout]);

    await new Promise(r => setTimeout(r, 2000));

    let data;
    try {
      data = await scrape(tab.id, url);
    } catch (e) {
      console.warn("Scrape failed:", url, e);
    }

    await sendLog({
      url,
      proposals: data.proposals,
      lastViewed: data.lastViewed,
      interviewing: data.interviewing,
      hires: data.hires,
      invites: data.invites,
      unanswered: data.unanswered
    });

  } catch (err) {
    console.error("❌ Job failed:", url, err);

  } finally {
    if (tab?.id) {
      try {
        await chrome.tabs.remove(tab.id);
      } catch {}
    }
  }
}

// --------------------
// MAIN LOOP
// --------------------
async function run() {
  const { running } = await chrome.storage.local.get(["running"]);

  if (!running) return;   // ⛔ STOP HERE

  if (busy) return;
  busy = true;

  try {
    await loadJobs();

    for (const url of JOBS) {
      const { running: stillRunning } =
        await chrome.storage.local.get(["running"]);

      if (!stillRunning) {
        console.log("Stopped mid-run");
        break;
      }
      try {
        await checkJob(url);
      } catch (e) {
        console.error("Loop-safe error:", url, e);
      }
    }

  } finally {
    busy = false;
  }
}

// --------------------
// SCHEDULER
// --------------------
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM, { periodInMinutes: 0.1 });
});

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === ALARM) run();
});

chrome.alarms.create("upwork_tick", { periodInMinutes: 0.1 });

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "upwork_tick") run();
});