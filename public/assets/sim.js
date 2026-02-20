(function () {
  // Make sure we never hide the page if something fails
  function $(id){ return document.getElementById(id); }

  // If your page uses different IDs, we don't crash.
  function safeSet(el, prop, val){ if(el) el[prop]=val; }

  function runSim() {
    var out = $('simOut');
    var pill = $('simPill');
    if (!out) return;

    out.classList.remove('hidden','ok','blocked');
    out.textContent = "Guard decided: REVIEW (simulated) — sensitive token detected.";
    out.classList.add('ok');

    safeSet(pill, 'textContent', 'Guard: active');
  }

  function boot(){
    var btn = $('simRun');
    if (btn) btn.addEventListener('click', runSim);

    // Beacon to prove sim.js executed
    var b = $('simBeacon');
    if (b) b.textContent = "SIM_JS_OK";
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
