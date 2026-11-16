/* Walkthrough of Providence: one sentence and one state of the visual per step.
   It plays like a video that pauses: Next, the arrow keys, the mouse wheel, a swipe or the progress bar.
   One example runs through all of it: an AI that sorts customer emails to the right team.
   Every range and every "could this be luck" figure is computed by stats.js, the same way Providence does it.
   Each step draws its whole state from scratch (render), so going back and forth can never leave something behind. */
(function () {
  "use strict";
  var S = window.PStats, $ = function (id) { return document.getElementById(id); };
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches, still = /[?&]step=\d/.test(location.search);
  var LO = 20, HI = 100, TARGET = 85;

  // ------------------------------------------------------------------ steps
  var STEPS = [
    { id: "goal", layout: "intro", view: "intro", intro: 1 },
    { id: "problem", layout: "intro", view: "intro", intro: 2 },
    { id: "solution", layout: "intro", view: "intro", intro: 3 },
    { id: "example", view: "meter", mode: "list", range: 0, slider: 0,
      h: "Example: an AI that sorts customer emails to the right team.",
      p: "Before it goes live, it is tested on 12 emails. It sorts 11 correctly: <b>92%</b>. The target is 85%." },
    { id: "range", view: "meter", mode: "dots", range: 1, slider: 0,
      h: "With only 12 emails, the real rate could be anywhere from 65% to 99%.",
      p: "That range crosses the target, so the result is <span class='t-open'>not settled</span>." },
    { id: "more", view: "meter", mode: "dots", range: 1, slider: 1,
      h: "More test emails narrow the range.",
      p: "Drag the slider. Once the whole range is above the target, the result is <span class='t-pass'>settled</span>." },
    { id: "update", view: "update",
      h: "After an update, the score drops. Worse, or bad luck?",
      p: "Providence works out how often chance alone would cause a drop that size. Drag to try." },
    { id: "app", layout: "app", view: "app",
      h: "This is the dashboard.",
      p: "Example data. Built with Alejandro Lizardi." }
  ];

  // the 12 test emails of the example and the team each was sent to; the 8th went to the wrong team
  var QUESTIONS = [["Where is my order?", "Shipping"], ["Can I return these shoes?", "Returns"], ["Do you ship to Austria?", "Shipping"], ["I forgot my password", "Account"],
    ["Is the jacket in stock?", "Sales"], ["Please change my address", "Account"], ["I was charged twice", "Billing"], ["How long is the warranty?", "Billing"],
    ["Can I pay by invoice?", "Billing"], ["Please cancel my order", "Sales"], ["Any student discount?", "Sales"], ["My parcel arrived damaged", "Returns"]];
  // Which of 400 answers are wrong. A fixed, random-looking sequence: the score wobbles while questions are few
  // and settles near 91% as they add up, the way a real test run behaves.
  var WRONG = [7, 13, 30, 34, 35, 43, 55, 61, 69, 77, 83, 87, 98, 121, 122, 129, 130, 142, 149, 153, 164, 188, 195, 222, 228, 253, 268, 276, 278, 279, 295, 307, 322, 332, 334, 370, 392, 399];

  function pos(v) { return (Math.max(LO, Math.min(HI, v)) - LO) / (HI - LO) * 100; }
  function pct(v) { return Math.round(v) + "%"; }

  // ------------------------------------------------------------------ elements
  var stage = $("stage"), caps = $("caps"), rail = $("rail"), count = $("count"), nextBtn = $("next"), backBtn = $("back");
  var views = {}; ["intro", "meter", "update", "app"].forEach(function (v) { views[v] = $("v-" + v); });
  var capEls = [], pipEls = [];
  STEPS.forEach(function (s, i) {
    var c = document.createElement("section"); c.className = "cap";
    c.innerHTML = (s.h ? "<h2>" + s.h + "</h2>" : "") + (s.p ? "<p>" + s.p + "</p>" : "");
    caps.appendChild(c); capEls.push(c);
    var b = document.createElement("button"); b.type = "button"; b.className = "pip"; b.setAttribute("aria-label", "Step " + (i + 1) + " of " + STEPS.length);
    b.addEventListener("click", function () { go(i); }); rail.appendChild(b); pipEls.push(b);
  });

  // ------------------------------------------------------------------ the instrument (steps example, range, more)
  var meter = views.meter, field = $("field"), dots = $("dots"), qlist = $("qlist"), slide = $("slide"), MAXQ = +slide.max, qs = [], rows = [], slots = [];
  var wrongSet = {}; WRONG.forEach(function (i) { wrongSet[i] = 1; });
  for (var i = 0; i < MAXQ; i++) { var q = document.createElement("span"); q.className = "q" + (wrongSet[i] ? " fail" : ""); q.hidden = true; dots.appendChild(q); qs.push(q); }
  QUESTIONS.forEach(function (text, i) {
    var r = document.createElement("div"); r.className = "qrow" + (wrongSet[i] ? " bad" : ""); r.innerHTML = "<i></i><span>" + text[0] + "</span><em>" + text[1] + (wrongSet[i] ? " \u2715" : "") + "</em>";
    qlist.appendChild(r); rows.push(r); slots.push(r.firstChild);
  });
  $("target").style.left = pos(TARGET) + "%";
  [20, 40, 60, 80, 100].forEach(function (t) { var s = document.createElement("span"); s.textContent = t + "%"; s.style.left = pos(t) + "%"; $("ticks").appendChild(s); });

  var timers = [], raf = 0;
  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function stopAll() { timers.forEach(clearTimeout); timers = []; cancelAnimationFrame(raf); raf = 0; }

  // Draws the instrument for n questions. Everything it shows is set here, nothing is carried over.
  function drawMeter(n, mode, showRange) {
    var k = n, i; for (i = 0; i < WRONG.length; i++) if (WRONG[i] < n) k--;
    var w = S.wilson(k, n), r = k / n * 100, v = S.verdict(k, n, TARGET / 100), lo = w[0] * 100, hi = w[1] * 100;
    var W = field.clientWidth || 600, H = field.clientHeight || 220, cell = Math.min(34, Math.floor(Math.sqrt(W * H / n))), cols;
    for (;; cell--) { cols = Math.max(1, Math.floor(W / cell)); if (Math.ceil(n / cols) * cell <= H || cell <= 3) break; }
    dots.style.setProperty("--cell", cell + "px"); dots.style.setProperty("--cols", cols);
    for (i = 0; i < MAXQ; i++) { qs[i].hidden = i >= n; if (i >= 12 || mode !== "list") qs[i].style.transform = ""; }
    meter.setAttribute("data-mode", mode);
    if (mode === "list") {                                 // each dot sits in front of its question
      var f = field.getBoundingClientRect();
      for (i = 0; i < 12; i++) {
        var s = slots[i].getBoundingClientRect(), d = qs[i];
        var dx = s.left + s.width / 2 - (f.left + d.offsetLeft + d.offsetWidth / 2), dy = s.top + s.height / 2 - (f.top + d.offsetTop + d.offsetHeight / 2);
        d.style.transform = "translate(" + dx.toFixed(1) + "px," + dy.toFixed(1) + "px) scale(" + (s.width / d.offsetWidth).toFixed(3) + ")";
      }
    }
    $("rate").textContent = pct(r); $("frac").textContent = k + " of " + n + " correct"; $("nq").textContent = n;
    $("point").style.left = pos(r) + "%";
    var a = showRange ? pos(lo) : pos(r), b = showRange ? pos(hi) : pos(r), range = $("range");
    range.style.left = a + "%"; range.style.width = (b - a) + "%"; range.className = "range" + (v === "pass" ? " pass" : v === "fail" ? " fail" : "");
    $("lo").style.left = "calc(" + a + "% - 8px)"; $("hi").style.left = "calc(" + b + "% + 8px)"; $("lo").textContent = pct(lo); $("hi").textContent = pct(hi);
    var chip = $("verdict"); chip.textContent = v === "pass" ? "Settled: passes" : v === "fail" ? "Settled: fails" : "Not settled";
    chip.className = "chip" + (v === "pass" ? " pass" : v === "fail" ? " fail" : "");
    slide.value = n;
  }
  function renderMeter(s, forward, arriving) {
    meter.classList.remove("live"); meter.setAttribute("data-range", s.range); meter.setAttribute("data-slider", s.slider);
    if (!s.slider) {
      drawMeter(12, s.mode, !!s.range);
      if (s.mode === "list" && arriving && !reduce && !still) {     // the questions come in one by one
        rows.forEach(function (r, i) { r.classList.add("pre"); qs[i].classList.add("pre"); later(function () { r.classList.remove("pre"); qs[i].classList.remove("pre"); }, 450 + i * 110); });
      } else rows.forEach(function (r, i) { r.classList.remove("pre"); qs[i].classList.remove("pre"); });
      return;
    }
    rows.forEach(function (r, i) { r.classList.remove("pre"); qs[i].classList.remove("pre"); });
    if (!forward || reduce || still) { drawMeter(320, "dots", true); return; }
    // The headline and the slider arrive first. Then the slider moves by itself once, slowly; after that it is the viewer's.
    drawMeter(12, "dots", true);
    later(function () {
      var t0 = performance.now(), dur = 6500, last = 12; meter.classList.add("live");
      (function tick(now) {
        var t = Math.max(0, Math.min(1, (now - t0) / dur)), e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        var n = Math.round((12 + (320 - 12) * e) / 4) * 4; if (n !== last) { last = n; drawMeter(n, "dots", true); }
        raf = t < 1 ? requestAnimationFrame(tick) : 0;
      })(t0);
    }, 2600);
  }
  slide.addEventListener("input", function () { stopAll(); meter.classList.add("live"); drawMeter(+slide.value, "dots", true); });
  slide.addEventListener("pointerdown", stopAll);

  // ------------------------------------------------------------------ before and after an update (step update)
  var uSlide = $("uSlide"), uAfter = $("uAfter"), UN = 16;
  [$("uBefore"), uAfter].forEach(function (el) { for (var i = 0; i < UN; i++) el.appendChild(document.createElement("i")); });
  function drawUpdate(k) {
    [].forEach.call(uAfter.children, function (d, i) { d.className = i >= k ? "fail" : ""; });
    $("uFrac").textContent = k + " of " + UN + " correct"; $("uN").textContent = k; uSlide.value = k;
    var p = S.fisher(UN, UN, k, UN), chip = $("uChip"), x = Math.round(p * 100);
    chip.className = "chip on " + (k === UN ? "none" : p < 0.05 ? "fail" : "");
    chip.textContent = k === UN ? "No drop" : p < 0.05 ? "Real drop" : "Could be chance";
    $("uLine").textContent = k === UN ? "" : "Chance alone would cause a drop this size " + (p < 0.01 ? "less than 1 time" : x >= 99 ? "almost every time" : "about " + x + " times") + (x >= 99 && p >= 0.01 ? "." : " in 100.");
  }
  function renderUpdate(forward) {
    if (!forward || reduce || still) { drawUpdate(9); return; }
    drawUpdate(16);                                      // first a small drop that could be chance, then a large one
    later(function () { drawUpdate(15); }, 2400); later(function () { drawUpdate(14); }, 2750);
    [13, 12, 11, 10, 9].forEach(function (k, i) { later(function () { drawUpdate(k); }, 5600 + i * 330); });
  }
  uSlide.addEventListener("input", function () { stopAll(); drawUpdate(+uSlide.value); });
  uSlide.addEventListener("pointerdown", stopAll);
  // after a drag the slider lets go of the keyboard, so the arrow keys move between steps again
  [slide, uSlide].forEach(function (el) { el.addEventListener("change", function () { el.blur(); }); });

  // ------------------------------------------------------------------ the dashboard: fill the window and back
  var appFrame = $("appFrame"), appFull = $("appFull");
  function setFull(on) { appFrame.parentNode.classList.toggle("full", on); appFull.textContent = on ? "Exit full screen" : "Full screen"; }
  appFull.addEventListener("click", function () { setFull(!appFrame.parentNode.classList.contains("full")); });

  // ------------------------------------------------------------------ step control
  var active = -1, layout = null, swapT = 0;
  function layoutOf(s) { return s.layout || "split"; }
  function apply(i) {
    var prev = active; if (i === prev) return; active = i; var s = STEPS[i];
    pipEls.forEach(function (b, k) { b.classList.toggle("on", k === i); b.classList.toggle("done", k < i); });
    count.textContent = (i + 1) + " / " + STEPS.length;
    backBtn.disabled = i === 0; nextBtn.textContent = i === STEPS.length - 1 ? "Homepage" : "Next";
    setFull(false); clearTimeout(swapT); stage.classList.remove("swap"); stopAll();
    if (document.activeElement === slide || document.activeElement === uSlide) document.activeElement.blur();
    if (layoutOf(s) === layout || prev < 0 || reduce || still) { render(i, prev); return; }
    // the layout changes here: fade out what is on screen first, so nothing is seen jumping
    stage.classList.add("swap");
    capEls.forEach(function (c) { c.classList.remove("on"); });
    Object.keys(views).forEach(function (k) { views[k].classList.remove("on"); });
    swapT = setTimeout(function () { stage.classList.remove("swap"); render(i, prev); }, 300);
  }
  function render(i, prev) {
    var s = STEPS[i], forward = i === prev + 1, arriving = !STEPS[prev] || STEPS[prev].view !== s.view;
    layout = layoutOf(s); stage.setAttribute("data-layout", layout); stage.setAttribute("data-step", s.id);
    capEls.forEach(function (c, k) { c.classList.toggle("on", k === i); c.setAttribute("aria-hidden", k === i ? "false" : "true"); });
    Object.keys(views).forEach(function (k) { views[k].classList.toggle("on", s.view === k); });
    if (s.intro) views.intro.setAttribute("data-level", s.intro);
    if (s.view === "app" && !appFrame.src) appFrame.src = appFrame.getAttribute("data-src");      // load the dashboard only when it is reached
    if (s.view === "meter") renderMeter(s, forward, arriving);
    if (s.view === "update") renderUpdate(forward);
  }
  function go(i) { apply(Math.max(0, Math.min(STEPS.length - 1, i))); }
  nextBtn.addEventListener("click", function () { if (active === STEPS.length - 1) location.href = "../index.html?v=20261116j"; else go(active + 1); });   // the last step leads back to the front page
  backBtn.addEventListener("click", function () { go(active - 1); });
  window.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { setFull(false); return; }
    if (e.target === slide || e.target === uSlide) return;                          // a slider keeps its own arrow keys while it is held
    if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "PageDown" || e.key === " " || e.key === "Enter") { if (e.target.tagName === "BUTTON" && (e.key === " " || e.key === "Enter")) return; e.preventDefault(); go(active + 1); }
    if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "PageUp") { e.preventDefault(); go(active - 1); }
  });
  var wheelLock = 0;
  window.addEventListener("wheel", function (e) {
    if (Math.abs(e.deltaY) < 14) return;
    var now = Date.now(); if (now < wheelLock) return; wheelLock = now + 950;
    go(active + (e.deltaY > 0 ? 1 : -1));
  }, { passive: true });
  var touchY = null;
  window.addEventListener("touchstart", function (e) { touchY = e.target === slide || e.target === uSlide ? null : e.touches[0].clientY; }, { passive: true });
  window.addEventListener("touchend", function (e) {
    if (touchY == null) return; var dy = e.changedTouches[0].clientY - touchY; touchY = null;
    if (Math.abs(dy) > 60) go(active + (dy < 0 ? 1 : -1));
  }, { passive: true });
  var resizeT;
  function redraw() { var s = STEPS[active]; if (s && s.view === "meter") drawMeter(+slide.value, meter.getAttribute("data-mode"), s.range === 1); }
  window.addEventListener("resize", function () { clearTimeout(resizeT); resizeT = setTimeout(redraw, 80); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(redraw);

  apply(0);
  // ?step=5 opens a given step with every animation finished (used for screenshots and for linking to a step)
  var qsn = /[?&]step=(\d+)/.exec(location.search);
  if (qsn) {
    document.documentElement.classList.add("still");
    var jump = function () { active = -1; for (var k = 0; k <= Math.min(+qsn[1], STEPS.length - 1); k++) apply(k); };
    jump(); window.addEventListener("load", jump); if (document.fonts && document.fonts.ready) document.fonts.ready.then(jump);
  }
  window.__walk = { go: go };
})();
