(() => {
  const $ = (s) => document.querySelector(s);

  // ------------------------------
  // Demo simulator (real UX change)
  // ------------------------------
  const demoBtn = $('#demoBtn');
  const badge = $('#demoBadge');
  const title = $('#demoTitle');
  const subtitle = $('#demoSubtitle');
  const log = $('#demoLog');
  const card = $('#demoCard');

  const scenarios = [
    { title:"Paste with secret", subtitle:"sk_live_********", decision:"BLOCK",  reason:"High-confidence secret detected" },
    { title:"Upload with PII",  subtitle:"customers.xlsx",   decision:"REVIEW", reason:"Likely PII columns detected" },
    { title:"Harmless request", subtitle:"Public article",   decision:"ALLOW",  reason:"No sensitive data detected" }
  ];

  let i = 0;
  if (demoBtn) {
    demoBtn.onclick = () => {
      const s = scenarios[i++ % scenarios.length];
      if (card) card.className = "card " + s.decision.toLowerCase();
      if (badge) badge.textContent = s.decision;
      if (title) title.textContent = s.title;
      if (subtitle) subtitle.textContent = s.subtitle;
      if (log) {
        log.innerHTML =
          `<div>OBSERVE → ${s.subtitle}</div>
           <div>DECIDE  → ${s.decision}</div>
           <div>WHY     → ${s.reason}</div>
           <div>ENFORCE → Applied locally</div>`;
      }
    };
  }

  // ------------------------------
  // Waitlist (no backend, frictionless)
  // - validates email
  // - stores locally
  // - opens mailto with prefilled subject/body
  // ------------------------------
  const form = $('#waitlistForm');
  const email = $('#waitlistEmail');
  const status = $('#waitlistStatus');
  const cta = $('#waitlistCTA');

  function isEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim());
  }

  function setStatus(msg, ok) {
    if (!status) return;
    status.textContent = msg || "";
    status.setAttribute("data-ok", ok ? "1" : "0");
  }

  function saveLocal(v) {
    try {
      const key = "kasbah_waitlist";
      const arr = JSON.parse(localStorage.getItem(key) || "[]");
      if (!arr.includes(v)) arr.push(v);
      localStorage.setItem(key, JSON.stringify(arr));
    } catch {}
  }

  function openMail(v) {
    const subject = encodeURIComponent("Kasbah — Early Access Request");
    const body = encodeURIComponent(
      `Email: ${v}\n\nUse-case (optional):\n- What AI tools?\n- What data risk?\n- What environment (personal / team / enterprise)?\n`
    );
    window.location.href = `mailto:hello@bekasbah.com?subject=${subject}&body=${body}`;
  }

  if (form && email) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = String(email.value || "").trim();

      if (!isEmail(v)) {
        setStatus("Enter a valid email.", false);
        email.focus();
        return;
      }

      saveLocal(v);
      setStatus("Saved. Opening your email client…", true);
      openMail(v);
    });
  }

  if (cta && email) {
    cta.addEventListener("click", () => {
      const v = String(email.value || "").trim();
      if (!isEmail(v)) {
        setStatus("Enter a valid email first.", false);
        email.focus();
        return;
      }
      saveLocal(v);
      setStatus("Saved. Opening your email client…", true);
      openMail(v);
    });
  }
})();
