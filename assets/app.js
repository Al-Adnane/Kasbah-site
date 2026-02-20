document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("demoBtn");
  const badge = document.getElementById("demoBadge");
  const title = document.getElementById("demoTitle");
  const subtitle = document.getElementById("demoSubtitle");
  const log = document.getElementById("demoLog");
  const card = document.getElementById("demoCard");

  const scenarios = [
    { title:"Paste with secret", subtitle:"sk_live_********", decision:"BLOCK",  reason:"High-confidence secret detected" },
    { title:"Upload with PII",  subtitle:"customers.xlsx",   decision:"REVIEW", reason:"Likely PII columns detected" },
    { title:"Harmless request", subtitle:"Public article",   decision:"ALLOW",  reason:"No sensitive data detected" }
  ];

  let i = 0;
  if (btn) btn.addEventListener("click", () => {
    const s = scenarios[i++ % scenarios.length];
    if (card) card.className = "card " + s.decision.toLowerCase();
    if (badge) badge.textContent = s.decision;
    if (title) title.textContent = s.title;
    if (subtitle) subtitle.textContent = s.subtitle;
    if (log) log.innerHTML = `OBSERVE → ${s.subtitle}<br>DECIDE → ${s.decision}<br>WHY → ${s.reason}<br>ENFORCE → Applied locally`;
  });
});
