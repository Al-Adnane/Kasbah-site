/**
 * Kasbah Guard — Email Utilities
 * 
 * Email sending via Resend API:
 * - Verification emails
 * - Password reset emails
 * - Notification emails
 */

async function sendVerificationEmail(env, email, name, code) {
  if (!env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY not set — skipping email');
    return false;
  }

  const html = buildVerificationEmailHTML(name, code);

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Kasbah <yo@bekasbah.com>',
        to: [email],
        subject: 'Verify your Kasbah account',
        html: html,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error('Resend error:', res.status, errBody);
      return false;
    }
    return true;
  } catch (e) {
    console.error('Email send failed:', e.message);
    return false;
  }
}

function buildVerificationEmailHTML(name, code) {
  const displayName = name || 'there';
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f1ed;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ed;padding:40px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.06);">
        <!-- Header -->
        <tr><td style="background:#0F172A;padding:32px 40px;text-align:center;">
          <div style="font-size:22px;font-weight:900;color:#ffffff;letter-spacing:-0.02em;">
            Kasbah<span style="color:#C1440E;">Guard</span>
          </div>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:40px;">
          <p style="font-size:16px;color:#0F172A;margin:0 0 8px;font-weight:700;">
            Hi ${displayName},
          </p>
          <p style="font-size:14px;color:#64748B;margin:0 0 28px;line-height:1.6;">
            Welcome to Kasbah. Enter the code below to verify your email and activate your account.
          </p>
          <!-- Code box -->
          <div style="background:#F8F5F1;border:2px solid #E2DDD7;border-radius:12px;padding:24px;text-align:center;margin:0 0 28px;">
            <div style="font-size:36px;font-weight:900;letter-spacing:0.3em;color:#0F172A;font-family:'Courier New',monospace;">
              ${code}
            </div>
            <div style="font-size:12px;color:#94A3B8;margin-top:8px;">
              This code expires in 1 hour
            </div>
          </div>
          <p style="font-size:13px;color:#64748B;margin:0 0 12px;line-height:1.6;">
            Enter this code on <a href="https://bekasbah.com/#signup" style="color:#C1440E;font-weight:700;text-decoration:none;">bekasbah.com</a> to complete your registration.
          </p>
          <p style="font-size:13px;color:#94A3B8;margin:0;line-height:1.6;">
            If you didn't create a Kasbah account, you can safely ignore this email.
          </p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#F8F5F1;padding:20px 40px;text-align:center;border-top:1px solid #E2DDD7;">
          <p style="font-size:11px;color:#94A3B8;margin:0;">
            Kasbah &mdash; Guard-grade protection for AI tools<br>
            <a href="https://bekasbah.com" style="color:#C1440E;text-decoration:none;">bekasbah.com</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

module.exports = {
  sendVerificationEmail,
  buildVerificationEmailHTML,
};
