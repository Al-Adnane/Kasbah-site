(() => {
  // Smooth scroll
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      const el = document.querySelector(id);
      if (!el) return;
      e.preventDefault();
      el.scrollIntoView({behavior:'smooth', block:'start'});
    });
  });

  // PWA install
  let deferred = null;
  const installHint = () => document.getElementById('installHint');

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    const h = installHint();
    if (h) h.textContent = 'Install is ready — click “Install Kasbah”.';
  });

  async function doInstall(){
    if (!deferred) {
      const h = installHint();
      if (h) h.textContent = 'If you don’t see Install: iPhone Safari → Share → Add to Home Screen. Desktop Chrome → Install icon in the address bar.';
      return;
    }
    deferred.prompt();
    await deferred.userChoice;
    deferred = null;
  }

  ['btnInstall','btnInstall2','btnInstallTop'].forEach(id => {
    const b = document.getElementById(id);
    if (b) b.addEventListener('click', doInstall);
  });

  // Hero mini demo
  const heroWant = document.getElementById('heroWant');
  const heroRisk = document.getElementById('heroRisk');
  const heroWhy  = document.getElementById('heroWhy');
  const heroLive = document.getElementById('heroLive');
  const heroAllow= document.getElementById('heroAllow');
  const heroBlock= document.getElementById('heroBlock');

  let heroUsed = false;
  heroAllow?.addEventListener('click', () => {
    if (heroUsed) {
      heroLive.textContent = 'replay blocked';
      return;
    }
    heroUsed = true;
    heroLive.textContent = 'approved';
  });
  heroBlock?.addEventListener('click', () => {
    heroUsed = false;
    heroLive.textContent = 'blocked';
  });

  // Main demo scenarios
  const scenarios = {
    safe: {
      want: 'Summarize a PDF you uploaded',
      risk: 'Low',
      reason: 'Read-only action — no external side effects.'
    },
    sensitive: {
      want: 'Email a draft response to a client',
      risk: 'Medium',
      reason: 'Outbound action — approve wording before it goes out.'
    },
    risky: {
      want: 'Change billing details for Customer A',
      risk: 'High',
      reason: 'Financial + identity impact. Requires explicit approval.'
    }
  };

  const wantEl = document.getElementById('want');
  const riskEl = document.getElementById('risk');
  const whyEl  = document.getElementById('why');
  const decisionEl = document.getElementById('decision');
  const liveTxt = document.getElementById('liveTxt');
  const allowBtn = document.getElementById('allow');
  const blockBtn = document.getElementById('block');
  const hint = document.getElementById('hint');

  let used = false;
  let current = 'sensitive';

  function setScenario(k){
    current = k;
    used = false;
    const s = scenarios[k];
    wantEl.textContent = s.want;
    riskEl.textContent = s.risk;
    whyEl.textContent  = s.reason;
    decisionEl.textContent = 'Needs your decision';
    liveTxt.textContent = 'waiting';
    allowBtn.disabled = false;
    blockBtn.disabled = false;
    hint.textContent = 'Click Allow, then click Allow again to see replay protection (demo).';
    document.querySelectorAll('.tbtn').forEach(b => b.classList.toggle('active', b.dataset.s === k));
  }

  document.querySelectorAll('.tbtn').forEach(b => b.addEventListener('click', () => setScenario(b.dataset.s)));

  allowBtn?.addEventListener('click', () => {
    if (used) {
      decisionEl.textContent = 'DENY (replay blocked)';
      liveTxt.textContent = 'blocked';
      hint.textContent = 'Single-use approval. Second attempt is rejected (replay protection).';
      return;
    }
    used = true;
    decisionEl.textContent = 'ALLOW (single-use approval issued)';
    liveTxt.textContent = 'approved';
  });

  blockBtn?.addEventListener('click', () => {
    used = false;
    decisionEl.textContent = 'BLOCK';
    liveTxt.textContent = 'blocked';
  });

  setScenario(current);

  // Minimal SW register if you add sw.js later
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(()=>{});
  }
})();
