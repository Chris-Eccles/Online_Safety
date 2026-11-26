// Small navigation helpers used on every page (not the KS3 workbooks):
// the school logo links home, and a "Back to top" button appears on long pages.
(function () {
  "use strict";
  var img = document.querySelector(".bar img");
  if (img && !img.closest("a")) {
    var a = document.createElement("a");
    a.className = "home";
    a.href = img.dataset.home || "/";
    a.setAttribute("aria-label", "Home");
    img.parentNode.insertBefore(a, img); a.appendChild(img);
  }
  var b = document.createElement("button");
  b.type = "button"; b.className = "totop"; b.textContent = "↑ Top";
  b.setAttribute("aria-label", "Back to top of page");
  b.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });
  document.body.appendChild(b);
  function check() { b.classList.toggle("show", window.scrollY > 600); }
  window.addEventListener("scroll", check, { passive: true }); check();
})();
