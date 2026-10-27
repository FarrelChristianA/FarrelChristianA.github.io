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

  /* (cursor spotlight and card glow removed for speed) */

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
  var sTick = false;
  window.addEventListener("scroll", function () { if (sTick) return; sTick = true; requestAnimationFrame(function () { sTick = false; onScroll(); reveal(); }); }, { passive: true });
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
  if (cv && !reduce && cv.getContext && cv.getContext("2d")) {
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
  if (false) {
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

/* ===== V3: live demo frames, galleries, story theme toggle, horizontal CV timeline ===== */
(function () {
  "use strict";
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- live demo: click to load, desktop / phone toggle ---------- */
  document.querySelectorAll("[data-demo]").forEach(function (shell) {
    var stage = shell.querySelector(".demo-stage"), poster = shell.querySelector(".demo-poster");
    var src = shell.getAttribute("data-demo"), loaded = false;
    function load() {
      if (loaded) return; loaded = true;
      var note = document.createElement("div"); note.className = "demo-loading"; note.textContent = "loading the app...";
      stage.appendChild(note);
      var f = document.createElement("iframe");
      f.src = src; f.title = shell.getAttribute("data-title") || "Live demo"; f.setAttribute("allow", "clipboard-write");
      f.addEventListener("load", function () { note.remove(); });
      stage.appendChild(f);
      if (poster) { poster.style.transition = "opacity .5s"; poster.style.opacity = "0"; setTimeout(function () { poster.remove(); }, 500); }
    }
    if (poster) poster.addEventListener("click", load);
    shell.querySelectorAll("[data-launch]").forEach(function (b) { b.addEventListener("click", function (e) { e.preventDefault(); load(); shell.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" }); }); });
    shell.querySelectorAll(".seg button").forEach(function (b) {
      b.addEventListener("click", function () {
        shell.querySelectorAll(".seg button").forEach(function (x) { x.classList.remove("on"); });
        b.classList.add("on");
        var wasLoaded = loaded;
        stage.classList.toggle("phone", b.getAttribute("data-view") === "phone");
        load();
        /* apps lay themselves out on start, so reload them at the new size */
        if (wasLoaded) setTimeout(function () {
          var fr = stage.querySelector("iframe"); if (!fr) return;
          if (fr.hasAttribute("srcdoc")) { var sd = fr.srcdoc; fr.srcdoc = ""; fr.srcdoc = sd; } else { fr.src = fr.src; }
        }, 560);
      });
    });
  });
  document.querySelectorAll("[data-launch-target]").forEach(function (a) {
    a.addEventListener("click", function (e) {
      var shell = document.querySelector(a.getAttribute("data-launch-target"));
      if (!shell) return; e.preventDefault();
      var p = shell.querySelector(".demo-poster"); if (p) p.click();
      shell.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    });
  });

  /* ---------- drag-to-scroll helper (gallery + timeline) ---------- */
  function dragScroll(el) {
    var down = false, sx = 0, sl = 0, moved = false;
    el.addEventListener("pointerdown", function (e) { if (e.pointerType !== "mouse") return; down = true; moved = false; sx = e.clientX; sl = el.scrollLeft; });
    window.addEventListener("pointermove", function (e) { if (!down) return; var dx = e.clientX - sx; if (Math.abs(dx) > 4) { moved = true; el.classList.add("drag"); } el.scrollLeft = sl - dx; });
    window.addEventListener("pointerup", function () { if (!down) return; down = false; setTimeout(function () { el.classList.remove("drag"); }, 0); });
    el.addEventListener("click", function (e) { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
  }

  /* ---------- galleries: arrows, drag, lightbox ---------- */
  var lb = null;
  function lightbox(src) {
    if (!lb) { lb = document.createElement("div"); lb.className = "lightbox"; lb.innerHTML = "<img alt=''>"; document.body.appendChild(lb); lb.addEventListener("click", function () { lb.classList.remove("on"); }); document.addEventListener("keydown", function (e) { if (e.key === "Escape") lb.classList.remove("on"); }); }
    lb.querySelector("img").src = src; lb.classList.add("on");
  }
  document.querySelectorAll(".gallery").forEach(function (g) {
    dragScroll(g);
    g.querySelectorAll(".shot img").forEach(function (im) { im.style.cursor = "zoom-in"; im.addEventListener("click", function () { lightbox(im.currentSrc || im.src); }); });
    var id = g.id; if (!id) return;
    document.querySelectorAll('[data-gal="' + id + '"]').forEach(function (b) {
      b.addEventListener("click", function () { var f = g.querySelector("figure"); var w = f ? f.getBoundingClientRect().width + 18 : 600; g.scrollBy({ left: (b.getAttribute("data-dir") === "prev" ? -1 : 1) * w, behavior: reduce ? "auto" : "smooth" }); });
    });
  });

  /* ---------- dark / light screenshots (flagship story) ---------- */
  document.querySelectorAll("[data-shot-mode]").forEach(function (seg) {
    seg.querySelectorAll("button").forEach(function (b) {
      b.addEventListener("click", function () {
        seg.querySelectorAll("button").forEach(function (x) { x.classList.remove("on"); }); b.classList.add("on");
        var mode = b.getAttribute("data-mode");
        document.querySelectorAll("img[data-dark]").forEach(function (im) { im.src = im.getAttribute("data-" + mode); });
      });
    });
  });

  /* ---------- horizontal timeline ---------- */
  var htl = document.querySelector(".htl");
  if (htl) {
    dragScroll(htl);
    var fill = htl.querySelector(".htl-fill");
    function items() { return Array.prototype.filter.call(htl.querySelectorAll(".h-item"), function (x) { return !x.classList.contains("hide"); }); }
    function update() {
      var max = htl.scrollWidth - htl.clientWidth;
      htl.style.setProperty("--track", htl.scrollWidth + "px");
      var r = htl.getBoundingClientRect();
      var p = max > 0 ? (htl.scrollLeft + htl.clientWidth * 0.75) / htl.scrollWidth : 1;
      htl.style.setProperty("--hfill", Math.max(0.04, Math.min(1, p)).toFixed(3));
      items().forEach(function (it) {
        var b = it.getBoundingClientRect();
        if (b.left < r.right - 40 && b.right > r.left) it.classList.add("in");
      });
    }
    htl.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    /* vertical wheel scrolls the timeline sideways while the pointer is over it */
    htl.addEventListener("wheel", function (e) {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      var max = htl.scrollWidth - htl.clientWidth;
      if ((e.deltaY > 0 && htl.scrollLeft >= max - 2) || (e.deltaY < 0 && htl.scrollLeft <= 2)) return;
      e.preventDefault(); htl.scrollLeft += e.deltaY;
    }, { passive: false });
    document.querySelectorAll("[data-htl]").forEach(function (b) {
      b.addEventListener("click", function () {
        var d = b.getAttribute("data-htl"), w = (items()[0] || htl).getBoundingClientRect().width + 22;
        if (d === "start") htl.scrollTo({ left: 0, behavior: reduce ? "auto" : "smooth" });
        else if (d === "end") htl.scrollTo({ left: htl.scrollWidth, behavior: reduce ? "auto" : "smooth" });
        else htl.scrollBy({ left: (d === "prev" ? -1 : 1) * w, behavior: reduce ? "auto" : "smooth" });
      });
    });
    document.querySelectorAll('[data-filter-group="#htl"] .chip').forEach(function (c) { c.addEventListener("click", function () { setTimeout(update, 30); }); });
    setTimeout(update, 60); window.addEventListener("load", update);
    /* start at the newest end once, like reading the latest chapter first, then glide back */
    var params = new URLSearchParams(location.search);
    if (params.get("from") === "latest") setTimeout(function () { htl.scrollLeft = htl.scrollWidth; update(); }, 100);
  }
})();

/* ===== CV lane timeline ===== */
(function () {
  "use strict";
  var data = window.CV_ITEMS, gx = document.getElementById("gx"), cv = document.getElementById("gxCanvas"), det = document.getElementById("gxDetail");
  if (!data || !gx || !cv || !det) return;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var ICONS = {
    cap: '<path d="M2 9l10-5 10 5-10 5-10-5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/><path d="M22 9v6"/>',
    cube: '<path d="M12 2l9 5v10l-9 5-9-5V7z"/><path d="M12 22V12M21 7l-9 5-9-5"/>',
    ruler: '<path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>',
    plane: '<path d="M2 16l20-6-20-6 4 6z"/><path d="M6 10h16"/>',
    bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    store: '<path d="M3 9l2-5h14l2 5"/><path d="M4 9v11h16V9"/><path d="M3 9c0 2 2 3 3 3s3-1 3-3c0 2 2 3 3 3s3-1 3-3c0 2 2 3 3 3s3-1 3-3"/><path d="M10 20v-5h4v5"/>',
    candles: '<path d="M7 3v4M7 17v4M17 6v3M17 18v3"/><rect x="5" y="7" width="4" height="10" rx="1"/><rect x="15" y="9" width="4" height="9" rx="1"/>',
    star: '<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/>',
    spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><path d="M12 8l1.5 2.5L16 12l-2.5 1.5L12 16l-1.5-2.5L8 12l2.5-1.5z"/>',
    blocks: '<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><path d="M17 13v8M13 17h8"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>'
  };
  function svg(k) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + ICONS[k] + "</svg>"; }
  var M = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  var SMALL = window.innerWidth < 640, NOW = "2026-10", START = "2021-07", END = "2027-01", MW = SMALL ? 22 : 44, PADL = SMALL ? 16 : 30, LANE = SMALL ? 66 : 74, TOP = SMALL ? 62 : 74, MINW = SMALL ? 170 : 196;
  function idx(ym) { var p = ym.split("-"); var s = START.split("-"); return (p[0] - s[0]) * 12 + (p[1] - s[1]); }
  function lbl(ym) { var p = ym.split("-"); return M[+p[1] - 1] + " " + p[0]; }
  function dur(a, b) { var n = idx(b) - idx(a) + 1, y = Math.floor(n / 12), m = n % 12; return (y ? y + (y > 1 ? " yrs" : " yr") : "") + (y && m ? " " : "") + (m ? m + (m > 1 ? " mos" : " mo") : ""); }
  var total = idx(END), width = PADL * 2 + total * MW;
  cv.style.width = width + "px";
  /* year lines and month ticks */
  var html = "";
  for (var i = 0; i <= total; i++) {
    var y = +START.split("-")[0] + Math.floor((i + (+START.split("-")[1]) - 1) / 12), mo = (i + (+START.split("-")[1]) - 1) % 12;
    var x = PADL + i * MW;
    if (mo === 0) html += '<div class="gx-year" style="left:' + x + 'px"><span>' + y + "</span></div>";
    else html += '<div class="gx-tick" style="left:' + x + 'px"></div>';
  }
  html += '<div class="gx-now" style="left:' + (PADL + (idx(NOW) + 0.5) * MW) + 'px"></div>';
  /* pack items into lanes by visual extent */
  var lanes = [], items = data.slice().sort(function (a, b) { return idx(a.s) - idx(b.s); });
  items.forEach(function (it) {
    var e = it.e || NOW, x0 = PADL + idx(it.s) * MW + (it.ms ? 6 : 0), real = (idx(e) - idx(it.s) + 1) * MW - 4;
    var vis = it.ms ? 150 : Math.max(real, MINW);
    it._x = x0; it._w = it.ms ? 0 : real; it._end = x0 + vis + 10;
    for (var L = 0; L < 20; L++) { if (!lanes[L] || lanes[L] <= x0) { lanes[L] = it._end; it._lane = L; break; } }
  });
  items.forEach(function (it, n) {
    var top = TOP + it._lane * LANE;
    var w = it.ms ? "" : "width:" + Math.max(it._w, MINW) + "px;";
    var cls = "gx-item k-" + it.kind + (it.e ? "" : " live") + (it.ms ? " ms" : "");
    html += '<div class="' + cls + '" data-id="' + it.id + '" role="button" tabindex="0" style="left:' + it._x + "px;top:" + top + "px;" + w + "transition-delay:" + (n * 0.07) + 's,' + (n * 0.07) + 's,0s,0s,0s"><span class="gx-ico">' + svg(it.icon) + '</span><span class="gx-txt"><b>' + it.t + "</b><span>" + it.o + "</span></span></div>";
  });
  cv.style.height = (TOP + lanes.length * LANE + 30) + "px";
  cv.innerHTML = html;
  var order = items.map(function (it) { return it.id; }), cur = null;
  function select(id, scroll) {
    var it = items.filter(function (x) { return x.id === id; })[0]; if (!it) return;
    cur = id;
    cv.querySelectorAll(".gx-item").forEach(function (el) { el.classList.toggle("on", el.getAttribute("data-id") === id); });
    var dates = it.ms ? lbl(it.s) : lbl(it.s) + " to " + (it.e ? lbl(it.e) : "Present") + " &middot; " + dur(it.s, it.e || NOW);
    det.className = "gx-detail card k-" + it.kind;
    det.innerHTML = '<div class="gd-head"><span class="gx-ico">' + svg(it.icon) + '</span><span class="tag">' + it.tag + "</span><h3>" + it.title + '</h3><div class="org">' + it.org + '</div><div class="dates">' + dates + '</div><span class="step">' + (order.indexOf(id) + 1) + " of " + order.length + "</span></div><div><ul>" + it.b.map(function (b) { return "<li>" + b + "</li>"; }).join("") + '</ul><div class="metrics">' + (it.m || []).map(function (m) { return "<span>" + m + "</span>"; }).join("") + "</div></div>";
    void det.offsetWidth; det.classList.add("swap");
    if (scroll) {
      var el = cv.querySelector('[data-id="' + id + '"]');
      var target = el.offsetLeft - gx.clientWidth / 2 + Math.min(el.offsetWidth, gx.clientWidth * 0.6) / 2;
      gx.scrollTo({ left: Math.max(0, target), behavior: reduce ? "auto" : "smooth" });
    }
  }
  cv.addEventListener("click", function (e) { var el = e.target.closest(".gx-item"); if (el && !gx.classList.contains("moved")) select(el.getAttribute("data-id"), true); });
  cv.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { var el = e.target.closest(".gx-item"); if (el) { e.preventDefault(); select(el.getAttribute("data-id"), true); } } });
  document.querySelectorAll("[data-gx]").forEach(function (b) {
    b.addEventListener("click", function () {
      var a = b.getAttribute("data-gx"), i = order.indexOf(cur);
      if (a === "now") { select(order[order.length - 1], true); return; }
      i = a === "prev" ? Math.max(0, i - 1) : Math.min(order.length - 1, i + 1);
      select(order[i], true);
    });
  });
  gx.addEventListener("keydown", function (e) { if (e.target !== gx) return; if (e.key === "ArrowRight") { e.preventDefault(); document.querySelector('[data-gx="next"]').click(); } if (e.key === "ArrowLeft") { e.preventDefault(); document.querySelector('[data-gx="prev"]').click(); } });
  /* drag + wheel */
  var down = false, sx = 0, sl = 0;
  gx.addEventListener("pointerdown", function (e) { if (e.pointerType !== "mouse") return; down = true; sx = e.clientX; sl = gx.scrollLeft; gx.classList.remove("moved"); });
  window.addEventListener("pointermove", function (e) { if (!down) return; var dx = e.clientX - sx; if (Math.abs(dx) > 5) { gx.classList.add("drag", "moved"); } gx.scrollLeft = sl - dx; });
  window.addEventListener("pointerup", function () { if (!down) return; down = false; gx.classList.remove("drag"); setTimeout(function () { gx.classList.remove("moved"); }, 0); });
  gx.addEventListener("wheel", function (e) {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    var max = gx.scrollWidth - gx.clientWidth;
    if ((e.deltaY > 0 && gx.scrollLeft >= max - 2) || (e.deltaY < 0 && gx.scrollLeft <= 2)) return;
    e.preventDefault(); gx.scrollLeft += e.deltaY;
  }, { passive: false });
  /* reveal bars when the timeline enters the screen */
  function check() { var r = gx.getBoundingClientRect(); if (r.top < window.innerHeight * 0.9) { gx.classList.add("in"); window.removeEventListener("scroll", check); } }
  window.addEventListener("scroll", check, { passive: true }); setTimeout(check, 200);
  select(order[0], false);
})();

/* ===== V4b ornaments: rings, dots and plus marks in the page heads ===== */
(function () {
  "use strict";
  var rings = '<svg viewBox="0 0 200 200" fill="none"><defs><linearGradient id="ornG" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#7af0dc"/><stop offset="1" stop-color="#8b7cf6"/></linearGradient></defs>' +
    '<circle cx="100" cy="100" r="96" stroke="url(#ornG)" stroke-opacity=".35" stroke-width=".6"/>' +
    '<circle cx="100" cy="100" r="78" stroke="url(#ornG)" stroke-opacity=".25" stroke-width=".6" stroke-dasharray="2 6"/>' +
    '<circle cx="100" cy="100" r="58" stroke="url(#ornG)" stroke-opacity=".3" stroke-width=".6"/>' +
    '<path d="M100 4 A96 96 0 0 1 196 100" stroke="#7af0dc" stroke-opacity=".9" stroke-width="1.4" stroke-linecap="round"/>' +
    '<circle cx="196" cy="100" r="3" fill="#9bf6e6"/><circle cx="42" cy="100" r="2" fill="#8b7cf6"/></svg>';
  document.querySelectorAll(".hero, .page-head, .p-hero").forEach(function (sec) {
    if (sec.querySelector(".orn")) return;
    var r = document.createElement("div"); r.className = "orn orn-rings"; r.setAttribute("aria-hidden", "true"); r.innerHTML = rings; sec.appendChild(r);
    var d = document.createElement("div"); d.className = "orn orn-dots"; d.setAttribute("aria-hidden", "true"); sec.appendChild(d);
    ["orn-p1", "orn-p2"].forEach(function (c) { var p = document.createElement("span"); p.className = "orn orn-plus " + c; p.setAttribute("aria-hidden", "true"); sec.appendChild(p); });
  });
})();
