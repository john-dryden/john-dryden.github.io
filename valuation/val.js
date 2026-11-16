/* Walkthrough 3: the comps dashboard. The story is before and after: one table, first as a spreadsheet typed by
   hand, then as the dashboard filling itself, then what else the same figures feed, then the dashboard.
   It plays like a video that pauses: Next, the arrow keys, the mouse wheel, a swipe or the progress bar.
   The nine companies are the dashboard's first peer group: real companies, public figures. The ROWS block and the
   HOME line are written by tools/build_comps_dashboard.py from the same data file as the dashboard. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches, still = /[?&]step=\d/.test(location.search);
  var TOTAL = 52;   // companies in the dashboard
  var HOME = "Tradeweb Markets", AS_OF = "November 16, 2026";

  // name, ticker, share price, market cap ($m), enterprise value ($m), EV/revenue, EV/EBITDA, P/E, revenue growth (%). null = not meaningful
  var ROWS = [
    ["CME Group", "CME-US", 318.66, 114059, 115155, 16.2, 18.2, 25.7, 7.0],
    ["Intercontinental Exchange", "ICE-US", 177.56, 99231, 119559, 10.8, 16.6, 21.7, 6.5],
    ["Nasdaq", "NDAQ-US", 108.08, 59980, 67885, 11.5, 19.8, 26.1, 9.1],
    ["Cboe Global Markets", "CBOE-US", 375.85, 39212, 37952, 13.1, 21.6, 26.1, 3.8],
    ["Tradeweb Markets", "TW-US", 132.28, 28327, 26361, 11.2, 16.1, 32.3, 14.1],
    ["TMX Group", "X-CA", 44.68, 12288, 13871, 10.1, null, 25.3, 13.5],
    ["Miami International", "MIAX-US", 37.44, 3746, 3050, 5.7, 19.7, 21.5, 7.0],
    ["MarketAxess", "MKTX-US", 165.38, 5822, 5533, 6.2, 11.7, 21.1, 5.8],
    ["OTC Markets Group", "OTCM-US", 52.01, 623, 583, 4.2, 12.9, 18.1, 6.7]
  ];
  var COLS = ["Share price", "Mkt cap", "EV", "EV / Revenue", "EV / EBITDA", "P / E"];
  var DRIFT = [-0.031, 0.022, -0.017, 0.04, -0.026, 0.013, -0.035, 0.028, -0.019];   // how far each company's old figures are from today's
  function typed(c, v) { return v == null ? "nm" : c === 0 ? v.toFixed(2) : c < 3 ? String(Math.round(v)) : v.toFixed(1); }
  function shown(c, v) { return v == null ? "nm" : c === 0 ? "$" + v.toFixed(2) : c < 3 ? "$" + Math.round(v).toLocaleString("en-US") : v.toFixed(1) + "x"; }

  // ------------------------------------------------------------------ steps
  var STEPS = [
    { id: "goal", layout: "intro", view: "intro", intro: 1 },
    { id: "problem", layout: "intro", view: "intro", intro: 2 },
    { id: "solution", layout: "intro", view: "intro", intro: 3 },
    { id: "before", view: "sheet", mode: "before",
      h: "Before: every number typed in by hand.",
      p: "Look up a figure, type it over the old one, move to the next cell. Then the next company, 52 in all." },
    { id: "after", view: "sheet", mode: "after",
      h: "Now: the figures arrive on their own.",
      p: "The dashboard pulls current prices and forecasts for all 52 companies and recalculates every ratio." },
    { id: "extras", view: "extras",
      h: "The analysis is automated too.",
      p: "The same figures feed three more tabs. Nothing in them is built by hand." },
    { id: "app", layout: "app", view: "app",
      h: "This is the dashboard.",
      p: "Real companies and public figures, as of " + AS_OF + "." }
  ];

  // ------------------------------------------------------------------ elements
  var stage = $("stage"), caps = $("caps"), rail = $("rail"), count = $("count"), nextBtn = $("next"), backBtn = $("back");
  var views = {}; ["intro", "sheet", "extras", "app"].forEach(function (v) { views[v] = $("v-" + v); });
  var capEls = [], pipEls = [];
  STEPS.forEach(function (s, i) {
    var c = document.createElement("section"); c.className = "cap";
    c.innerHTML = (s.h ? "<h2>" + s.h + "</h2>" : "") + (s.p ? "<p>" + s.p + "</p>" : "");
    caps.appendChild(c); capEls.push(c);
    var b = document.createElement("button"); b.type = "button"; b.className = "pip"; b.setAttribute("aria-label", "Step " + (i + 1) + " of " + STEPS.length);
    b.addEventListener("click", function () { go(i); }); rail.appendChild(b); pipEls.push(b);
  });

  // ------------------------------------------------------------------ the table
  var win = $("win"), grid = $("grid"), tallyA = $("tallyA"), tallyB = $("tallyB"), chip = $("chip"), fxRef = $("fxRef"), fxVal = $("fxVal");
  var cells = [], timers = [];
  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function stopTimers() { timers.forEach(clearTimeout); timers = []; }
  function add(cls, text, c) { var e = document.createElement("div"); e.className = cls; if (text != null) e.textContent = text; if (c != null) e.setAttribute("data-c", c); grid.appendChild(e); return e; }
  (function build() {
    add("lt corner", ""); add("lt", "A");
    COLS.forEach(function (n, c) { add("lt", "BCDEFG".charAt(c), c); });
    add("rn", "1"); add("hd", "Company");
    COLS.forEach(function (n, c) { add("hd num", n, c); });
    ROWS.forEach(function (row, r) {
      add("rn", String(r + 2));
      var nm = add("nm"); nm.innerHTML = "<b>" + row[0] + "</b><span class='tk'>" + row[1] + "</span>";
      COLS.forEach(function (n, c) { var e = add("c", "", c); cells.push({ el: e, r: r, c: c, now: row[c + 2], old: row[c + 2] == null ? null : row[c + 2] / (1 + DRIFT[r]) }); });
    });
  })();
  function visible() { return cells.filter(function (k) { return k.el.offsetParent !== null; }); }
  function setCell(k, fresh) { k.el.textContent = shown(k.c, fresh ? k.now : k.old); k.el.classList.toggle("new", fresh); k.el.classList.remove("act", "flash"); }

  // Before: the cursor goes from cell to cell and types each new number over the old one.
  function startBefore() {
    stopTimers(); win.setAttribute("data-mode", "before"); chip.classList.remove("live");
    cells.forEach(function (k) { setCell(k, false); });
    var seq = visible(), perRow = seq.filter(function (k) { return k.r === 0; }).length, done = 0;
    tallyA.textContent = "0"; fxVal.textContent = "";
    function ref(k) { fxRef.textContent = "BCDEFG".charAt(k.c) + (k.r + 2); }
    if (still || reduce) {                                   // a finished picture: two companies done, the third begun
      seq.forEach(function (k) { if (k.r < 2) setCell(k, true); });
      tallyA.textContent = "2"; var k0 = seq[perRow * 2]; k0.el.classList.add("act"); ref(k0); fxVal.textContent = typed(k0.c, k0.now).slice(0, 3); k0.el.textContent = fxVal.textContent;
      return;
    }
    function cell(i) {
      if (i >= seq.length) { fxVal.textContent = ""; return; }
      var k = seq[i], text = typed(k.c, k.now), n = 0;
      k.el.classList.add("act"); k.el.textContent = ""; ref(k); fxVal.textContent = "";
      (function key() {
        n++; fxVal.textContent = k.el.textContent = text.slice(0, n);
        if (n < text.length) { later(key, 70); return; }
        later(function () {
          setCell(k, true);
          if ((i + 1) % perRow === 0) { done++; tallyA.textContent = String(done); }
          later(function () { cell(i + 1); }, 150);
        }, 240);
      })();
    }
    later(function () { cell(0); }, 1500);                    // time to read the sentence first
  }

  // After: the same table as the dashboard shows it. Every cell is filled without anyone typing.
  function startAfter() {
    stopTimers(); cells.forEach(function (k) { k.el.classList.remove("act", "flash"); if (!k.el.textContent) setCell(k, false); });
    win.setAttribute("data-mode", "after"); chip.classList.remove("live"); fxVal.textContent = "";
    var seq = visible(), from = +tallyA.textContent || 0;
    if (still || reduce) { cells.forEach(function (k) { setCell(k, true); }); tallyB.textContent = String(TOTAL); chip.classList.add("live"); return; }
    tallyB.textContent = String(from);
    var t0 = 1500, gap = 26, span = seq.length * gap;
    seq.forEach(function (k, i) { later(function () { setCell(k, true); k.el.classList.add("flash"); }, t0 + i * gap); });
    for (var n = from + 1; n <= TOTAL; n++) (function (n) { later(function () { tallyB.textContent = String(n); if (n === TOTAL) chip.classList.add("live"); }, t0 + (n - from) / (TOTAL - from) * span); })(n);
  }

  // ------------------------------------------------------------------ what the figures feed (step 6)
  (function extras() {
    // chart: price (P/E) against growth, with the straight line that fits the nine companies best
    var W = 320, H = 220, L = 14, R = 12, T = 22, B = 26, x0 = 0, x1 = 19, y0 = 6, y1 = 35;
    function X(v) { return L + (v - x0) / (x1 - x0) * (W - L - R); } function Y(v) { return H - B - (v - y0) / (y1 - y0) * (H - T - B); }
    var PTS = ROWS.filter(function (r) { return r[7] != null && r[8] != null; }), n = PTS.length, sx = 0, sy = 0, sxx = 0, sxy = 0;
    PTS.forEach(function (r) { sx += r[8]; sy += r[7]; sxx += r[8] * r[8]; sxy += r[8] * r[7]; });
    var slope = (n * sxy - sx * sy) / (n * sxx - sx * sx), icpt = (sy - slope * sx) / n, svg = "";
    [12, 20, 28].forEach(function (v) { svg += "<line class='gridl' x1='" + L + "' x2='" + (W - R) + "' y1='" + Y(v) + "' y2='" + Y(v) + "'/>"; });
    svg += "<line class='fit' x1='" + X(1.5) + "' y1='" + Y(icpt + slope * 1.5) + "' x2='" + X(18.5) + "' y2='" + Y(icpt + slope * 18.5) + "'/>";
    PTS.forEach(function (r) { var hi = r[0] === HOME; svg += "<circle" + (hi ? " class='hi'" : "") + " cx='" + X(r[8]) + "' cy='" + Y(r[7]) + "' r='" + (hi ? 7 : 5.5) + "'/>" + (hi ? "<text x='" + (X(r[8]) - 12) + "' y='" + (Y(r[7]) + 4) + "' text-anchor='end'>" + r[0] + "</text>" : ""); });
    svg += "<text class='ax' x='" + L + "' y='12'>&uarr; higher price</text><text class='ax' x='" + (W - R) + "' y='" + (H - 6) + "' text-anchor='end'>faster growth &rarr;</text>";
    $("chart").innerHTML = "<svg viewBox='0 0 " + W + " " + H + "' role='img' aria-label='Price against growth for nine companies, with a trend line'>" + svg + "</svg>";

    // valuation tool: the peers' multiples on a line, their median, and what it makes a company worth
    var m = ROWS.map(function (r) { return r[6]; }).filter(function (v) { return v != null; }).sort(function (a, b) { return a - b; }), med = m.length % 2 ? m[(m.length - 1) / 2] : (m[m.length / 2 - 1] + m[m.length / 2]) / 2, s = "";
    function P(v) { return (v - 3) / (24 - 3) * 100; }
    m.forEach(function (v) { s += "<i style='left:" + P(v) + "%'></i>"; });
    s += "<u style='left:" + P(med) + "%'><span>median " + med.toFixed(1) + "x</span></u>";
    $("strip").innerHTML = s; $("vtMed").textContent = med.toFixed(1) + "x"; $("vtOut").textContent = "$" + (1.0 * med).toFixed(1) + "bn";

    var docs = ["Annual report", "Quarterly report", "Annual report", "Quarterly report", "Annual report", "Annual report", "Quarterly report"], f = "";
    docs.forEach(function (d, i) { f += "<div><span>" + ROWS[i][0] + "</span><b>" + d + " &#8599;</b></div>"; });
    $("filings").innerHTML = f;
  })();

  // ------------------------------------------------------------------ the dashboard: fill the window and back
  var appFrame = $("appFrame"), appFull = $("appFull");
  function setFull(on) { appFrame.parentNode.classList.toggle("full", on); appFull.textContent = on ? "Exit full screen" : "Full screen"; }
  appFull.addEventListener("click", function () { setFull(!appFrame.parentNode.classList.contains("full")); });

  // ------------------------------------------------------------------ step control
  var active = -1, layout = null, swapT = 0;
  function layoutOf(s) { return s.layout || "board"; }
  function unselect() { var sel = window.getSelection && window.getSelection(); if (sel && sel.removeAllRanges) sel.removeAllRanges(); }
  function apply(i) {
    var prev = active; if (i === prev) return; active = i; var s = STEPS[i];
    pipEls.forEach(function (b, k) { b.classList.toggle("on", k === i); b.classList.toggle("done", k < i); });
    count.textContent = (i + 1) + " / " + STEPS.length;
    backBtn.disabled = i === 0; nextBtn.textContent = i === STEPS.length - 1 ? "Homepage" : "Next";
    setFull(false); unselect(); clearTimeout(swapT); stage.classList.remove("swap");
    if (layoutOf(s) === layout || prev < 0 || reduce || still) { render(i); return; }
    // the layout changes here: fade out what is on screen first, so nothing is seen jumping
    stage.classList.add("swap"); stopTimers();
    capEls.forEach(function (c) { c.classList.remove("on"); });
    Object.keys(views).forEach(function (k) { views[k].classList.remove("on"); });
    swapT = setTimeout(function () { stage.classList.remove("swap"); render(i); }, 300);
  }
  function render(i) {
    var s = STEPS[i]; layout = layoutOf(s); stage.setAttribute("data-layout", layout); stage.setAttribute("data-step", s.id);
    capEls.forEach(function (c, k) { c.classList.toggle("on", k === i); c.setAttribute("aria-hidden", k === i ? "false" : "true"); });
    Object.keys(views).forEach(function (k) { views[k].classList.toggle("on", s.view === k); });
    if (s.intro) views.intro.setAttribute("data-level", s.intro);
    if (s.view === "app" && !appFrame.src) appFrame.src = appFrame.getAttribute("data-src");      // load the dashboard only when it is reached
    if (s.view !== "sheet") stopTimers(); else if (s.mode === "before") startBefore(); else startAfter();
  }
  function go(i) { apply(Math.max(0, Math.min(STEPS.length - 1, i))); }
  nextBtn.addEventListener("click", function () { if (active === STEPS.length - 1) location.href = "../index.html?v=20261116j"; else go(active + 1); });   // the last step leads back to the front page
  backBtn.addEventListener("click", function () { go(active - 1); });
  window.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { setFull(false); return; }
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
  window.addEventListener("touchstart", function (e) { touchY = e.touches[0].clientY; }, { passive: true });
  window.addEventListener("touchend", function (e) {
    if (touchY == null) return; var dy = e.changedTouches[0].clientY - touchY; touchY = null;
    if (Math.abs(dy) > 60) go(active + (dy < 0 ? 1 : -1));
  }, { passive: true });

  cells.forEach(function (k) { setCell(k, false); });
  apply(0);
  // ?step=5 opens a given step with every animation finished (used for screenshots and for linking to a step)
  var qsn = /[?&]step=(\d+)/.exec(location.search);
  if (qsn) { document.documentElement.classList.add("still"); active = -1; for (var k = 0; k <= Math.min(+qsn[1], STEPS.length - 1); k++) apply(k); }
  window.__walk = { go: go };
})();
