// Public settings. The Supabase publishable key is safe to expose: row-level security protects the data.
window.BFH_CONFIG = {
  supabaseUrl: 'https://uaahjqlenzdztqcqjksb.supabase.co',
  supabaseKey: 'sb_publishable_7NFjA9i4kP6axN9F5U0iTA_Mq43hqNa',
  cloudinaryCloud: 'zpxojdqe',
  cloudinaryFolder: 'buy-from-here',
  // Resize brands' photos through Cloudinary's fetch delivery. If Cloudinary refuses, the page falls back to the original photo.
  cloudinaryFetch: true
};
window.bfhDb = window.supabase.createClient(window.BFH_CONFIG.supabaseUrl, window.BFH_CONFIG.supabaseKey);

// Cloudinary delivery helper: resize/crop on the fly.
// Lesson from Pin NOT Terest: g_auto without a crop mode is rejected, so gravity is only added with a crop.
window.bfhImg = function (url, opts) {
  if (!url) return url;
  opts = opts || {};
  var t = ['f_auto', 'q_auto'];
  if (opts.w) t.push('w_' + opts.w);
  if (opts.h) t.push('h_' + opts.h);
  if (opts.crop) t.push('c_' + opts.crop);
  if (opts.gravity && opts.crop) t.push('g_' + opts.gravity);
  var tx = t.join(',');
  if (url.indexOf('res.cloudinary.com/') > -1 && url.indexOf('/image/upload/') > -1) {
    return url.replace('/image/upload/', '/image/upload/' + tx + '/');
  }
  if (window.BFH_CONFIG.cloudinaryFetch && /^https?:\/\//.test(url)) {
    return 'https://res.cloudinary.com/' + window.BFH_CONFIG.cloudinaryCloud + '/image/fetch/' + tx + '/' + encodeURIComponent(url);
  }
  return url;
};

// Friendly sign-in email errors + a short wait so repeated taps don't burn the email allowance.
window.bfhEmailLink = async function (db, email, redirect, msgEl, btn) {
  var key = 'bfh_last_link_' + email.toLowerCase();
  var last = 0; try { last = Number(localStorage.getItem(key) || 0); } catch (e) {}
  var wait = 60 - Math.floor((Date.now() - last) / 1000);
  if (wait > 0) { msgEl.textContent = 'We just sent a link to ' + email + '. Check your inbox and spam folder. You can ask for a new one in ' + wait + ' seconds.'; return; }
  msgEl.textContent = 'Sending…';
  if (btn) btn.disabled = true;
  var r = await db.auth.signInWithOtp({ email: email, options: { emailRedirectTo: redirect } });
  if (btn) setTimeout(function () { btn.disabled = false; }, 3000);
  if (!r.error) {
    try { localStorage.setItem(key, String(Date.now())); localStorage.setItem('bfh_last_email', email); } catch (e) {}
    msgEl.textContent = 'Check your email for the sign-in link (and your spam folder). The link works once. If it opens in a new tab, you can close this one.';
    return;
  }
  var m = (r.error.message || '').toLowerCase();
  if (r.error.status === 429 || m.indexOf('rate limit') > -1) {
    msgEl.textContent = 'Too many sign-in emails have gone out in the last hour. Please try again in a little while, or use Continue with Google.';
  } else if (m.indexOf('invalid') > -1 && m.indexOf('email') > -1) {
    msgEl.textContent = 'That email address doesn’t look right. Please check it.';
  } else {
    msgEl.textContent = 'We couldn’t send the link right now. Please try again in a minute.';
  }
};

// "Welcome back Name 👋🏻" — a 2-second banner at the top, once per visit.
window.bfhWelcome = function (user) {
  if (!user) return;
  var key = 'bfh_welcomed_' + user.id;
  try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch (e) {}
  var meta = user.user_metadata || {};
  var name = meta.full_name || meta.name || (user.email || '').split('@')[0];
  name = String(name || '').trim().split(/[\s._-]+/)[0] || '';
  if (name) name = name.charAt(0).toUpperCase() + name.slice(1);
  var el = document.createElement('div');
  el.className = 'welcome-pop';
  el.setAttribute('role', 'status');
  el.textContent = name ? 'Welcome back ' + name + ' ' : 'Welcome back ';
  var wave = document.createElement('span');
  wave.className = 'wave';
  wave.setAttribute('aria-hidden', 'true');
  wave.textContent = '👋🏻';
  el.appendChild(wave);
  document.body.appendChild(el);
  requestAnimationFrame(function () { el.classList.add('in'); });
  setTimeout(function () { el.classList.remove('in'); }, 2200);
  setTimeout(function () { el.remove(); }, 2600);
};

// Fill in the email last used on this device, so people don't retype it.
window.bfhPrefillEmail = function (input) {
  if (!input || input.value) return;
  try { var e = localStorage.getItem('bfh_last_email'); if (e) input.value = e; } catch (err) {}
};
