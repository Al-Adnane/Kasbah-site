export async function onRequestPost(context) {
  let body = {};
  try { body = await context.request.json(); } catch {}

  const confirm_token = (body.confirm_token || "").toString();

  if (!confirm_token) {
    return new Response(JSON.stringify({ ok: false, decision: "BLOCK", why: "Missing approval token." }), {
      status: 400, headers: { "Content-Type": "application/json" }
    });
  }

  const kv = context.env && context.env.KASBAH_WAITLIST;
  if (!kv) {
    return new Response(JSON.stringify({
      ok: true,
      decision: "ALLOW",
      why: "Approved. (KV not enabled — single-use enforcement is disabled in demo mode.)"
    }), { headers: { "Content-Type": "application/json" }});
  }

  const key = `confirm:${confirm_token}`;
  const raw = await kv.get(key);
  if (!raw) {
    return new Response(JSON.stringify({ ok: false, decision: "BLOCK", why: "Expired or unknown approval token." }), {
      status: 403, headers: { "Content-Type": "application/json" }
    });
  }

  const data = JSON.parse(raw);
  if (data.used) {
    return new Response(JSON.stringify({ ok: false, decision: "BLOCK", why: "Already approved once (replay blocked)." }), {
      status: 403, headers: { "Content-Type": "application/json" }
    });
  }

  data.used = true;
  await kv.put(key, JSON.stringify(data), { expirationTtl: 5*60 });

  return new Response(JSON.stringify({
    ok: true,
    decision: "ALLOW",
    why: "Approved. This one action can proceed."
  }), { headers: { "Content-Type": "application/json" }});
}
