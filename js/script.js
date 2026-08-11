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
