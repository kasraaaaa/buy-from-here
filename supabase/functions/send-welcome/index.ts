// Sends the welcome email to a new shopper. Called by a database trigger when an account is confirmed
// (Google sign-ups right away, email-link sign-ups when they first use the link).
// Protected by a shared secret in the private app_settings table. Sends each person at most one welcome email.
// Mail goes through Gmail SMTP for now; GMAIL_APP_PASSWORD is an Edge Function secret.
import { createClient } from 'npm:@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6.9.16';
import { welcomeEmail } from './welcome-email.js';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  const settings = await db.from('app_settings').select('key, value').in('key', ['welcome_secret', 'mail_from', 'mail_from_name']);
  const s: Record<string, string> = {};
  for (const r of settings.data || []) s[r.key] = r.value;
  if (!s.welcome_secret || req.headers.get('x-welcome-secret') !== s.welcome_secret) return json({ error: 'Not allowed' }, 401);

  const body = await req.json().catch(() => ({}));
  const userId = body && body.user_id;
  if (!userId) return json({ error: 'user_id is missing' }, 400);
  const force = !!body.force; // lets us resend a test to an existing account

  const u = await db.auth.admin.getUserById(userId);
  const user = u.data && u.data.user;
  if (!user || !user.email) return json({ error: 'No user with an email address' }, 404);

  // claim the send first, so two calls at once can't both send
  if (!force) {
    const claim = await db.from('welcome_emails').insert({ user_id: user.id, email: user.email }).select('user_id');
    if (claim.error) return json({ skipped: 'already welcomed' });
  }

  const pass = Deno.env.get('GMAIL_APP_PASSWORD');
  if (!pass) {
    await db.from('welcome_emails').update({ error: 'GMAIL_APP_PASSWORD secret is not set' }).eq('user_id', user.id);
    return json({ error: 'Mail password not set' }, 500);
  }
  const from = s.mail_from || 'kasra.rasoulian@gmail.com';
  const transport = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: from, pass } });
  const mail = welcomeEmail(user);
  try {
    await transport.sendMail({ from: `"${s.mail_from_name || 'Buy From Here'}" <${from}>`, to: user.email, subject: mail.subject, html: mail.html, text: mail.text });
    await db.from('welcome_emails').upsert({ user_id: user.id, email: user.email, sent_at: new Date().toISOString(), error: null });
    return json({ sent: user.email });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.from('welcome_emails').upsert({ user_id: user.id, email: user.email, sent_at: null, error: msg.slice(0, 500) });
    return json({ error: msg }, 500);
  }
});
