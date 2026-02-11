const $ = (id) => document.getElementById(id);

function setHero(meta, want, decision, why, ok){
  $("hpMeta").textContent = meta;
  $("hpWant").textContent = want || "—";
  $("hpDecision").textContent = decision || "—";
  $("hpWhy").textContent = why || "—";
  $("hpDecision").classList.remove("ok","bad");
  if (ok === true) $("hpDecision").classList.add("ok");
  if (ok === false) $("hpDecision").classList.add("bad");
}

async function postJSON(path, body){
  const res = await fetch(path, {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify(body || {})
  });
  const txt = await res.text();
  let data = {};
  try { data = JSON.parse(txt); } catch { data = { raw: txt }; }
  if(!res.ok) throw Object.assign(new Error("Request failed"), { status: res.status, data });
  return data;
}

let last = null;

async function runScenario(scenario){
  $("btnBlock").disabled = true;
  $("btnConfirm").disabled = true;
  setHero("checking…", "AI is asking permission…", "…", "Kasbah is evaluating.", null);

  const data = await postJSON("/api/demo", { scenario });
  last = data;

  const ok = data.decision === "ALLOW";
  setHero("result", data.want || "—", ok ? "ALLOW" : "BLOCK", data.why || "—", ok);

  $("btnBlock").disabled = false;
  $("btnConfirm").disabled = !ok;

  $("hpHint").textContent = ok
    ? "Click “Allow” to approve this one action. That’s the whole hook."
    : "Blocked. The AI can’t proceed unless the request changes.";
}

async function confirm(){
  if(!last || !last.confirm_token) return;
  $("btnConfirm").disabled = true;
  try{
    const data = await postJSON("/api/consume", { confirm_token: last.confirm_token });
    setHero("approved", last.want, "ALLOWED (approved)", data.why || "Approved.", true);
    $("hpHint").textContent = "Approved. In a real workflow, the tool executes only after this.";
  }catch{
    setHero("error", last?.want || "—", "ERROR", "Please try again.", false);
  }
}

function reset(){
  last = null;
  setHero("ready", "—", "—", "—", null);
  $("btnConfirm").disabled = true;
  $("btnBlock").disabled = true;
  $("hpHint").textContent = "Pick a scenario below to see Kasbah in action.";
}

function msg(el, text, ok=true){
  el.textContent = text;
  el.style.color = ok ? "var(--accent)" : "var(--danger)";
}

$("btnTryDemo").addEventListener("click", ()=> document.getElementById("demo").scrollIntoView({behavior:"smooth"}));
$("btnJoinUpdates").addEventListener("click", ()=> document.getElementById("updatesForm").scrollIntoView({behavior:"smooth"}));
$("btnTopDev").addEventListener("click", ()=> document.getElementById("dev").scrollIntoView({behavior:"smooth"}));

document.querySelectorAll(".scenario").forEach(btn=>{
  btn.addEventListener("click", ()=> runScenario(btn.dataset.scenario));
});

$("btnConfirm").addEventListener("click", confirm);
$("btnBlock").addEventListener("click", reset);

$("updatesForm").addEventListener("submit", async (e)=>{
  e.preventDefault();
  const email = $("updatesEmail").value.trim();
  const out = $("updatesMsg");
  msg(out, "Sending…", true);
  try{
    await postJSON("/api/join", { role: "updates", email });
    msg(out, "Done. You’ll get an email when Kasbah is ready.", true);
    $("updatesEmail").value = "";
  }catch{
    msg(out, "Could not submit right now. Try again in a minute.", false);
  }
});

$("devForm").addEventListener("submit", async (e)=>{
  e.preventDefault();
  const out = $("devMsg");
  msg(out, "Sending…", true);
  const email = $("devEmail").value.trim();
  const use_case = $("devUse").value.trim();
  const stack = $("devStack").value.trim();
  try{
    await postJSON("/api/join", { role: "developer", email, use_case, stack });
    msg(out, "Request received. You’ll get priority dev access.", true);
    $("devEmail").value = "";
    $("devUse").value = "";
    $("devStack").value = "";
  }catch{
    msg(out, "Could not submit right now. Try again in a minute.", false);
  }
});

reset();
