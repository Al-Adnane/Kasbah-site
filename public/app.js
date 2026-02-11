
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

  // Install prompt
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    document.body.classList.add('can-install');
    const hint = document.getElementById('installHint');
    if (hint) hint.textContent = 'Install is ready — click “Install Kasbah”.';
  });

  const install = async () => {
    if (!deferredPrompt) {
      const hint = document.getElementById('installHint');
      if (hint) hint.textContent = 'On iPhone Safari: Share → Add to Home Screen. On Desktop: look for “Install app” in the address bar.';
      return;
    }
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
  };

  ['btnInstall','btnInstall2'].forEach(id => {
    const b = document.getElementById(id);
    if (b) b.addEventListener('click', install);
  });

  // Demo scenarios (non-tech, story-first)
  const scenarios = {
    safe: {
      want: 'Summarize a PDF you uploaded',
      risk: 'Low',
      reason: 'Read-only action — no external side effects.'
    },
    sensitive: {
      want: 'Email a draft response to a client',
      risk: 'Medium',
      reason: 'Outbound action — you should approve wording before sending.'
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

  const setScenario = (k) => {
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
    hint.textContent = 'Click Allow or Block.';
    document.querySelectorAll('.tbtn').forEach(b => b.classList.toggle('active', b.dataset.s === k));
  };

  document.querySelectorAll('.tbtn').forEach(b => {
    b.addEventListener('click', () => setScenario(b.dataset.s));
  });

  allowBtn?.addEventListener('click', () => {
    if (used) {
      decisionEl.textContent = 'DENY (replay blocked)';
      liveTxt.textContent = 'blocked';
      hint.textContent = 'That approval was single-use. Replay prevented.';
      return;
    }
    used = true;
    decisionEl.textContent = 'ALLOW (single-use approval issued)';
    liveTxt.textContent = 'approved';
    hint.textContent = 'Approved once. Try clicking Allow again (replay proof).';
  });

  blockBtn?.addEventListener('click', () => {
    used = false;
    decisionEl.textContent = 'BLOCK';
    liveTxt.textContent = 'blocked';
    hint.textContent = 'Blocked. You can pick a new scenario.';
  });

  // Register SW
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(()=>{});
  }

  setScenario(current);
})();
