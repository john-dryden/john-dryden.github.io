/* The statistics behind Providence, ported to JavaScript from providence/stats.py so that every number
   on these pages is computed, not typed in. Checked against the values in Providence's own demo
   (see tools/check_providence_stats.js).
     wilson(k, n)            range the real pass rate could be in (Wilson score interval, 95%), as fractions
     verdict(k, n, target)   "pass" | "open-pass" | "open-fail" | "fail"   (open = not settled)
     fisher(k1, n1, k2, n2)  chance that a difference this large is luck (Fisher's exact test, two-sided)
     holm(pValues)           the same chances, adjusted for checking several tests at once (Holm-Bonferroni)
     needed(k, n, target)    total questions at which the verdict settles with 80% probability, or null */
(function (root) {
  "use strict";
  var Z = 1.959963984540054;

  function wilson(k, n) {
    var p = k / n, z2 = Z * Z, d = 1 + z2 / n, c = (p + z2 / (2 * n)) / d, h = Z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n)) / d;
    return [Math.max(0, c - h), Math.min(1, c + h)];
  }
  function verdict(k, n, t) {
    var w = wilson(k, n), r = k / n;
    return w[0] >= t ? "pass" : r >= t ? "open-pass" : w[1] < t ? "fail" : "open-fail";
  }

  var G = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.001208650973866179, -0.000005395239384953];
  function lgamma(x) {                                   // Lanczos approximation, accurate to about 1e-10 here
    var y = x, t = x + 5.5, s = 1.000000000190015; t -= (x + 0.5) * Math.log(t);
    for (var j = 0; j < 6; j++) s += G[j] / ++y;
    return -t + Math.log(2.5066282746310005 * s / x);
  }
  function logComb(n, k) { return k < 0 || k > n ? -Infinity : lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1); }

  function fisher(ka, na, kb, nb) {
    var tp = ka + kb, den = logComb(na + nb, tp);
    function lp(k) { return logComb(na, k) + logComb(nb, tp - k) - den; }
    var cut = lp(ka) + 1e-7, p = 0;
    for (var k = Math.max(0, tp - nb); k <= Math.min(tp, na); k++) { var v = lp(k); if (v <= cut) p += Math.exp(v); }
    return Math.min(1, p);
  }
  function holm(ps) {
    var order = ps.map(function (_, i) { return i; }).sort(function (a, b) { return ps[a] - ps[b]; }), out = [], run = 0;
    order.forEach(function (idx, rank) { run = Math.max(run, (ps.length - rank) * ps[idx]); out[idx] = Math.min(1, run); });
    return out;
  }

  function logPmf(k, n, p) {
    if (p <= 0) return k === 0 ? 0 : -Infinity;
    if (p >= 1) return k === n ? 0 : -Infinity;
    return logComb(n, k) + k * Math.log(p) + (n - k) * Math.log(1 - p);
  }
  function tail(from, to, n, p) { var s = 0; for (var k = Math.max(0, from); k <= Math.min(n, to); k++) s += Math.exp(logPmf(k, n, p)); return Math.min(1, s); }
  function power(n, rate, t, pass) {                     // chance that the verdict settles with n questions
    var lo, hi, mid;
    if (pass) {
      if (wilson(n, n)[0] < t) return 0;
      for (lo = 0, hi = n; lo < hi;) { mid = (lo + hi) >> 1; if (wilson(mid, n)[0] >= t) hi = mid; else lo = mid + 1; }
      return tail(lo, n, n, rate);
    }
    if (wilson(0, n)[1] >= t) return 0;
    for (lo = 0, hi = n; lo < hi;) { mid = (lo + hi + 1) >> 1; if (wilson(mid, n)[1] < t) lo = mid; else hi = mid - 1; }
    return tail(0, lo, n, rate);
  }
  function needed(k, n, t) {
    var rate = k / n, pass = rate >= t, v = verdict(k, n, t);
    if (v === "pass" || v === "fail") return n;
    if (rate === t) return null;
    var hi = Math.max(n, 8); while (hi <= 200000 && power(hi, rate, t, pass) < 0.8) hi *= 2;
    if (hi > 200000) return null;
    for (var lo = n; lo < hi;) { var mid = (lo + hi) >> 1; if (power(mid, rate, t, pass) >= 0.8) hi = mid; else lo = mid + 1; }
    return hi;
  }

  root.PStats = { wilson: wilson, verdict: verdict, fisher: fisher, holm: holm, needed: needed };
})(typeof window !== "undefined" ? window : globalThis);
