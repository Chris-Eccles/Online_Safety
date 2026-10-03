// Keep the footer copyright year current automatically
(function () {
  var y = document.getElementById('footerYear');
  if (y) y.textContent = new Date().getFullYear();
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

/* ============================================================
   WHATSAPP CHAT WIDGET — a bubble fixed bottom-right on every
   page that pops open a small themed chat panel, Intercom-style,
   rather than immediately bouncing to WhatsApp. Set WHATSAPP_NUMBER
   below (full international format, digits only, no "+" or spaces
   - e.g. "447911123456") to switch it on; left blank, nothing
   renders.

   Honest limitation: real two-way chat happening INSIDE the page
   (no handoff at all) needs the paid WhatsApp Business Platform
   (a verified Meta Business account + a provider like Twilio or
   360dialog) - a proper backend integration, not something that
   bolts on client-side. What this gives instead: the chat panel,
   the typing, the "feels like a chat widget" bit, all happen on
   the site - only the final send step hands off to WhatsApp
   itself (app if installed, web.whatsapp.com otherwise) with the
   message already typed in, ready to send in one tap.
   ============================================================ */
(function(){
  var WHATSAPP_NUMBER = '447940813135';
  if(!WHATSAPP_NUMBER) return;

  var css = '' +
    '.oready-wa-bubble{position:fixed;bottom:20px;right:20px;z-index:9997;width:58px;height:58px;border-radius:50%;background:#25D366;box-shadow:0 8px 24px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;border:none;cursor:pointer;transition:transform .15s;}' +
    '.oready-wa-bubble:hover{transform:scale(1.07);}' +
    '.oready-wa-bubble .wa-close-icon{display:none;}' +
    '.oready-wa-bubble.open .wa-chat-icon{display:none;}' +
    '.oready-wa-bubble.open .wa-close-icon{display:block;}' +
    '#oready-wa-panel{position:fixed;bottom:88px;right:20px;z-index:9997;width:320px;max-width:calc(100vw - 32px);background:var(--bg-2,#0D1230);border:1px solid var(--border,rgba(255,255,255,.11));border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.45);overflow:hidden;display:none;font-family:var(--font-body,sans-serif);}' +
    '#oready-wa-panel.show{display:block;}' +
    '#oready-wa-head{background:#25D366;padding:16px 18px;display:flex;align-items:center;gap:10px;}' +
    '#oready-wa-head .wa-avatar{width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.25);display:flex;align-items:center;justify-content:center;flex-shrink:0;}' +
    '#oready-wa-head strong{color:#fff;font-size:14.5px;display:block;}' +
    '#oready-wa-head span{color:rgba(255,255,255,.85);font-size:12px;}' +
    '#oready-wa-body{padding:16px;}' +
    '#oready-wa-bubble-msg{background:rgba(255,255,255,.06);border-radius:12px 12px 12px 2px;padding:11px 13px;font-size:13.5px;color:var(--text,#fff);line-height:1.5;margin-bottom:14px;}' +
    '#oready-wa-body textarea{width:100%;box-sizing:border-box;padding:11px 13px;border-radius:10px;border:1px solid var(--border,rgba(255,255,255,.11));background:rgba(255,255,255,.04);color:var(--text,#fff);font-family:var(--font-body,sans-serif);font-size:13.5px;resize:none;min-height:64px;}' +
    '#oready-wa-body textarea:focus{outline:2px solid #25D366;outline-offset:1px;}' +
    '#oready-wa-send{width:100%;margin-top:10px;padding:11px;border-radius:50px;border:none;background:#25D366;color:#06241f;font-weight:800;font-size:13.5px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;}' +
    '#oready-wa-send:hover{background:#20bd5a;}' +
    '#oready-wa-note{font-size:11px;color:var(--text-faint,#8892a8);text-align:center;margin-top:10px;}';
  var styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  var waIconSvg = '<svg class="wa-chat-icon" width="27" height="27" viewBox="0 0 24 24" fill="#fff"><path d="M12.04 2c-5.52 0-10 4.48-10 10 0 1.77.46 3.45 1.26 4.9L2 22l5.25-1.38a9.96 9.96 0 0 0 4.79 1.22h.01c5.52 0 10-4.48 10-10s-4.48-10-10-10zm0 18.17h-.01a8.3 8.3 0 0 1-4.24-1.16l-.3-.18-3.12.82.83-3.04-.2-.31a8.26 8.26 0 0 1-1.27-4.4c0-4.58 3.73-8.3 8.31-8.3 2.22 0 4.3.87 5.87 2.44a8.24 8.24 0 0 1 2.43 5.87c0 4.58-3.73 8.3-8.3 8.3zm4.55-6.22c-.25-.12-1.47-.72-1.7-.81-.23-.08-.39-.12-.56.13-.17.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.36-.77-1.86-.2-.49-.41-.42-.56-.43-.14-.01-.31-.01-.47-.01-.17 0-.43.06-.66.31-.23.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.57.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.23-.16-.48-.28z"/></svg>';
  var closeIconSvg = '<svg class="wa-close-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  var bubble = document.createElement('button');
  bubble.type = 'button';
  bubble.className = 'oready-wa-bubble';
  bubble.setAttribute('aria-label', 'Chat with us on WhatsApp');
  bubble.innerHTML = waIconSvg + closeIconSvg;
  document.body.appendChild(bubble);

  var panel = document.createElement('div');
  panel.id = 'oready-wa-panel';
  panel.innerHTML = '' +
    '<div id="oready-wa-head">' +
      '<div class="wa-avatar">' + waIconSvg.replace('width="27" height="27"','width="20" height="20"') + '</div>' +
      '<div><strong>Online Ready</strong><span>Usually replies within a day</span></div>' +
    '</div>' +
    '<div id="oready-wa-body">' +
      '<div id="oready-wa-bubble-msg">Hi! 👋 Got a question about Online Ready? Type it below and send it straight to us on WhatsApp.</div>' +
      '<textarea id="oready-wa-text" placeholder="Type your message…">Hi — I\'ve got a question about Online Ready.</textarea>' +
      '<button type="button" id="oready-wa-send">' + waIconSvg.replace('width="27" height="27"','width="17" height="17"') + ' Open in WhatsApp</button>' +
      '<p id="oready-wa-note">Opens WhatsApp with this message ready to send.</p>' +
    '</div>';
  document.body.appendChild(panel);

  function togglePanel(){
    var open = panel.classList.toggle('show');
    bubble.classList.toggle('open', open);
    if(open) document.getElementById('oready-wa-text').focus();
  }
  bubble.addEventListener('click', togglePanel);
  document.addEventListener('click', function(e){
    if(panel.classList.contains('show') && !panel.contains(e.target) && !bubble.contains(e.target)){
      panel.classList.remove('show');
      bubble.classList.remove('open');
    }
  });
  document.getElementById('oready-wa-send').addEventListener('click', function(){
    var text = document.getElementById('oready-wa-text').value.trim() || "Hi — I've got a question about Online Ready.";
    window.open('https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(text), '_blank', 'noopener');
  });
})();
