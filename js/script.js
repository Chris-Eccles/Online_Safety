// Keep the footer copyright year current automatically
(function () {
  var y = document.getElementById('footerYear');
  if (y) y.textContent = new Date().getFullYear();
})();

/* ============================================================
   SITE OFFLINE GATE — every page carrying class="or-gate" on
   <html> starts invisible (see the inline <style> in each page's
   <head>, which hides it before this file even loads, so there's
   no flash of content). This checks admin.html's "site offline"
   toggle and either reveals the page or sends it to /404.html.
   A short timeout reveals the page anyway if the check is slow or
   fails, so a network hiccup can't leave visitors looking at a
   blank page.
   ============================================================ */
(function(){
  var html = document.documentElement;
  if(!html.classList.contains('or-gate')) return;
  var decided = false;
  function reveal(){
    if(decided) return;
    decided = true;
    html.classList.remove('or-gate');
  }
  var safetyTimer = setTimeout(reveal, 1500);
  fetch('/api/site-status').then(function(r){ return r.json(); }).then(function(data){
    clearTimeout(safetyTimer);
    if(decided) return;
    if(data && data.siteOffline){
      decided = true;
      window.location.replace('/404.html');
    } else {
      reveal();
    }
  }).catch(function(){ clearTimeout(safetyTimer); reveal(); });
})();

// Readiness meter — fills through all 7 module colours to 100% on load.
// Purely decorative; respects reduced-motion preference.
(function () {
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var segs = document.querySelectorAll('.seg');
  var legendItems = document.querySelectorAll('#meterLegend li');
  var pctEl = document.getElementById('meterPct');
  var labelEl = document.getElementById('meterLabel');
  var total = segs.length;

  function setPct(n) {
    if (pctEl) pctEl.textContent = Math.round((n / total) * 100) + '%';
  }

  if (reduceMotion) {
    segs.forEach(function (s) { s.classList.add('done'); });
    legendItems.forEach(function (li) { li.classList.add('lit'); });
    setPct(total);
    if (labelEl) { labelEl.textContent = '100% ready'; labelEl.classList.add('ready'); }
    return;
  }

  segs.forEach(function (seg, i) {
    setTimeout(function () {
      seg.classList.add('done');
      if (legendItems[i]) legendItems[i].classList.add('lit');
      setPct(i + 1);
      if (i === total - 1 && labelEl) {
        setTimeout(function () {
          labelEl.textContent = '100% ready';
          labelEl.classList.add('ready');
        }, 250);
      }
    }, 500 + i * 260);
  });
})();

(function(){
  var toggle=document.getElementById('navToggle');
  var nav=document.getElementById('siteNav');
  if(!toggle||!nav) return;
  toggle.addEventListener('click', function(){
    var open = nav.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  nav.addEventListener('click', function(e){
    if(e.target.tagName==='A'){
      nav.classList.remove('is-open');
      toggle.setAttribute('aria-expanded','false');
    }
  });
  document.addEventListener('click', function(e){
    if(nav.classList.contains('is-open') && !nav.contains(e.target) && e.target!==toggle && !toggle.contains(e.target)){
      nav.classList.remove('is-open');
      toggle.setAttribute('aria-expanded','false');
    }
  });
  document.addEventListener('keydown', function(e){
    if(e.key==='Escape' && nav.classList.contains('is-open')){
      nav.classList.remove('is-open');
      toggle.setAttribute('aria-expanded','false');
      toggle.focus();
    }
  });
})();

/* ============================================================
   CONTACT BOX — a themed in-page message box instead of a bare
   mailto: link, which used to just dump people out to whatever
   desktop mail app they had (or nothing, on a school Chromebook
   with no mail client set up at all). Shared across every page
   via this one file, so every "Contact us" link site-wide gets
   intercepted and rewired automatically.
   ============================================================ */
(function(){
  var css = '' +
    '#oready-contact-overlay{display:none;position:fixed;inset:0;background:rgba(5,8,20,0.78);backdrop-filter:blur(4px);z-index:10001;align-items:center;justify-content:center;padding:20px;}' +
    '#oready-contact-overlay.show{display:flex;}' +
    '#oready-contact-box{background:var(--bg-2,#0D1230);border:1px solid var(--border,rgba(255,255,255,.11));border-radius:var(--radius,18px);padding:30px;max-width:420px;width:100%;box-shadow:0 30px 80px -20px rgba(0,0,0,.6);font-family:var(--font-body,sans-serif);}' +
    '#oready-contact-box h3{font-family:var(--font-display,sans-serif);font-size:20px;color:var(--text,#fff);margin:0 0 6px;}' +
    '#oready-contact-box p.sub{color:var(--text-soft,#9AA6B8);font-size:13.5px;margin:0 0 20px;}' +
    '#oready-contact-box label{display:block;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--text-faint,#8892a8);margin:14px 0 6px;}' +
    '#oready-contact-box input,#oready-contact-box textarea{width:100%;box-sizing:border-box;padding:11px 13px;border-radius:10px;border:1px solid var(--border,rgba(255,255,255,.11));background:rgba(255,255,255,.04);color:var(--text,#fff);font-family:var(--font-body,sans-serif);font-size:14px;resize:vertical;}' +
    '#oready-contact-box input:focus,#oready-contact-box textarea:focus{outline:2px solid var(--brand,#34D399);outline-offset:1px;}' +
    '#oready-contact-box textarea{min-height:90px;}' +
    '#oready-contact-actions{display:flex;gap:10px;margin-top:20px;}' +
    '#oready-contact-actions button{flex:1;padding:11px;border-radius:50px;font-weight:800;font-size:14px;cursor:pointer;font-family:var(--font-body,sans-serif);}' +
    '#oready-contact-cancel{background:transparent;border:1px solid var(--border,rgba(255,255,255,.11));color:var(--text-soft,#9AA6B8);}' +
    '#oready-contact-send{background:var(--brand,#34D399);border:none;color:#06241f;}' +
    '#oready-contact-send:disabled{opacity:.6;cursor:default;}' +
    '#oready-contact-err{color:#F87171;font-size:12.5px;margin-top:10px;min-height:16px;}' +
    '#oready-contact-success{display:none;text-align:center;padding:10px 0 4px;}' +
    '#oready-contact-success.show{display:block;}' +
    '#oready-contact-success .tick{width:46px;height:46px;border-radius:50%;background:rgba(52,211,153,.14);border:1.5px solid var(--brand,#34D399);display:flex;align-items:center;justify-content:center;margin:0 auto 14px;font-size:22px;color:var(--brand,#34D399);}' +
    '';
  var styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  var overlayHtml = '' +
    '<div id="oready-contact-overlay">' +
      '<div id="oready-contact-box">' +
        '<div id="oready-contact-form-wrap">' +
          '<h3>Get in touch</h3>' +
          '<p class="sub">Questions, a problem with your order, anything — we read every message.</p>' +
          '<label for="oready-contact-name">Your name</label>' +
          '<input type="text" id="oready-contact-name" autocomplete="name">' +
          '<label for="oready-contact-email">Your email</label>' +
          '<input type="email" id="oready-contact-email" autocomplete="email">' +
          '<label for="oready-contact-message">Message</label>' +
          '<textarea id="oready-contact-message"></textarea>' +
          '<p style="font-size:11px;color:var(--text-faint,#8892a8);margin:8px 0 0;">We\'ll only use this to reply to you — see our <a href="/privacy" style="color:var(--brand,#34D399);">privacy policy</a>.</p>' +
          '<div id="oready-contact-err"></div>' +
          '<div id="oready-contact-actions">' +
            '<button type="button" id="oready-contact-cancel">Cancel</button>' +
            '<button type="button" id="oready-contact-send">Send message</button>' +
          '</div>' +
        '</div>' +
        '<div id="oready-contact-success">' +
          '<div class="tick">&#10003;</div>' +
          '<h3 style="text-align:center;">Message sent</h3>' +
          '<p class="sub" style="text-align:center;">Thanks — we will reply by email shortly.</p>' +
          '<div id="oready-contact-actions"><button type="button" id="oready-contact-close" style="flex:1;background:var(--brand,#34D399);border:none;color:#06241f;padding:11px;border-radius:50px;font-weight:800;font-size:14px;cursor:pointer;">Close</button></div>' +
        '</div>' +
      '</div>' +
    '</div>';
  document.body.insertAdjacentHTML('beforeend', overlayHtml);

  var overlay = document.getElementById('oready-contact-overlay');
  var formWrap = document.getElementById('oready-contact-form-wrap');
  var successWrap = document.getElementById('oready-contact-success');
  var errEl = document.getElementById('oready-contact-err');

  function openContact(){
    formWrap.style.display='';
    successWrap.classList.remove('show');
    errEl.textContent='';
    overlay.classList.add('show');
  }
  function closeContact(){
    overlay.classList.remove('show');
  }
  document.getElementById('oready-contact-cancel').addEventListener('click', closeContact);
  document.getElementById('oready-contact-close').addEventListener('click', closeContact);
  overlay.addEventListener('click', function(e){ if(e.target===overlay) closeContact(); });
  document.addEventListener('keydown', function(e){ if(e.key==='Escape' && overlay.classList.contains('show')) closeContact(); });

  document.getElementById('oready-contact-send').addEventListener('click', async function(){
    var name = document.getElementById('oready-contact-name').value.trim();
    var email = document.getElementById('oready-contact-email').value.trim();
    var message = document.getElementById('oready-contact-message').value.trim();
    if(!name || !email || !message){ errEl.textContent='Please fill in every field.'; return; }
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ errEl.textContent="That email address doesn't look right."; return; }
    var btn=this;
    btn.disabled=true; btn.textContent='Sending…'; errEl.textContent='';
    try{
      var res = await fetch('/api/contact', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({name:name, email:email, message:message})
      });
      var data = await res.json();
      if(!res.ok) throw new Error(data.error || 'Something went wrong.');
      formWrap.style.display='none';
      successWrap.classList.add('show');
    }catch(err){
      errEl.textContent = err.message || "Couldn't send that — please try again, or email hello@abity.co.uk directly.";
    }finally{
      btn.disabled=false; btn.textContent='Send message';
    }
  });

  // Rewire every existing "mailto:hello@abity.co.uk" link site-wide to open
  // this box instead, so nothing needs updating page-by-page.
  document.querySelectorAll('a[href^="mailto:hello@abity.co.uk"]').forEach(function(a){
    a.addEventListener('click', function(e){
      e.preventDefault();
      openContact();
    });
  });
  window.oreadyOpenContact = openContact;
})();

