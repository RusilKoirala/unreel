importScripts("core.js");

const { addTime, grantExtra, normalize } = globalThis.Unreel;

// Tabs report time here so that their writes to the log happen one at a time.
let queue = Promise.resolve();
const updateLog = (change) => {
  queue = queue
    .then(async () => {
      const { time = {} } = await chrome.storage.local.get("time");
      await chrome.storage.local.set({ time: await change(time) });
    })
    .catch((err) => console.error("Unreel: couldn't save screen time", err));
};

chrome.runtime.onMessage.addListener((message, sender) => {
  switch (message?.type) {
    case "openOptions":
      chrome.runtime.openOptionsPage();
      break;
    case "time":
      updateLog((time) => addTime(time, new Date(), message.site, message.seconds));
      break;
    case "extraTime":
      updateLog(async (time) => {
        const { settings } = await chrome.storage.sync.get("settings");
        const limit = normalize(settings).limits[message.site];
        return grantExtra(time, new Date(), message.site, limit, message.seconds);
      });
      break;
    case "closeTab":
      if (sender.tab?.id) chrome.tabs.remove(sender.tab.id);
      break;
  }
});
