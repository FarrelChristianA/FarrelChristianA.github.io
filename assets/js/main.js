/* Farrel Christian Ariyanto: portfolio interactions (no libraries) */
(function () {
  "use strict";
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var doc = document.documentElement;

  /* ---------- page veil: fade in on load, fade out on internal navigation ---------- */
  var veil = document.querySelector(".veil");
  window.addEventListener("load", function () { if (veil) veil.classList.add("gone"); });
  setTimeout(function () { if (veil) veil.classList.add("gone"); }, 900);
  document.addEventListener("click", function (e) {
    var a = e.target.closest("a");
    if (!a || reduce) return;
    var href = a.getAttribute("href");
    if (!href || href.charAt(0) === "#" || a.target === "_blank" || /^(mailto:|tel:|https?:)/.test(href) || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    if (veil) { veil.classList.remove("gone"); veil.classList.add("leave"); }
    setTimeout(function () { window.location.href = href; }, 320);
  });
  window.addEventListener("pageshow", function (e) { if (e.persisted && veil) { veil.classList.remove("leave"); veil.classList.add("gone"); } });

  /* ---------- active nav link ---------- */
  var page = document.body.getAttribute("data-page");
  document.querySelectorAll(".nav-links a").forEach(function (a) {
    if (a.getAttribute("data-page") === page) a.classList.add("active");
  });

  /* ---------- mobile menu ---------- */
  var toggle = document.querySelector(".menu-toggle");
  var links = document.querySelector(".nav-links");
  if (toggle && links) toggle.addEventListener("click", function () { links.classList.toggle("open"); });

  /* ---------- cursor spotlight + card glow ---------- */
  if (!reduce) {
    window.addEventListener("pointermove", function (e) {
      doc.style.setProperty("--mx", e.clientX + "px");
      doc.style.setProperty("--my", e.clientY + "px");
    }, { passive: true });
    document.querySelectorAll(".card").forEach(function (card) {
      var g = document.createElement("span"); g.className = "glow"; card.appendChild(g);
      card.addEventListener("pointermove", function (e) {
        var r = card.getBoundingClientRect();
        card.style.setProperty("--gx", (e.clientX - r.left) + "px");
        card.style.setProperty("--gy", (e.clientY - r.top) + "px");
      });
    });
  }

  /* ---------- scroll progress + timeline fill ---------- */
  var bar = document.querySelector(".progress");
  var tl = document.querySelector(".timeline");
  function onScroll() {
    var h = doc.scrollHeight - window.innerHeight;
    if (bar) bar.style.transform = "scaleX(" + (h > 0 ? window.scrollY / h : 0) + ")";
    if (tl) {
      var r = tl.getBoundingClientRect();
      var p = (window.innerHeight * 0.6 - r.top) / r.height;
      tl.style.setProperty("--fill", Math.max(0, Math.min(1, p)).toFixed(3));
    }
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- split headline words ---------- */
  document.querySelectorAll(".split").forEach(function (el) {
    var html = "";
    el.childNodes.forEach(function (node) {
      if (node.nodeType === 3) {
        node.textContent.split(/(\s+)/).forEach(function (w) {
          html += /^\s+$/.test(w) || !w ? w : '<span class="w"><span>' + w + "</span></span>";
        });
      } else {
        html += '<span class="w"><span>' + node.outerHTML + "</span></span>";
      }
    });
    el.innerHTML = html;
    el.querySelectorAll(".w > span").forEach(function (s, i) { s.style.transitionDelay = (0.05 * i + 0.15) + "s"; });
  });

  /* ---------- reveal on scroll (position check, works everywhere) ---------- */
  var pending = Array.prototype.slice.call(document.querySelectorAll(".reveal, .split, .t-item, .chapter, [data-count], .draw-wrap, .now, .draw"));
  function reveal() {
    var vh = window.innerHeight || doc.clientHeight;
    pending = pending.filter(function (el) {
      if (el.offsetParent === null && !el.closest("svg")) return true; /* hidden by a filter, check later */
      var r = el.getBoundingClientRect();
      if (r.top < vh * 0.92 && r.bottom > 0) {
        el.classList.add("in");
        if (el.hasAttribute("data-count")) countUp(el);
        return false;
      }
      return true;
    });
  }
  window.addEventListener("scroll", reveal, { passive: true });
  window.addEventListener("resize", reveal);
  window.addEventListener("load", reveal);
  requestAnimationFrame(function () { requestAnimationFrame(reveal); });
  setTimeout(reveal, 300);

  /* ---------- count-up numbers ---------- */
  function countUp(el) {
    var end = parseFloat(el.getAttribute("data-count"));
    var suffix = el.getAttribute("data-suffix") || "";
    if (reduce) { el.textContent = end + suffix; return; }
    var t0 = null, dur = 1600;
    function step(t) {
      if (!t0) t0 = t;
      var k = Math.min(1, (t - t0) / dur);
      var e = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(end * e) + suffix;
      if (k < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ---------- rotating role line ---------- */
  var rot = document.querySelector("[data-rotate]");
  if (rot) {
    var roles = rot.getAttribute("data-rotate").split("|"), ri = 0;
    setInterval(function () {
      rot.classList.add("out");
      setTimeout(function () { ri = (ri + 1) % roles.length; rot.textContent = roles[ri]; rot.classList.remove("out"); }, 350);
    }, 2600);
  }

  /* ---------- terminal: lines appear one by one, then loop ---------- */
  var term = document.querySelector(".term-body");
  if (term) {
    var lines = term.querySelectorAll(".term-line");
    var i = 0;
    function next() {
      if (i < lines.length) { lines[i].classList.add("show"); i++; setTimeout(next, reduce ? 0 : 520); }
      else if (!reduce) { setTimeout(function () { lines.forEach(function (l) { l.classList.remove("show"); }); i = 0; setTimeout(next, 600); }, 5200); }
    }
    setTimeout(next, 700);
  }

  /* ---------- filter chips (CV and projects) ---------- */
  document.querySelectorAll("[data-filter-group]").forEach(function (group) {
    var target = document.querySelector(group.getAttribute("data-filter-group"));
    group.querySelectorAll(".chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        group.querySelectorAll(".chip").forEach(function (c) { c.classList.remove("on"); });
        chip.classList.add("on");
        var f = chip.getAttribute("data-filter");
        target.querySelectorAll("[data-kind]").forEach(function (item) {
          var show = f === "all" || item.getAttribute("data-kind") === f;
          item.classList.toggle("hide", !show);
        });
        onScroll(); reveal();
      });
    });
  });

  /* ---------- footer year ---------- */
  var y = document.querySelector("[data-year]");
  if (y) y.textContent = new Date().getFullYear();
})();

/* ===== V2 effects: hero ticker canvas, cursor ring, magnetic buttons, text scramble ===== */
(function () {
  "use strict";
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  /* mobile menu: keep aria in sync */
  var toggle = document.querySelector(".menu-toggle"), links = document.querySelector(".nav-links");
  if (toggle && links) toggle.addEventListener("click", function () {
    toggle.setAttribute("aria-expanded", links.classList.contains("open") ? "true" : "false");
  });

  /* ---------- hero canvas: drifting market-style lines ---------- */
  var cv = document.querySelector(".hero-canvas");
  if (cv && !reduce && cv.getContext) {
    var ctx = cv.getContext("2d"), dpr = Math.min(2, window.devicePixelRatio || 1);
    var W = 0, H = 0, lines = [], running = true, raf = 0;
    function clampY(y) { return Math.max(H * 0.12, Math.min(H * 0.88, y)); }
    function init() {
      lines = [];
      var n = W < 700 ? 4 : 7;
      for (var i = 0; i < n; i++) {
        var step = W < 700 ? 14 : 18, pts = [], y = H * (0.25 + 0.55 * Math.random());
        for (var x = -step; x < W + step * 2; x += step) { y = clampY(y + (Math.random() - 0.5) * 16); pts.push(y); }
        lines.push({ pts: pts, step: step, off: 0, speed: 0.12 + Math.random() * 0.3, alpha: 0.06 + Math.random() * 0.14, w: 0.8 + Math.random() * 1.2, lead: i < 2 });
      }
    }
    function size() {
      var r = cv.getBoundingClientRect();
      W = r.width; H = r.height;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      init();
    }
    function frame() {
      ctx.clearRect(0, 0, W, H);
      for (var k = 0; k < lines.length; k++) {
        var l = lines[k];
        l.off += l.speed;
        if (l.off >= l.step) { l.off -= l.step; l.pts.shift(); l.pts.push(clampY(l.pts[l.pts.length - 1] + (Math.random() - 0.5) * 16)); }
        var g = ctx.createLinearGradient(0, 0, W, 0);
        g.addColorStop(0, "rgba(45,212,191,0)");
        g.addColorStop(0.55, "rgba(122,240,220," + l.alpha + ")");
        g.addColorStop(1, "rgba(155,246,230," + (l.alpha * 0.4) + ")");
        ctx.strokeStyle = g; ctx.lineWidth = l.w; ctx.beginPath();
        for (var i = 0; i < l.pts.length; i++) {
          var x = i * l.step - l.off - l.step;
          if (i === 0) ctx.moveTo(x, l.pts[i]); else ctx.lineTo(x, l.pts[i]);
        }
        ctx.stroke();
        if (l.lead) {
          var idx = Math.floor((W * 0.78 + l.off + l.step) / l.step), px = idx * l.step - l.off - l.step, py = l.pts[idx];
          if (py !== undefined) {
            var rg = ctx.createRadialGradient(px, py, 0, px, py, 14);
            rg.addColorStop(0, "rgba(155,246,230,0.9)"); rg.addColorStop(1, "rgba(45,212,191,0)");
            ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(px, py, 14, 0, Math.PI * 2); ctx.fill();
          }
        }
      }
      if (running) raf = requestAnimationFrame(frame);
    }
    function setRun(on) { if (on && !running) { running = true; raf = requestAnimationFrame(frame); } else if (!on) { running = false; cancelAnimationFrame(raf); } }
    size(); raf = requestAnimationFrame(frame);
    var rt; window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(size, 150); });
    window.addEventListener("scroll", function () { setRun(window.scrollY < H && !document.hidden); }, { passive: true });
    document.addEventListener("visibilitychange", function () { setRun(!document.hidden && window.scrollY < H); });
  }

  /* ---------- cursor ring (mouse only) ---------- */
  var ring = document.querySelector(".cursor-ring");
  if (ring && finePointer && !reduce) {
    var tx = -100, ty = -100, cx = -100, cy = -100;
    window.addEventListener("pointermove", function (e) { tx = e.clientX; ty = e.clientY; ring.classList.add("on"); }, { passive: true });
    document.addEventListener("pointerleave", function () { ring.classList.remove("on"); });
    document.addEventListener("pointerover", function (e) { ring.classList.toggle("big", !!e.target.closest("a, button, .card")); });
    (function loop() {
      cx += (tx - cx) * 0.18; cy += (ty - cy) * 0.18;
      ring.style.transform = "translate3d(" + cx + "px," + cy + "px,0)";
      requestAnimationFrame(loop);
    })();
  } else if (ring) { ring.remove(); }

  /* ---------- magnetic buttons ---------- */
  if (finePointer && !reduce) {
    document.querySelectorAll(".btn, .mail-btn, .pill-btn").forEach(function (b) {
      b.addEventListener("pointermove", function (e) {
        var r = b.getBoundingClientRect();
        var dx = (e.clientX - (r.left + r.width / 2)) * 0.22, dy = (e.clientY - (r.top + r.height / 2)) * 0.32;
        b.style.transform = "translate(" + dx + "px," + dy + "px)";
      });
      b.addEventListener("pointerleave", function () { b.style.transform = ""; });
    });
  }

  /* ---------- text scramble on eyebrow labels ---------- */
  var glyphs = "0123456789ABCDEF/%+.:";
  function scramble(el) {
    var orig = el.textContent, len = orig.length, frame = 0, total = 22;
    el.classList.add("scrambling");
    (function tick() {
      var out = "";
      for (var i = 0; i < len; i++) {
        var ch = orig.charAt(i);
        if (ch === " " || i < (frame / total) * len) out += ch;
        else out += glyphs.charAt(Math.floor(Math.random() * glyphs.length));
      }
      el.textContent = out;
      if (++frame <= total) setTimeout(tick, 34); else { el.textContent = orig; el.classList.remove("scrambling"); }
    })();
  }
  if (!reduce) {
    var labels = Array.prototype.slice.call(document.querySelectorAll(".eyebrow"));
    function check() {
      var vh = window.innerHeight;
      labels = labels.filter(function (el) {
        var r = el.getBoundingClientRect();
        if (r.top < vh * 0.9 && r.bottom > 0 && r.height > 0) { scramble(el); return false; }
        return true;
      });
    }
    window.addEventListener("scroll", check, { passive: true });
    setTimeout(check, 450);
  }
})();
