(() => {
  // Never crash the page.
  try {
    const qs  = (s, el=document) => el.querySelector(s);
    const qsa = (s, el=document) => Array.from(el.querySelectorAll(s));

    // Your brand UX uses terminal lines (.tl) and sim buttons (.sim-btn).
    const buttons = qsa(".sim-btn");
    const lines   = qsa(".tl");
    const share   = qs(".sim-share");

    if (buttons.length === 0 || lines.length === 0) return;

    // Helper: show terminal lines with animation
    function showLines(block) {
      lines.forEach(l => l.classList.remove("visible"));
      // block is array of indices to show
      block.forEach((idx, i) => {
        const el = lines[idx];
        if (!el) return;
        setTimeout(() => el.classList.add("visible"), 60 * i);
      });
    }

    // Try to map buttons by text content
    const map = (btn) => (btn.textContent || "").toLowerCase();

    const scenarios = [
      {
        match: ["paste", "secret", "block"],
        lines: [0,1,2,3,4,5,6], // best-effort; adjust if you know exact ordering
        share: false
      },
      {
        match: ["upload", "review"],
        lines: [0,1,2,3,4,5,6],
        share: false
      },
      {
        match: ["allow", "safe"],
        lines: [0,1,2,3,4,5,6],
        share: false
      }
    ];

    function activate(btn) {
      buttons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      const t = map(btn);
      const s = scenarios.find(sc => sc.match.some(m => t.includes(m))) || scenarios[0];
      showLines(s.lines);

      if (share) {
        share.style.display = "none";
      }
    }

    buttons.forEach(btn => {
      btn.addEventListener("click", () => activate(btn));
    });

    // auto-run first scenario
    activate(buttons[0]);
  } catch (e) {
    // swallow errors so page never goes blank
    console && console.warn && console.warn("Kasbah sim disabled:", e);
  }
})();
