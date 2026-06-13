chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ running: false });
});

let JOBS = [];
let busy = false;


const THRESHOLD_MINUTES = 10;
const ALARM = "upwork_tick";

// --------------------
// LOAD JOBS FROM PYTHON
// --------------------
async function loadJobs() {
  try {
    const res = await fetch("http://160.187.141.72:5001/secondmejob");

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
    await fetch("http://160.187.141.72:5001/secondmelog", {
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

async function scrape(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const items = [...document.querySelectorAll(".ca-item")];
      if (!items.length) {
        return {
          proposals: "",
          lastViewed: "",
          interviewing: "",
          hires: ""
        };
      }
      const findValue = (label) => {
        const el = items.find(e => e.innerText.includes(label));
        return el?.querySelector(".value")?.innerText || "";
      };
      const proposals = findValue("Proposals");
      const lastViewed = findValue("Last viewed by client");
      const hires = findValue("Hires");
      const interviewing = findValue("Interviewing");

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
        hires: hires
      };
    }
  });

  return result;
}

// const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// async function scrapeWithRetry(tabId, maxRetries = 3) {
//   for (let i = 0; i < maxRetries; i++) {
//     try {
//       const result = await scrape(tabId);

//       if (result?.raw) {
//         return result;
//       }

//       console.log(`Retry ${i + 1}/${maxRetries}`);

//     } catch (e) {
//       console.error("Scrape retry error:", e);
//     }

//     await sleep(3000);
//   }

//   return {
//     raw: "",
//     minutes: 999999
//   };
// }
// --------------------
// CHECK ONE JOB
// --------------------
// async function checkJob(url) {
//   const tab = await chrome.tabs.create({ url, active: false });

//   try {
//     await waitTab(tab.id);
//     // const data = await scrapeWithRetry(tab.id);
//     // await new Promise(r => setTimeout(r, 20000));


//     const data = await scrape(tab.id);
    
//     if (data.proposals == "") {
//       await waitTab(tab.id);
//       await new Promise(r => setTimeout(r, 20000));
//       data = await scrape(tab.id);
//     }

//     await new Promise(r => setTimeout(r, 2000));
//     await sendLog({
//       url,
//       proposals: data.proposals,
//       lastViewed: data.lastViewed,
//       interviewing: data.interviewing,
//       hires: data.hires,
//     });

//   } finally {
//     chrome.tabs.remove(tab.id);
//   }
// }

async function checkJob(url) {
  let tab;

  try {
    tab = await chrome.tabs.create({ url, active: false });

    // ⏱ safety timeout so it never hangs forever
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("TIMEOUT")), 60000)
    );

    await Promise.race([waitTab(tab.id), timeout]);

    await new Promise(r => setTimeout(r, 8000));

    let data;
    try {
      data = await scrape(tab.id);
    } catch (e) {
      console.warn("Scrape failed:", url, e);
      data = {
        proposals: "",
        lastViewed: "",
        interviewing: "",
        hires: ""
      };
    }

    // 🧠 handle private / blocked job
    if (!data || (!data.proposals && !data.lastViewed)) {
      console.log("⚠️ any issue is arising:", url);

      await sendLog({
        url,
        proposals: "",
        lastViewed: "",
        interviewing: "",
        hires: ""
      });

      return; // skip but DO NOT crash loop
    }

    await sendLog({
      url,
      proposals: data.proposals,
      lastViewed: data.lastViewed,
      interviewing: data.interviewing,
      hires: data.hires
    });

  } catch (err) {
    console.error("❌ Job failed:", url, err);

    // still log failure so you don’t lose track
    await sendLog({
      url,
      proposals: "ERROR",
      lastViewed: "",
      interviewing: "",
      hires: ""
    });

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
  chrome.alarms.create(ALARM, { periodInMinutes: 0.2 });
});

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === ALARM) run();
});

chrome.alarms.create("upwork_tick", { periodInMinutes: 0.2 });

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "upwork_tick") run();
});