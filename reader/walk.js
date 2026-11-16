/* Walkthrough of the reading system: one caption and one visual state per step.
   It plays like a video that pauses: Next, the arrow keys, the mouse wheel, a swipe or the
   progress bar move to the next state, and the dots travel there. The page never scrolls.
   Data comes from words.js (built by tools/build_words.py): one entry per dot, most common word first. */
(function () {
  "use strict";
  var D = window.WORDS, W = D.words, N = W.length;      // W[i] = [text, gloss, state, isCard]; state -1 = not learned
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $ = function (id) { return document.getElementById(id); };
  var fmt = function (n) { return n.toLocaleString("en-US"); };
  var nCards = W.filter(function (w) { return w[3]; }).length;

  // ------------------------------------------------------------------ steps
  var STEPS = [
    { id: "intro1", kind: "intro", field: "hidden", panel: "intro", intro: 1 },
    { id: "intro2", kind: "intro", field: "hidden", panel: "intro", intro: 2 },
    { id: "intro3", kind: "intro", field: "hidden", panel: "intro", intro: 3 },
    { id: "cards", field: "grid",
      h: "Every word learned so far is kept as a flashcard.",
      p: "<b>" + fmt(nCards) + "</b> German words, one dot each." },
    { id: "freq", field: "curve", low: "axis",
      h: "Sorted from the most common word to the rarest.",
      p: "Dark dots are words not learned yet. Counted in <b>" + (D.tokens / 1e6).toFixed(1) + " million words</b> of German podcasts and YouTube." },
    { id: "asm1", field: "asm", low: "sentence", level: 1,
      h: "A chapter is built from known words.",
      p: "Target: <b>98 of every 100</b>." },
    { id: "asm2", field: "asm", low: "sentence", level: 2,
      h: "Words that keep getting forgotten are worked back in.",
      p: "<span class='c-low'>Betrag</span> (amount): failed 8 times on its flashcard." },
    { id: "asm3", field: "asm", low: "sentence", level: 3,
      h: "One new word takes the open slot.",
      p: "<span class='c-new'>nachholen</span> (to catch up on): common in speech, not learned yet." },
    { id: "page", field: "hidden", panel: "page",
      h: "The stories are public-domain classics, retold with AI.",
      p: "Sherlock Holmes, 1893. New words appear in <span class='c-new'>blue</span>." },
    { id: "taps", field: "hidden", panel: "page", taps: true,
      h: "Hard words can be marked while reading.",
      p: "Marked words return in later stories." },
    { id: "app", field: "hidden", panel: "app",
      h: "This is the reader." }
  ];

  // the sentence assembled in steps asm1-asm3: [text shown, word it comes from, level, text after it]
  var SENT = [
    ["\u2026\u00a0aber", "aber", 1, " "], ["mein", "mein", 1, " "], ["Konto", "konto", 1, " "], ["gab", "geben", 1, " "], ["den", "der", 1, " "], ["n\u00f6tigen", "n\u00f6tig", 1, " "],
    ["Betrag", "betrag", 2, " "], ["nicht", "nicht", 1, " "], ["her", "her", 1, ". "], ["Ich", "ich", 1, " "], ["lie\u00df", "lassen", 1, " "], ["den", "der", 1, " "],
    ["Urlaub", "urlaub", 1, " "], ["ausfallen", "ausfallen", 1, " "], ["und", "und", 1, " "],
    ["sagte", "sagen", 1, " "], ["mir", "ich", 1, ", "], ["dass", "dass", 1, " "], ["ich", "ich", 1, " "], ["ihn", "er", 1, " "], ["im", "im", 1, " "], ["September", "september", 1, " "],
    ["nachholen", "nachholen", 3, " "], ["w\u00fcrde", "werden", 1, "."]
  ];

  // ------------------------------------------------------------------ elements
  var stage = $("stage"), viz = $("viz"), canvas = $("field"), ctx = canvas.getContext("2d"), tip = $("tip");
  var caps = $("caps"), rail = $("rail"), count = $("count"), nextBtn = $("next"), backBtn = $("back");
  var sentence = $("sentence"), page = $("page"), intro = $("intro"), appFrame = $("appFrame"), appFull = $("appFull");
  var panels = { intro: intro, page: page, app: $("app") };

  var capEls = [], pipEls = [];
  STEPS.forEach(function (s, i) {
    var c = document.createElement("section"); c.className = "cap cap-" + s.id;
    c.innerHTML = (s.h ? "<h2>" + s.h + "</h2>" : "") + (s.p ? "<p>" + s.p + "</p>" : "");
    caps.appendChild(c); capEls.push(c);
    var b = document.createElement("button"); b.type = "button"; b.className = "pip"; b.setAttribute("aria-label", "Step " + (i + 1) + " of " + STEPS.length);
    b.addEventListener("click", function () { go(i); }); rail.appendChild(b); pipEls.push(b);
  });

  // sentence: a word and its punctuation stay together and appear together; unrevealed words are not selectable
  var slotOf = D.sent;
  var sentEls = SENT.map(function (t) {
    var wrap = document.createElement("span"); wrap.className = "sw-wrap";
    var s = document.createElement("span"); s.className = "sw" + (t[2] > 1 ? " slot" : "") + (t[2] === 2 ? " fade" : "") + (t[2] === 3 ? " new" : "");
    var inner = document.createElement("span"); inner.className = "t"; inner.textContent = t[0]; s.appendChild(inner);
    wrap.appendChild(s); var tail = t[3].replace(/\s+$/, "");
    if (tail) { var pt = document.createElement("span"); pt.className = "pt"; pt.textContent = tail; wrap.appendChild(pt); }
    sentence.appendChild(wrap); if (/\s$/.test(t[3])) sentence.appendChild(document.createTextNode(" ")); return s;
  });

  // page: wrap every word so it can be marked; [t1:word] = a real mark, [new:word] = a new word
  var realTaps = [];
  [].slice.call(page.querySelectorAll("p:not(.page-meta)")).forEach(function (p) {
    var parts = p.textContent.split(/(\s+)/); p.textContent = "";
    parts.forEach(function (tok) {
      if (!tok.trim()) { p.appendChild(document.createTextNode(tok)); return; }
      var m = tok.match(/^\[(t\d|new):(.+?)\](.*)$/), word = m ? m[2] : tok.replace(/[.,]+$/, ""), tail = m ? m[3] : tok.slice(word.length);
      var s = document.createElement("span"); s.className = "w" + (m && m[1] === "new" ? " new" : ""); s.textContent = word;
      if (m && m[1] !== "new") { s.setAttribute("data-tap", m[1].slice(1)); realTaps.push(s); }
      s.addEventListener("click", function () { s.classList.toggle("tapped"); });
      p.appendChild(s); if (tail) p.appendChild(document.createTextNode(tail));
    });
  });

  // ------------------------------------------------------------------ particles: one per word
  var gridOrder = [];
  for (var i = 0; i < N; i++) if (W[i][3]) gridOrder.push(i);
  // Words with the same recall get no fixed order. Otherwise the most common words form a neat row in the grid,
  // and that row is seen swinging into the curve's first column as one solid bar.
  var tie = new Float32Array(N); for (i = 0; i < N; i++) tie[i] = Math.random();
  gridOrder.sort(function (a, b) { return (W[b][2] - W[a][2]) || (tie[a] - tie[b]); });
  var gridPos = new Int32Array(N).fill(-1); gridOrder.forEach(function (p, k) { gridPos[p] = k; });

  // dots the assembled sentence is made of, by the level at which they light up
  var slotFade = slotOf.betrag, slotNew = slotOf.nachholen, usedLevel = new Int8Array(N);
  SENT.forEach(function (t) { if (t[1] && slotOf[t[1]] != null && !usedLevel[slotOf[t[1]]]) usedLevel[slotOf[t[1]]] = t[2]; });

  var F = 7, cur = new Float32Array(N * F), tgt = new Float32Array(N * F), delay = new Float32Array(N), styleCache = new Array(N); // x,y,size,alpha,r,g,b
  var pal, geo = { w: 0, h: 0, dpr: 1 }, G = null, CV = null, CVfull = null, CVlow = null, box = null, mode = "none", t0 = 0, running = false, flyers = [], level = 0, sentLevel = 0, lit = [];

  function hex(v) { v = v.trim(); return [parseInt(v.substr(1, 2), 16), parseInt(v.substr(3, 2), 16), parseInt(v.substr(5, 2), 16)]; }
  function readPalette() {
    var cs = getComputedStyle(document.documentElement), g = function (n) { return hex(cs.getPropertyValue(n)); };
    pal = { low: g("--r-low"), mid: g("--r-mid"), high: g("--r-high"), unknown: g("--dot-unknown"), neu: g("--new") };
  }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function ramp(r) { var t = Math.max(0, Math.min(1, (r - 80) / 20)); return t < 0.5 ? mix(pal.low, pal.mid, t * 2) : mix(pal.mid, pal.high, (t - 0.5) * 2); }
  function stateColor(s) { return s < 0 ? pal.unknown : ramp(s); }
  function css(c) { return "rgb(" + (c[0] | 0) + "," + (c[1] | 0) + "," + (c[2] | 0) + ")"; }

  // The frequency curve: columns of dots, most common words on the left. A tall wall, a steep drop and a
  // long thin tail, the way word frequency falls off. It is a shape, not an exact scale.
  function curveShape(x, k) { return 0.008 + 0.992 / Math.pow(1 + x / (k || 0.085), 1.6); }
  function measure() {
    var r = viz.getBoundingClientRect(); if (!r.width || !r.height) return false;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    geo = { w: r.width, h: r.height, dpr: dpr };
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    canvas.style.width = canvas.width / dpr + "px"; canvas.style.height = canvas.height / dpr + "px";   // one canvas pixel per screen pixel, never stretched
    // card grid: fills the whole visual
    var n = gridOrder.length, cell = Math.sqrt(r.width * r.height / n), cols = Math.max(1, Math.floor(r.width / cell)), rows = Math.ceil(n / cols);
    cell = Math.min(r.width / cols, r.height / rows);
    G = { cell: cell, cols: cols, rows: rows, ox: (r.width - cols * cell) / 2, oy: (r.height - rows * cell) / 2 };
    // curve
    var H = r.height - 30, fill = 0, S = 400;
    for (var s = 0; s < S; s++) fill += curveShape(s / (S - 1)) / S;
    // Every dot sits on whole screen pixels with a whole-pixel gap, so the dots of the thin tail stay separate dots
    // on any display scaling (soft dots between pixels ran together into bars at 125% and 150%). The cell is the
    // natural size rounded to the nearest screen pixel; the curve is then made a touch fuller or leaner (its peak stays
    // a sharp full-height spike) until the columns hold one dot per word.
    var natural = Math.sqrt(r.width * H * fill / N) * 0.97, dpc = Math.max(2, Math.round(natural * dpr));
    var cc = dpc / dpr, ccols = Math.max(8, Math.floor(r.width / cc)), maxH = Math.max(4, Math.floor(H / cc));
    CVfull = layoutCurve(cc, ccols, maxH, dpc); CVlow = null; CV = CVfull;
    return true;
  }
  // One arrangement of the curve: `rows` dots high at its peak, every word in a column. A lower peak makes the
  // curve fuller, so the same dots at the same size always fit. Returns null if they cannot fit at all.
  function layoutCurve(cc, ccols, rows, dpc) {
    var hgt = new Int32Array(ccols), total = 0, c, lo = 0.02, hi = 1.6, it, guard = 0;
    function fillCols(m) { total = 0; for (var q = 0; q < ccols; q++) { hgt[q] = Math.min(rows, Math.max(1, Math.round(rows * curveShape(q / (ccols - 1), m)))); total += hgt[q]; } return total; }
    if (fillCols(hi) < N) return null;
    for (it = 0; it < 24; it++) { var mid = (lo + hi) / 2; if (fillCols(mid) < N) lo = mid; else hi = mid; }
    fillCols(hi);
    // make the columns hold exactly one dot per word: spread the rounding difference from the left, where it shows least
    for (c = 0; total !== N && guard < N * 4; c = (c + 1) % ccols, guard++) {
      if (total < N && hgt[c] < rows) { hgt[c]++; total++; } else if (total > N && hgt[c] > 1) { hgt[c]--; total--; }
    }
    if (total !== N) return null;
    var start = new Int32Array(ccols + 1), colOf = new Int32Array(N);
    for (c = 0; c < ccols; c++) { start[c + 1] = start[c] + hgt[c]; for (var k = start[c]; k < start[c + 1]; k++) colOf[k] = c; }
    return { cell: cc, cols: ccols, hgt: hgt, start: start, colOf: colOf, maxH: rows, crisp: true, dp: dpc, gap: Math.max(1, Math.round(dpc * 0.28)) };
  }
  // Where the curve sits. On the assembly steps it has to leave room for the sentence underneath. It does that by
  // getting a little lower and fuller, with every dot the same size as before (shrinking the dots made the curve
  // jump to two thirds of its size on a display at 150%, because a dot can only be a whole number of pixels).
  function curveBox(small) {
    var q = geo.dpr, snapX = function (v) { return Math.round(v * q) / q; }, L = CVfull;
    if (small) {
      var sh = sentence.getBoundingClientRect().height || geo.h * 0.3, avail = Math.max(80, geo.h - sh - 44);
      var rows = Math.max(4, Math.floor(avail / L.cell));
      if (rows < L.maxH) {
        if (!CVlow || CVlow.maxH !== rows) CVlow = layoutCurve(L.cell, L.cols, rows, L.dp);
        if (CVlow) L = CVlow;
        else {                                                             // no room even for the fullest curve (a very small window): shrink the dots after all
          var s = Math.max(2, Math.floor(L.dp * Math.min(1, avail / (L.maxH * L.cell)))) / L.dp, cs = L.cell * s;
          CV = L; return { s: s, ox: snapX((geo.w - L.cols * cs) / 2), base: L.maxH * cs };
        }
      }
    }
    CV = L;
    return { s: 1, ox: snapX((geo.w - L.cols * L.cell) / 2), base: L.maxH * L.cell };
  }
  function curveXY(slot) {
    var c = CV.colOf[slot], row = slot - CV.start[c], cs = CV.cell * box.s;
    return [box.ox + (c + 0.5) * cs, box.base - (row + 0.5) * cs];
  }

  var kMove = 0.13;
  function setField(m, instant) {
    var from = mode; mode = m; if (!G && !measure()) return;
    // between the grid and the curve every dot leaves at its own moment and travels a little slower,
    // so 11,000 dots are seen finding their own places
    var each = !instant && ((from === "grid" && m === "curve") || (from === "curve" && m === "grid")); kMove = each ? 0.075 : 0.13;
    var grid = m === "grid", curve = m === "curve" || m === "asm";
    box = curveBox(m === "asm"); lit = [];
    for (var i = 0; i < N; i++) {
      var o = i * F, x, y, size, a, col = stateColor(W[i][2]);
      if (grid && gridPos[i] >= 0) {
        var k = gridPos[i]; x = G.ox + (k % G.cols + 0.5) * G.cell; y = G.oy + (((k / G.cols) | 0) + 0.5) * G.cell; size = G.cell * 0.6; a = 1;
      } else {
        var xy = curveXY(i); var sd = Math.round(CV.dp * box.s); x = xy[0]; y = xy[1]; a = curve ? 1 : 0;
        size = (box.s < 1 ? (sd <= 2 ? sd : sd - 1) : CV.dp - CV.gap) / geo.dpr;   // whole screen pixels: a dot and a clear gap
        if (m === "asm") {
          var ul = usedLevel[i];
          if (ul && level >= ul) {            // a dot the sentence is made of stays lit; everything else steps back
            size = Math.max(size, 3.4); lit.push(i);
            if (i === slotFade) col = pal.low; else if (i === slotNew) col = pal.neu;
          } else a = 0.32;
        }
      }
      if (m === "hidden") a = 0;
      tgt[o] = x; tgt[o + 1] = y; tgt[o + 2] = size; tgt[o + 3] = a; tgt[o + 4] = col[0]; tgt[o + 5] = col[1]; tgt[o + 6] = col[2];
      delay[i] = (instant || reduce) ? 0 : each ? Math.random() * 900 + (x / geo.w) * 250 : (x / geo.w) * 420 + Math.random() * 160;
      if (instant || reduce) for (var j = 0; j < F; j++) cur[o + j] = tgt[o + j];
      styleCache[i] = null;
    }
    t0 = performance.now(); kick();
  }
  function kick() { if (!running) { running = true; requestAnimationFrame(frame); } }
  // Dots are drawn colour by colour. Telling the canvas a new colour is the slow part of drawing a dot, so it is
  // done about twenty times a frame instead of 11,000 times (measured: 45 ms a frame before, a few ms after).
  var order = new Int32Array(N), lastStyle = "", lastAlpha = -1;
  (function () { var idx = []; for (var i = 0; i < N; i++) idx.push(i); idx.sort(function (a, b) { return W[a][2] - W[b][2]; }); order.set(idx); })();
  var colStr = [], bk = [];
  function dotAt(i) {
    var o = i * F, a = cur[o + 3]; if (a < 0.02) return;
    var d = cur[o + 2], st = styleCache[i] || (styleCache[i] = "rgb(" + (cur[o + 4] | 0) + "," + (cur[o + 5] | 0) + "," + (cur[o + 6] | 0) + ")");
    if (a !== lastAlpha) { ctx.globalAlpha = a; lastAlpha = a; }
    if (st !== lastStyle) { ctx.fillStyle = st; lastStyle = st; }
    // small dots are squares set on whole screen pixels: sharp, and far cheaper to draw than 11,000 circles
    if (d < 4.6) { var q = geo.dpr, w = Math.max(1, Math.round(d * q)) / q; ctx.fillRect(Math.round((cur[o] - d / 2) * q) / q, Math.round((cur[o + 1] - d / 2) * q) / q, w, w); }
    else { ctx.beginPath(); ctx.arc(cur[o], cur[o + 1], d / 2, 0, 6.2832); ctx.fill(); }
  }
  function draw(now) {
    ctx.setTransform(geo.dpr, 0, 0, geo.dpr, 0, 0); ctx.clearRect(0, 0, geo.w, geo.h);
    // Small dots are gathered per colour and per step of transparency and filled together: a few hundred fills
    // a frame instead of 11,000. Large dots (the flashcard grid) and the two special dots are drawn one by one.
    var q = geo.dpr, i, k, o, a, d, b, id, w, snap = CV.crisp && box, half = box ? CV.cell * box.s / 2 : 0;
    lastStyle = ""; lastAlpha = -1;
    for (k = 0; k < N; k++) {
      i = order[k]; o = i * F; a = cur[o + 3]; if (a < 0.03) continue; d = cur[o + 2];
      if (d >= 4.6 || i === slotFade || i === slotNew) { dotAt(i); continue; }
      id = (W[i][2] + 1) * 17 + Math.round(a * 16); b = bk[id] || (bk[id] = { n: 0, v: [] });
      if (snap) { w = Math.max(1, Math.round(d * q)) / q; b.v[b.n++] = Math.round((cur[o] - half) * q) / q; b.v[b.n++] = Math.round((cur[o + 1] - half) * q) / q + (CV.cell * box.s - w); b.v[b.n++] = w; }   // from the cell's corner: always a whole pixel, the gap above and to the right
      else { b.v[b.n++] = cur[o] - d / 2; b.v[b.n++] = cur[o + 1] - d / 2; b.v[b.n++] = d; }
    }
    for (id = 0; id < bk.length; id++) {
      b = bk[id]; if (!b || !b.n) continue;
      ctx.globalAlpha = (id % 17) / 16; ctx.fillStyle = colStr[(id / 17) | 0]; ctx.beginPath();
      for (k = 0; k < b.n; k += 3) ctx.rect(b.v[k], b.v[k + 1], b.v[k + 2], b.v[k + 2]);
      ctx.fill(); b.n = 0;
    }
    lastStyle = ""; lastAlpha = -1;
    for (var l = 0; l < lit.length; l++) dotAt(lit[l]);          // lit dots again, on top
    ctx.globalAlpha = 1;
    for (var f = 0; f < flyers.length; f++) {                     // dots flying from the curve into the sentence
      var fl = flyers[f], t = (now - fl.t0) / fl.dur; if (t < 0) continue;
      if (t >= 1) { if (!fl.done) { fl.done = true; fl.el.classList.add("in"); } continue; }
      var e = 1 - Math.pow(1 - t, 3), x = fl.sx + (fl.ex - fl.sx) * e, y = fl.sy + (fl.ey - fl.sy) * e - Math.sin(t * Math.PI) * fl.arc;
      ctx.globalAlpha = t > 0.85 ? (1 - t) / 0.15 : 1; ctx.fillStyle = fl.color;
      ctx.beginPath(); ctx.arc(x, y, fl.r0 + (fl.r1 - fl.r0) * e, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function frame(now) {
    var el = now - t0, busy = false, k = mode === "hidden" ? 0.045 : kMove;   // dots leave more calmly than they arrive
    for (var i = 0; i < N; i++) {
      if (el < delay[i]) { busy = true; continue; }
      var o = i * F;
      for (var j = 0; j < F; j++) {
        var d = tgt[o + j] - cur[o + j];
        if (Math.abs(d) > (j === 3 ? 0.006 : 0.25)) { cur[o + j] += d * k; busy = true; if (j > 3) styleCache[i] = null; }
        else if (d !== 0) { cur[o + j] = tgt[o + j]; if (j > 3) styleCache[i] = null; }
      }
    }
    flyers = flyers.filter(function (f) { return !f.done; });
    draw(now);
    if (busy || flyers.length) requestAnimationFrame(frame); else running = false;
  }

  // ------------------------------------------------------------------ sentence assembly
  // wait: milliseconds before the first dot leaves, so the curve finishes moving first
  var slotT = 0;
  function showSlots(on, after) {                 // the underlines of the open slots; they come last
    clearTimeout(slotT);
    if (on && after) slotT = setTimeout(function () { sentence.classList.add("slots"); }, after);
    else sentence.classList.toggle("slots", on);
  }
  function setSentence(lv, animate, wait) {
    var prev = sentLevel; sentLevel = lv; flyers = [];
    var vr = viz.getBoundingClientRect(), n = 0;
    SENT.forEach(function (t, i) {
      var el = sentEls[i], show = lv >= t[2];
      if (!show) { el.classList.remove("in"); return; }
      if (el.classList.contains("in")) return;
      var slot = t[1] ? slotOf[t[1]] : null;
      if (!animate || reduce || slot == null || t[2] <= prev) { el.classList.add("in"); return; }
      var r = el.getBoundingClientRect(), xy = curveXY(slot), special = t[2] > 1;
      flyers.push({ el: el, sx: xy[0], sy: xy[1], ex: r.left - vr.left + r.width / 2, ey: r.top - vr.top + r.height / 2,
        t0: performance.now() + wait + (special ? 350 : n * 60), dur: special ? 1400 : 850, arc: special ? 70 : 26,
        r0: special ? 4 : 2, r1: special ? 8 : 5, color: t[2] === 3 ? css(pal.neu) : t[2] === 2 ? css(pal.low) : css(stateColor(W[slot][2])), done: false });
      n++;
    });
    showSlots(true, prev < 1 && n ? wait + n * 60 + 850 + 250 : 0);
    kick();
  }

  // ------------------------------------------------------------------ tooltip
  function label(w) { return { word: w[0], gloss: w[1], line: w[2] < 0 ? "not learned yet" : w[2] + "% recall", color: w[2] < 0 ? [165, 165, 170] : ramp(w[2]) }; }
  function hit(ev) {
    var r = canvas.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top, col, row, p;
    if (mode === "grid") {
      col = Math.floor((x - G.ox) / G.cell); row = Math.floor((y - G.oy) / G.cell);
      if (col < 0 || row < 0 || col >= G.cols) return null;
      p = gridOrder[row * G.cols + col]; return p == null ? null : label(W[p]);
    }
    if (mode === "curve") {
      var cs = CV.cell * box.s; col = Math.floor((x - box.ox) / cs); row = Math.floor((box.base - y) / cs);
      if (col < 0 || col >= CV.cols || row < 0 || row >= CV.hgt[col]) return null;
      return label(W[CV.start[col] + row]);
    }
    if (mode === "asm") {                        // only the lit dots answer, with a generous target
      var best = -1, bd = 14 * 14;
      for (var l = 0; l < lit.length; l++) { var o = lit[l] * F, dx = cur[o] - x, dy = cur[o + 1] - y, dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; best = lit[l]; } }
      if (best < 0) return null;
      var h = label(W[best]);
      if (best === slotNew) { h.line = "new word"; h.color = pal.neu; } else if (best === slotFade) { h.line = "failed 8 times on its flashcard"; h.color = pal.low; }
      return h;
    }
    return null;
  }
  function showTip(ev) {
    var h = hit(ev); if (!h) { tip.hidden = true; return; }
    tip.innerHTML = "<b lang='de'>" + h.word + "</b>" + (h.gloss ? "<span>" + h.gloss + "</span>" : "") + "<i style='color:" + css(h.color) + "'>" + h.line + "</i>";
    tip.hidden = false;
    var vr = viz.getBoundingClientRect(), x = ev.clientX - vr.left, y = ev.clientY - vr.top;
    tip.style.left = Math.max(4, Math.min(vr.width - tip.offsetWidth - 4, x + 14)) + "px";
    tip.style.top = Math.max(4, Math.min(vr.height - tip.offsetHeight - 4, y - tip.offsetHeight - 12 < 0 ? y + 16 : y - tip.offsetHeight - 12)) + "px";
  }
  canvas.addEventListener("pointermove", showTip);
  canvas.addEventListener("pointerdown", showTip);
  canvas.addEventListener("pointerleave", function () { tip.hidden = true; });

  // ------------------------------------------------------------------ the reader: fill the window and back
  function setFull(on) { appFrame.parentNode.classList.toggle("full", on); appFull.textContent = on ? "Exit full screen" : "Full screen"; }
  appFull.addEventListener("click", function () { setFull(!appFrame.parentNode.classList.contains("full")); });

  // ------------------------------------------------------------------ step control
  var active = -1, tapTimers = [], layout = null, swapT = 0, still = /[?&]step=\d/.test(location.search);
  function layoutOf(s) { return s.id === "app" ? "app" : (s.kind || ""); }   // the steps that share one stage layout
  function apply(i) {
    var prev = active; if (i === prev) return; active = i;
    var s = STEPS[i], move = { prev: prev, forward: i === prev + 1, before: mode };
    pipEls.forEach(function (b, k) { b.classList.toggle("on", k === i); b.classList.toggle("done", k < i); });
    count.textContent = (i + 1) + " / " + STEPS.length;
    backBtn.disabled = i === 0; nextBtn.textContent = i === STEPS.length - 1 ? "Homepage" : "Next";
    tip.hidden = true; setFull(false); unselect();
    clearTimeout(swapT); stage.classList.remove("swap");
    if (layoutOf(s) === layout || prev < 0 || reduce || still) { show(i, move); return; }
    // The caption row and the visual change size here. Fade out what is on screen, then change the layout,
    // then bring in the next step, so that nothing is seen jumping.
    stage.classList.add("swap");
    capEls.forEach(function (c) { c.classList.remove("on"); });
    Object.keys(panels).forEach(function (k) { panels[k].classList.remove("on"); });
    viz.setAttribute("data-low", "");
    swapT = setTimeout(function () { stage.classList.remove("swap"); show(i, move); }, 300);
  }
  function show(i, move) {
    var s = STEPS[i], prev = move.prev, forward = move.forward, before = move.before; layout = layoutOf(s);
    capEls.forEach(function (c, k) { c.classList.toggle("on", k === i); c.setAttribute("aria-hidden", k === i ? "false" : "true"); });
    stage.setAttribute("data-step", s.id); stage.setAttribute("data-kind", s.kind || ""); viz.setAttribute("data-low", s.low || "");
    viz.classList.toggle("after-field", s.field === "hidden" && before !== "hidden" && before !== "none");   // the page waits for the dots to clear
    Object.keys(panels).forEach(function (k) { panels[k].classList.toggle("on", s.panel === k); });
    if (s.intro) intro.setAttribute("data-level", s.intro);
    if (s.panel === "app" && !appFrame.src) appFrame.src = appFrame.getAttribute("data-src");   // load the reader only when it is reached

    if (Math.abs(viz.clientWidth - geo.w) > 1 || Math.abs(viz.clientHeight - geo.h) > 1) measure();
    level = s.level || 0;                          // which sentence dots are lit in the curve
    if (s.field !== mode || s.field === "asm") setField(s.field, prev < 0);
    // the curve moves into place first, then the dots leave for the sentence
    if (s.low === "sentence") setSentence(level, forward, before === "asm" ? 250 : 1700);
    else { sentLevel = 0; sentEls.forEach(function (e) { e.classList.remove("in"); }); flyers = []; showSlots(false); }

    tapTimers.forEach(clearTimeout); tapTimers = [];
    if (!s.taps) [].slice.call(page.querySelectorAll(".tapped")).forEach(function (e) { e.classList.remove("tapped"); });
    else {
      var groups = {}; realTaps.forEach(function (e) { (groups[e.getAttribute("data-tap")] = groups[e.getAttribute("data-tap")] || []).push(e); });
      Object.keys(groups).forEach(function (g, n) { tapTimers.push(setTimeout(function () { groups[g].forEach(function (e) { e.classList.add("tapped"); }); }, reduce ? 0 : 700 + n * 650)); });
    }
  }
  // Selected text lets go the way it does everywhere else: on a click outside it, and when the step changes.
  function unselect() { var sel = window.getSelection && window.getSelection(); if (sel && sel.removeAllRanges) sel.removeAllRanges(); }
  document.addEventListener("pointerdown", function (e) { if (!(e.target.closest && e.target.closest(".page, .cap, .intro"))) unselect(); });
  function go(i) { apply(Math.max(0, Math.min(STEPS.length - 1, i))); }
  nextBtn.addEventListener("click", function () { if (active === STEPS.length - 1) location.href = "../index.html?v=20261116j"; else go(active + 1); });   // the last step leads back to the front page
  backBtn.addEventListener("click", function () { go(active - 1); });
  window.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { setFull(false); return; }
    if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "PageDown" || e.key === " " || e.key === "Enter") { e.preventDefault(); go(active + 1); }
    if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "PageUp") { e.preventDefault(); go(active - 1); }
  });
  var wheelLock = 0;
  window.addEventListener("wheel", function (e) {
    if (Math.abs(e.deltaY) < 14) return;
    if (page.classList.contains("on") && page.scrollHeight > page.clientHeight + 4 && page.contains(e.target)) return; // let a long page scroll
    var now = Date.now(); if (now < wheelLock) return; wheelLock = now + 950;
    go(active + (e.deltaY > 0 ? 1 : -1));
  }, { passive: true });
  var touchY = null;
  window.addEventListener("touchstart", function (e) { touchY = e.touches[0].clientY; }, { passive: true });
  window.addEventListener("touchend", function (e) {
    if (touchY == null) return; var dy = e.changedTouches[0].clientY - touchY; touchY = null;
    if (Math.abs(dy) > 60 && !(page.classList.contains("on") && page.contains(e.target))) go(active + (dy < 0 ? 1 : -1));
  }, { passive: true });

  var resizeT;
  function relayout() { if (measure() && mode !== "none") setField(mode, true); }
  window.addEventListener("resize", function () { clearTimeout(resizeT); resizeT = setTimeout(relayout, 80); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);

  // for testing: finish every animation at once
  window.__walk = { go: go, bench: function (n) { var t = performance.now(); for (var i = 0; i < n; i++) draw(t); return (performance.now() - t) / n; }, settle: function () {
    for (var i = 0; i < N * F; i++) cur[i] = tgt[i];
    for (var k = 0; k < N; k++) styleCache[k] = null;
    flyers.forEach(function (f) { f.el.classList.add("in"); }); flyers = []; if (sentLevel) showSlots(true); draw(performance.now());
  } };

  readPalette(); for (var cs0 = -1; cs0 <= 100; cs0++) colStr[cs0 + 1] = css(stateColor(cs0));
  (function boot() {
    if (!measure()) { setTimeout(boot, 200); return; }   // the window has no size yet (page opened in a hidden tab or pane): wait for one
    box = curveBox(false);
    mode = "none"; apply(0);

    // ?step=5 opens a given step with every animation finished (used for screenshots and for linking to a step)
    var qs = /[?&]step=(\d+)/.exec(location.search);
    if (qs) {
      document.documentElement.classList.add("still");
      var jump = function () { relayout(); for (var k = 0; k <= Math.min(+qs[1], STEPS.length - 1); k++) apply(k); window.__walk.settle(); };
      jump(); if (document.fonts && document.fonts.ready) document.fonts.ready.then(jump); window.addEventListener("load", jump);
    }
  })();
})();
