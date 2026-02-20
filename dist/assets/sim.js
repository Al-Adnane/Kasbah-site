(() => {
  // SAFE: never break rendering
  try {
    const qs  = (s, el=document) => el.querySelector(s);
    const qsa = (s, el=document) => Array.from(el.querySelectorAll(s));

    // Try to wire to your brand UX simulator if present
    const buttons = qsa(".sim-btn");
    const lines   = qsa(".tl");
    if (buttons.length && lines.length) {
      function showAll() {
        lines.forEach((l,i)=>setTimeout(()=>l.classList.add("visible"), 60*i));
      }
      function reset() { lines.forEach(l=>l.classList.remove("visible")); }

      buttons.forEach(btn => btn.addEventListener("click", () => { reset(); showAll(); }));
      // auto-run once
      reset(); showAll();
      return;
    }

    // If not present, do nothing (don’t crash)
  } catch(e) {
    console && console.warn && console.warn("sim.js safe-disable:", e);
  }
})();
