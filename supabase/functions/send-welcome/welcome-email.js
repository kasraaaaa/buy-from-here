// The welcome email every new shopper gets. Plain functions, no network code, so it can be previewed on its own.
// Palette: warm cream, sand and camel instead of the site's black and white.
const C = {
  page: '#F6EFE7',     // cream background
  card: '#FFFCF8',     // warm white card
  band: '#EADBCB',     // soft nude band
  accent: '#B08968',   // camel, buttons
  accentDark: '#8C6A4F',
  text: '#3B302A',     // warm espresso text
  muted: '#8A7B70',
  line: '#E7DACC',
};

const SITE = 'https://kasraaaaa.github.io/buy-from-here/';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function firstName(user) {
  const meta = (user && user.user_metadata) || {};
  const raw = meta.full_name || meta.name || '';
  const first = String(raw).trim().split(/\s+/)[0] || '';
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : '';
}

const step = (n, title, text) => `
          <tr>
            <td width="44" valign="top" style="padding:0 0 18px;">
              <div style="width:32px;height:32px;border-radius:16px;background:${C.band};color:${C.accentDark};font:600 14px/32px Helvetica,Arial,sans-serif;text-align:center;">${n}</div>
            </td>
            <td valign="top" style="padding:0 0 18px;font-family:Helvetica,Arial,sans-serif;">
              <p style="margin:0 0 2px;font-size:15px;font-weight:600;color:${C.text};">${title}</p>
              <p style="margin:0;font-size:14px;line-height:1.55;color:${C.muted};">${text}</p>
            </td>
          </tr>`;

export function welcomeEmail(user) {
  const name = firstName(user);
  const hello = name ? `Welcome, ${esc(name)}` : 'Welcome to Buy From Here';
  const subject = name ? `Welcome to Buy From Here, ${name}` : 'Welcome to Buy From Here';

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${C.page};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your account is ready. Save the pieces you love and follow the brands you like.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page};">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${C.card};border-radius:20px;overflow:hidden;border:1px solid ${C.line};">

        <tr><td style="padding:28px 36px 0;font-family:Helvetica,Arial,sans-serif;">
          <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:4px;text-transform:uppercase;color:${C.text};">Buy <span style="font-weight:400;color:${C.accent};">From</span> Here</p>
        </td></tr>

        <tr><td style="padding:28px 36px 8px;font-family:Helvetica,Arial,sans-serif;">
          <h1 style="margin:0 0 14px;font-family:Georgia,'Times New Roman',serif;font-size:30px;font-weight:400;line-height:1.2;color:${C.text};">${hello}</h1>
          <p style="margin:0;font-size:15px;line-height:1.65;color:${C.text};">Thanks for joining. Buy From Here gathers dresses, shoes, bags, jewelry and watches from brands we like, so you can browse them all in one place and keep track of what catches your eye.</p>
        </td></tr>

        <tr><td style="padding:24px 36px 6px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${
            step(1, 'Save what you love', 'Tap the heart on any piece and it waits for you under Saved, on any device.') +
            step(2, 'Follow brands and categories', 'New pieces from the brands and categories you follow show up under Following.') +
            step(3, 'Buy from the brand', 'When you\'re ready, tap Buy. You\'ll check out on the brand\'s own site, so payment, shipping and returns are all handled by them.')
          }
          </table>
        </td></tr>

        <tr><td align="center" style="padding:8px 36px 32px;">
          <a href="${SITE}" style="display:inline-block;background:${C.accent};color:#FFFFFF;text-decoration:none;font:600 15px Helvetica,Arial,sans-serif;padding:15px 34px;border-radius:28px;">Start browsing</a>
        </td></tr>

        <tr><td style="background:${C.band};padding:22px 36px;font-family:Helvetica,Arial,sans-serif;">
          <p style="margin:0;font-size:13px;line-height:1.6;color:${C.accentDark};">A small note: many of our links are affiliate links, so if you buy something we may earn a commission. It never changes your price.</p>
        </td></tr>

        <tr><td style="padding:22px 36px 28px;font-family:Helvetica,Arial,sans-serif;">
          <p style="margin:0 0 6px;font-size:12px;line-height:1.6;color:${C.muted};">You're getting this email because you created an account at Buy From Here. We'll only email you about your account.</p>
          <p style="margin:0;font-size:12px;line-height:1.6;color:${C.muted};"><a href="${SITE}" style="color:${C.muted};">Buy From Here</a> · <a href="${SITE}privacy.html" style="color:${C.muted};">Privacy</a> · Vancouver, Canada</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `${name ? 'Welcome, ' + name : 'Welcome to Buy From Here'}

Thanks for joining. Buy From Here gathers dresses, shoes, bags, jewelry and watches from brands we like, so you can browse them all in one place.

1. Save what you love: tap the heart on any piece and it waits for you under Saved.
2. Follow brands and categories: new pieces show up under Following.
3. Buy from the brand: tap Buy and check out on the brand's own site.

Start browsing: ${SITE}

Many of our links are affiliate links, so if you buy something we may earn a commission. It never changes your price.

You're getting this email because you created an account at Buy From Here.
Privacy: ${SITE}privacy.html`;

  return { subject, html, text };
}
