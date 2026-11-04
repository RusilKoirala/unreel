const demo = document.getElementById("demo");
const demoSwitch = document.getElementById("demo-switch");
const demoLabel = document.getElementById("demo-label");
demoSwitch.addEventListener("change", () => {
  demo.dataset.on = String(demoSwitch.checked);
  demoLabel.textContent = demoSwitch.checked ? "Unreel is on" : "Unreel is off";
});

// Chrome blocks web links to chrome:// pages, so copying is the shortest route.
document.querySelectorAll(".copy").forEach((button) => {
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
      button.textContent = "Copied";
    } catch {
      button.textContent = "Select it";
      const range = document.createRange();
      range.selectNodeContents(button.previousElementSibling);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    }
    setTimeout(() => { button.textContent = "Copy"; }, 1800);
  });
});

// The zip downloads from this click, so take people straight to the next step.
document.getElementById("hero-download").addEventListener("click", () => {
  setTimeout(() => document.getElementById("unzip").scrollIntoView(), 400);
});
