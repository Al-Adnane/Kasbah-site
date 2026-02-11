function token() {
  return `c.${Date.now().toString(16)}.${Math.random().toString(16).slice(2)}`;
}

const SCENARIOS = {
  safe: {
    want: "Read a file you uploaded and summarize it.",
    decision: "ALLOW",
    why: "This stays within your workspace and doesn’t share data externally."
  },
  sensitive: {
    want: "Open a link and extract information.",
    decision: "ALLOW",
    why: "Allowed with limits: Kasbah reduces risk and blocks unsafe follow-up actions."
  },
  risky: {
    want: "Send your private data to an external website.",
    decision: "BLOCK",
    why: "Blocked: sharing private data externally is high-risk without explicit, informed consent."
  }
};

export async function onRequestPost(context) {
  let body = {};
  try { body = await context.request.json(); } catch {}

  const scenario = (body.scenario || "safe").toString();
  const s = SCENARIOS[scenario] || SCENARIOS.safe;

  const confirm_token = (s.decision === "ALLOW") ? token() : null;

  if (confirm_token && context.env && context.env.KASBAH_WAITLIST) {
    try {
      await context.env.KASBAH_WAITLIST.put(`confirm:${confirm_token}`, JSON.stringify({
        used: false,
        exp: Date.now() + 5*60*1000,
        scenario
      }), { expirationTtl: 5*60 });
    } catch {}
  }

  return new Response(JSON.stringify({
    ok: true,
    scenario,
    want: s.want,
    decision: s.decision,
    why: s.why,
    confirm_token
  }), { headers: { "Content-Type": "application/json" }});
}
