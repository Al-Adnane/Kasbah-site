(() => {
  const $ = (s) => document.querySelector(s);

  const demoBtn = $('#demoBtn');
  const badge = $('#demoBadge');
  const title = $('#demoTitle');
  const subtitle = $('#demoSubtitle');
  const log = $('#demoLog');
  const card = $('#demoCard');

  if (!demoBtn || !badge || !title || !subtitle || !log || !card) return;

  const scenarios = [
    {decision:'BLOCK',  t:'Paste: secret detected',     s:'sk_live_********', why:'Secret-like pattern match',      enforce:'Redact or override'},
    {decision:'REVIEW', t:'Upload: PII suspected',      s:'customers.xlsx',   why:'PII-shaped columns detected',    enforce:'Ask purpose + scope'},
    {decision:'ALLOW',  t:'Harmless request',           s:'Public article',   why:'No sensitive signals found',     enforce:'Proceed + log'}
  ];
  let i = 0;

  const set = (x) => {
    badge.textContent = x.decision;
    title.textContent = x.t;
    subtitle.textContent = x.s;
    log.innerHTML =
      `<div>OBSERVE → ${x.s}</div>
       <div>DECIDE → ${x.decision}</div>
       <div>WHY → ${x.why}</div>
       <div>ENFORCE → ${x.enforce}</div>`;

    card.className = 'card';
    const d = x.decision.toLowerCase();
    if (d === 'allow') card.classList.add('allow');
    if (d === 'review') card.classList.add('review');
    if (d === 'block') card.classList.add('block');
  };

  demoBtn.addEventListener('click', () => set(scenarios[i++ % scenarios.length]));
})();
