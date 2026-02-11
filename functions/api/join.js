export async function onRequestPost(context) {
  const { request, env } = context;

  let body = {};
  try { body = await request.json(); } catch {}
  const role = (body.role || "updates").toString();
  const email = (body.email || "").toString().trim().toLowerCase();
  const use_case = (body.use_case || "").toString().trim();
  const stack = (body.stack || "").toString().trim();

  if (!email || !email.includes("@") || email.length > 254) {
    return new Response(JSON.stringify({ ok: false, error: "invalid_email" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (env && env.KASBAH_WAITLIST) {
    const key = `join:${role}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
    const value = JSON.stringify({
      role, email, use_case, stack,
      ts: new Date().toISOString(),
      ua: request.headers.get("User-Agent") || ""
    });
    try { await env.KASBAH_WAITLIST.put(key, value); } catch {}
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
}
