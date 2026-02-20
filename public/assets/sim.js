(() => {
  const $ = (s) => document.querySelector(s);
  const demoBtn = $("#demoBtn");
  const badge = $("#demoBadge");
  const title = $("#demoTitle");
  const subtitle = $("#demoSubtitle");
  const log = $("#demoLog");
  const card = $("#demoCard");

  // If your UX uses different IDs, this won’t break anything; it just won’t run.
  if (!demoBtn || !badge || !title || !subtitle || !log || !card) return;

  const scenarios = [
    {decision:"BLOCK",  title:"Paste: secret detected", subtitle:"sk_live_********", reason:"Secret-like pattern", enforce:"Redact / require override"},
    {decision:"REVIEW", title:"Upload: PII suspected",  subtitle:"customers.xlsx",   reason:"PII-shaped fields",   enforce:"Ask purpose + scope"},
    {decision:"ALLOW",  title:"Safe request",           subtitle:"public content",   reason:"No sensitive signals",enforce:"Proceed + log"}
  ];
  let i = 0;

  function set(s) {
    badge.textContent = s.decision;
    title.textContent = s.title;
    subtitle.textContent = s.subtitle;
    log.innerHTML =
      `<div>OBSERVE → ${s.subtitle}</div>
       <div>DECIDE → ${s.decision}</div>
       <div>WHY → ${s.reason}</div>
       <div>ENFORCE → ${s.enforce}</div>`;
    card.className = "card";
    const d = s.decision.toLowerCase();
    if (d === "allow") card.classList.add("allow");
    if (d === "review") card.classList.add("review");
    if (d === "block") card.classList.add("block");
  }

  demoBtn.addEventListener("click", () => set(scenarios[i++ % scenarios.length]));
})();
