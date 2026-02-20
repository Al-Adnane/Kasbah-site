(function () {
  try {
    // do nothing destructive; only enhance if elements exist
    const btn = document.getElementById("simRun");
    const out = document.getElementById("simOut");
    const beacon = document.getElementById("simBeacon");
    if (beacon) beacon.textContent = "SIM_OK";
    if (btn && out) {
      btn.addEventListener("click", () => {
        out.classList.remove("hidden");
        out.textContent = "Guard decided: REVIEW (simulated).";
      });
    }
  } catch (e) {
    console && console.warn && console.warn("sim disabled:", e);
  }
})();
