/* Anfrage-Formular: Prüfung der Eingaben, Versand an die eigene Google-Web-App, Erfolgsanzeige.
   Kein Tracking, keine Cookies, nichts wird im Browser gespeichert. */
(function () {
  'use strict';

  // Adresse der Google-Web-App (Apps Script)
  var WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbzx_kRcqY1_DGJwblhI_2YF2bXnEIr5Gfj6nDIY3JmhVgL-CBiiW4u8mHE9-lbJE3xA/exec';
  // Eintrag im Blatt "Kuenstler", an dessen E-Mail die Anfragen gehen
  var KUENSTLER_ID = 'angebot';

  var form = document.getElementById('anfrage-form');
  if (!form) return;

  var f = {
    nachname: document.getElementById('f-nachname'),
    email: document.getElementById('f-email'),
    tel: document.getElementById('f-tel'),
    send: document.getElementById('f-send'),
    note: document.getElementById('f-note'),
    error: document.getElementById('f-error'),
    hEmail: document.getElementById('h-email'),
    hName: document.getElementById('h-nachname'),
    hTel: document.getElementById('h-tel'),
    ok: document.getElementById('anfrage-ok'),
    consent: document.getElementById('f-consent')
  };

  // ---------- Bot-Schutz (ohne Cookies, ohne Speicherung) ----------
  var LOADED_AT = Date.now();
  var MIN_FILL_MS = 4000;      // Menschen brauchen länger als 4 Sekunden
  var COOLDOWN_MS = 60000;     // höchstens 1 Anfrage pro Minute
  var MAX_PER_VISIT = 3;       // höchstens 3 Anfragen pro Seitenaufruf
  var sentCount = 0, lastSent = 0, sentEmails = {};

  // ---------- E-Mail prüfen ----------
  var EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+@([A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;

  // Häufige Tippfehler bei deutschen Anbietern
  var TYPOS = {
    'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmail.de': 'gmail.com', 'gamil.com': 'gmail.com',
    'gmail.co': 'gmail.com', 'gmail.con': 'gmail.com', 'gmx.dee': 'gmx.de', 'gmx.d': 'gmx.de', 'gmx.com.de': 'gmx.de',
    'yahooo.com': 'yahoo.com', 'yaho.com': 'yahoo.com', 'yahoo.dee': 'yahoo.de', 'yahoo.con': 'yahoo.com',
    'hotmial.com': 'hotmail.com', 'hotmail.de.de': 'hotmail.de', 'outlok.com': 'outlook.com', 'outlook.dee': 'outlook.de',
    'web.dee': 'web.de', 'wbe.de': 'web.de', 'weg.de': 'web.de', 't-onlien.de': 't-online.de', 't-onine.de': 't-online.de',
    'tonline.de': 't-online.de', 'icloud.co': 'icloud.com', 'iclod.com': 'icloud.com', 'freenet.dee': 'freenet.de'
  };

  var mx = { domain: '', state: 'idle' }; // idle | checking | ok | bad | unknown
  var mxTimer = null;

  function checkDomain(domain) {
    mx.domain = domain; mx.state = 'checking'; update();
    // Nur der Teil nach dem @ (z. B. "gmx.de") wird abgefragt, nie die ganze Adresse.
    var url = 'https://cloudflare-dns.com/dns-query?type=MX&name=' + encodeURIComponent(domain);
    var ctrl = ('AbortController' in window) ? new AbortController() : null;
    var t = setTimeout(function () { if (ctrl) ctrl.abort(); }, 4000);
    fetch(url, { headers: { accept: 'application/dns-json' }, signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        clearTimeout(t);
        if (mx.domain !== domain) return;
        var hasMx = d && d.Status === 0 && Array.isArray(d.Answer) && d.Answer.some(function (a) { return a.type === 15; });
        mx.state = hasMx ? 'ok' : (d && d.Status === 3 ? 'bad' : 'bad');
        update();
      })
      .catch(function () {
        clearTimeout(t);
        if (mx.domain !== domain) return;
        mx.state = 'unknown'; // Prüfung nicht möglich: nicht blockieren
        update();
      });
  }

  function emailStatus() {
    var v = f.email.value.trim();
    if (!v) return { valid: false, msg: '', cls: '' };
    if (!EMAIL_RE.test(v)) {
      return { valid: false, msg: 'Bitte eine vollständige E-Mail-Adresse eingeben, z. B. name@gmx.de', cls: 'bad' };
    }
    var domain = v.split('@')[1].toLowerCase();
    if (TYPOS[domain]) {
      return { valid: false, typo: v.split('@')[0] + '@' + TYPOS[domain], cls: 'bad' };
    }
    if (mx.domain !== domain) {
      clearTimeout(mxTimer);
      mxTimer = setTimeout(function () { checkDomain(domain); }, 400);
      return { valid: false, msg: 'E-Mail-Adresse wird geprüft …', cls: 'wait' };
    }
    if (mx.state === 'checking' || mx.state === 'idle') return { valid: false, msg: 'E-Mail-Adresse wird geprüft …', cls: 'wait' };
    if (mx.state === 'bad') return { valid: false, msg: 'An „' + domain + '“ kann man keine E-Mails schicken. Bitte Adresse prüfen.', cls: 'bad' };
    if (mx.state === 'ok') return { valid: true, msg: 'E-Mail-Adresse gefunden', cls: 'good' };
    return { valid: true, msg: '', cls: '' }; // unknown
  }

  function telStatus() {
    var v = f.tel.value.trim();
    if (!v) return { valid: true, msg: '' };
    var digits = v.replace(/[^\d]/g, '');
    if (!/^[+\d][\d\s\/()-]*$/.test(v) || digits.length < 6 || digits.length > 16) {
      return { valid: false, msg: 'Bitte eine gültige Telefonnummer eingeben oder das Feld leer lassen.' };
    }
    return { valid: true, msg: '' };
  }

  var touched = { nachname: false, email: false, tel: false };

  function setHint(el, input, msg, cls) {
    el.textContent = msg || '';
    el.className = 'hint' + (cls ? ' ' + cls : '');
    input.classList.toggle('is-bad', cls === 'bad');
    input.classList.toggle('is-good', cls === 'good');
    input.setAttribute('aria-invalid', cls === 'bad' ? 'true' : 'false');
  }

  function update() {
    var nameOk = f.nachname.value.trim().length >= 2;
    var em = emailStatus();
    var tel = telStatus();

    setHint(f.hName, f.nachname, touched.nachname && !nameOk ? 'Bitte Ihren Nachnamen eingeben.' : '', touched.nachname && !nameOk ? 'bad' : '');

    if (em.typo) {
      f.hEmail.innerHTML = '';
      f.hEmail.className = 'hint bad';
      f.hEmail.appendChild(document.createTextNode('Meinten Sie '));
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'typo'; b.textContent = em.typo;
      b.addEventListener('click', function () { f.email.value = em.typo; touched.email = true; update(); f.email.focus(); });
      f.hEmail.appendChild(b);
      f.hEmail.appendChild(document.createTextNode('?'));
      f.email.classList.add('is-bad');
    } else {
      var showEm = touched.email || em.cls === 'good' || em.cls === 'wait';
      setHint(f.hEmail, f.email, showEm ? em.msg : '', showEm ? em.cls : '');
    }

    setHint(f.hTel, f.tel, touched.tel ? tel.msg : '', touched.tel && !tel.valid ? 'bad' : '');

    var ready = nameOk && em.valid && tel.valid && f.consent.checked;
    f.send.disabled = !ready;
    var missing = [];
    if (!nameOk) missing.push('Nachname');
    if (!em.valid) missing.push(em.cls === 'wait' ? 'E-Mail wird geprüft' : 'gültige E-Mail-Adresse');
    if (!tel.valid) missing.push('gültige Telefonnummer');
    if (!f.consent.checked) missing.push('Häkchen beim Datenschutz');
    f.note.textContent = ready ? 'Alles bereit. Ein Klick genügt.' : 'Es fehlt noch: ' + missing.join(', ');
    f.note.classList.toggle('ready', ready);
    return ready;
  }

  ['input', 'change'].forEach(function (ev) {
    form.addEventListener(ev, function () { update(); });
  });
  // Fehler automatisch zeigen, sobald der Kunde kurz aufhört zu tippen
  var idle = {};
  [['nachname', f.nachname], ['email', f.email], ['tel', f.tel]].forEach(function (p) {
    p[1].addEventListener('input', function () {
      clearTimeout(idle[p[0]]);
      idle[p[0]] = setTimeout(function () {
        if (p[1].value.trim()) { touched[p[0]] = true; update(); }
      }, 700);
    });
  });
  f.nachname.addEventListener('blur', function () { touched.nachname = true; update(); });
  f.email.addEventListener('blur', function () { touched.email = true; update(); });
  f.tel.addEventListener('blur', function () { touched.tel = true; update(); });

  // ---------- Erfolgston: heller, glockenartiger Doppel-Ding (selbst erzeugt, nichts wird geladen) ----------
  function playChime() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      var ctx = new AC();
      var master = ctx.createGain();
      master.gain.value = 0.22;
      master.connect(ctx.destination);
      // Glocke = Grundton + zwei leise Obertöne, sehr kurzer Anschlag, weiches Ausklingen
      function ding(freq, start, len) {
        [[1, 1], [2.01, 0.28], [3.02, 0.08]].forEach(function (h) {
          var o = ctx.createOscillator(), g = ctx.createGain();
          o.type = 'sine';
          o.frequency.value = freq * h[0];
          var t0 = ctx.currentTime + start;
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(h[1], t0 + 0.006);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + len / h[0]);
          o.connect(g); g.connect(master);
          o.start(t0); o.stop(t0 + len + 0.05);
        });
      }
      ding(1174.66, 0, 0.55);    // D6
      ding(1567.98, 0.1, 0.9);   // G6, klingt länger nach
      setTimeout(function () { ctx.close(); }, 1500);
    } catch (e) { /* ohne Ton weiter */ }
  }

  function showError(msg) { f.error.hidden = false; f.error.textContent = msg; }

  // ---------- Absenden ----------
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    touched.nachname = touched.email = touched.tel = true;
    if (!update()) return;
    if (form.querySelector('[name="website"]').value) return; // Spam-Bot
    var now = Date.now();
    var mail = f.email.value.trim().toLowerCase();
    if (now - LOADED_AT < MIN_FILL_MS) return; // zu schnell ausgefüllt: sehr wahrscheinlich ein Bot
    if (sentEmails[mail]) { showError('Diese Anfrage wurde bereits gesendet. Wir melden uns bei Ihnen.'); return; }
    if (sentCount >= MAX_PER_VISIT) { showError('Sie haben bereits mehrere Anfragen gesendet. Bitte rufen Sie uns gern an.'); return; }
    if (now - lastSent < COOLDOWN_MS) { showError('Bitte warten Sie einen Moment, bevor Sie erneut senden.'); return; }

    f.error.hidden = true;
    f.send.disabled = true;
    f.send.classList.add('is-sending');
    f.send.textContent = 'Wird gesendet …';

    var vorname = (document.getElementById('f-vorname').value || '').trim();
    var nachname = f.nachname.value.trim();
    var msg = (document.getElementById('f-msg').value || '').trim();
    var tel = f.tel.value.trim();
    var text = (msg || '(keine Nachricht)') + (tel ? '\n\nTelefon: ' + tel : '');

    // Einfaches Formular-Format: keine Vorab-Anfrage (CORS) nötig
    var body = new URLSearchParams();
    body.append('kuenstler_id', KUENSTLER_ID);
    body.append('name', (vorname ? vorname + ' ' : '') + nachname);
    body.append('email', f.email.value.trim());
    body.append('nachricht', text);
    body.append('website', form.querySelector('[name="website"]').value);

    function fail() {
      f.send.classList.remove('is-sending');
      f.send.textContent = 'Anfrage senden';
      update();
      showError('Das geht leider gerade nicht. Bitte rufen Sie uns an oder versuchen Sie es erneut.');
    }

    fetch(WEBAPP_URL, { method: 'POST', body: body })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res && res.ok === true) { showSuccess(true); }
        else { if (window.console) console.warn('Web-App:', res); fail(); }
      })
      .catch(function (err) {
        if (window.console) console.warn('Web-App nicht erreichbar:', err);
        fail();
      });
  });

  // ---------- Konfetti (reines CSS/JS, nichts wird geladen oder gespeichert) ----------
  function confetti() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var colors = ['#1f8aa6', '#177a94', '#1c2536', '#f6c945', '#e76f51', '#2f855a', '#9b5de5'];
    var box = document.createElement('div');
    box.className = 'confetti';
    box.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < 140; i++) {
      var p = document.createElement('i');
      p.style.setProperty('--x', (Math.random() * 100).toFixed(2) + 'vw');
      p.style.setProperty('--drift', ((Math.random() - 0.5) * 30).toFixed(1) + 'vw');
      p.style.setProperty('--rot', Math.round(360 + Math.random() * 720) + 'deg');
      p.style.setProperty('--dur', (2.4 + Math.random() * 1.8).toFixed(2) + 's');
      p.style.setProperty('--delay', (Math.random() * 0.6).toFixed(2) + 's');
      p.style.setProperty('--c', colors[i % colors.length]);
      p.style.setProperty('--w', (6 + Math.random() * 6).toFixed(0) + 'px');
      if (i % 3 === 0) p.className = 'round';
      box.appendChild(p);
    }
    document.body.appendChild(box);
    setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 5200);
  }

  function showSuccess(withSound) {
    sentCount++; lastSent = Date.now(); sentEmails[f.email.value.trim().toLowerCase()] = true;
    f.send.classList.remove('is-sending');
    f.send.textContent = 'Anfrage senden';
    form.hidden = true;
    f.note.hidden = true;
    f.error.hidden = true;
    f.ok.hidden = false;
    f.ok.classList.add('play');
    f.ok.scrollIntoView({ behavior: 'smooth', block: 'center' });
    f.ok.focus({ preventScroll: true });
    confetti();
    if (withSound) playChime();
  }

  update();
})();
