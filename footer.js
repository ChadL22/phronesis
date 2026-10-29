// Footer newsletter sign-up (every page). Uses the same Worker endpoints as
// the Newsletter & Socials page: /api/subscribe and /api/unsubscribe.
(function () {
  var API = 'https://phronesis.sclanga315.workers.dev/api';
  var input = document.getElementById('footEmail');
  var join = document.getElementById('footSubscribe');
  var leave = document.getElementById('footUnsubscribe');
  var status = document.getElementById('footStatus');
  if (!input || !join || !leave || !status) return;

  function show(msg, ok) { status.textContent = msg; status.className = 'site-foot-status ' + (ok ? 'is-ok' : 'is-err'); }
  function valid(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

  function send(path, btn, busy) {
    var email = input.value.trim();
    if (!valid(email)) { show('Please enter a valid email address.', false); input.focus(); return; }
    if (path === '/unsubscribe' && !confirm('Unsubscribe ' + email + ' from The Phronesis Brief?')) return;
    var label = btn.textContent;
    btn.disabled = true; btn.textContent = busy;
    fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email }) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (x) { show(x.d.message || x.d.error || 'Done.', x.ok); if (x.ok) input.value = ''; })
      .catch(function () { show('Network error. Please try again.', false); })
      .then(function () { btn.disabled = false; btn.textContent = label; });
  }
  join.addEventListener('click', function () { send('/subscribe', join, 'Subscribing…'); });
  leave.addEventListener('click', function () { send('/unsubscribe', leave, 'Removing…'); });
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); send('/subscribe', join, 'Subscribing…'); } });
})();
