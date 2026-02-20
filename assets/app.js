(() => {
  const $ = (s) => document.querySelector(s);
  const demoBtn = $('#demoBtn');
  const card = $('#demoCard');
  const badge = $('#demoBadge');
  const title = $('#demoTitle');
  const subtitle = $('#demoSubtitle');
  const log = $('#demoLog');
  if (!demoBtn) return;

  const scenarios = [
    { t:"Paste: secret detected", i:"sk_live_********", d:"BLOCK", w:"Secret pattern match", e:"Require redact or override" },
    { t:"Upload: PII detected", i:"customers.xlsx", d:"REVIEW", w:"PII-shaped columns", e:"Require purpose + scope" },
    { t:"Harmless request", i:"Public article summary", d:"ALLOW", w:"No sensitive signals", e:"Proceed and log" }
  ];

  let n = 0;
  demoBtn.onclick = () => {
    const s = scenarios[n++ % scenarios.length];
    card.className = "card";
    card.classList.add("is-" + s.d.toLowerCase());
    badge.textContent = s.d;
    title.textContent = s.t;
    subtitle.textContent = s.i;
    log.innerHTML =
      `<div>OBSERVE → ${s.i}</div>
       <div>DECIDE → ${s.d}</div>
       <div>WHY → ${s.w}</div>
       <div>ENFORCE → ${s.e}</div>`;
  };
})();
