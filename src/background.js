chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "openOptions") chrome.runtime.openOptionsPage();
});
