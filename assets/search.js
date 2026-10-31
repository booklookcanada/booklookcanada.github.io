/* BookLook directory search — ONE implementation for the front door and the
   browse-by-size page (Phase 1, WS2). Per-page behaviour is set by the page in
   window.BL_SEARCH before this file loads: {prefix, strips, titlecase}.
   The index is a static file from this same site and the search runs entirely
   on this device; nothing typed here is sent anywhere.
   There is deliberately NO fallback index: if the real directory cannot be
   loaded and verified, search says so instead of quietly searching a sample. */
(function () {
  "use strict";
  var CFG = window.BL_SEARCH || {};
  var PREFIX = CFG.prefix || "charity/";
  var STRIPS = !!CFG.strips;
  var TITLECASE = !!CFG.titlecase;
  var inp = document.getElementById("q");
  var box = document.getElementById("results");
  if (!inp || !box) return;
  var rnd = document.getElementById("randomBtn");

  var IDX = null;    // validated index entries, as filed
  var NORM = null;   // parallel to IDX: precomputed match forms
  var state = "loading"; // "loading" | "ready" | "error"
  var curHits = [];  // entries currently rendered (at most 60)
  var active = -1;   // keyboard-active result index, -1 = none

  // ---------- text helpers ----------
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  /* Match normalization, applied identically to the query and to every name:
     lower-case, apostrophes removed (so "bnai brith" matches B'NAI B'RITH),
     other punctuation becomes a space, whitespace collapsed. */
  function normName(s) {
    return (s || "").toLowerCase()
      .replace(/['\u2019\u02BC`]/g, "")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ").trim();
  }
  function bnForm(s) { return (s || "").toUpperCase().replace(/[^0-9A-Z]/g, ""); }
  function bnDigits(s) { return (s || "").replace(/[^0-9]/g, ""); }

  var STOP = { of: 1, the: 1, and: 1, de: 1, la: 1, le: 1, du: 1, des: 1, au: 1, aux: 1, en: 1, for: 1 };
  var KEEP = { YMCA: 1, YWCA: 1, CRA: 1 };
  function displayName(n) {
    if (!TITLECASE) return n;
    if (n !== n.toUpperCase()) return n;
    return n.toLowerCase().split(" ").map(function (w, i) {
      if (!w) return w;
      if (KEEP[w.toUpperCase()]) return w.toUpperCase();
      if (i > 0 && STOP[w]) return w;
      return w.split("-").map(function (part) {
        return part.replace(/(^|')([a-z])/g, function (m, p, c) { return p + c.toUpperCase(); });
      }).join("-");
    }).join(" ");
  }
  function cityName(c) {
    if (!c) return "";
    if (!TITLECASE) return c;
    return c.charAt(0) + c.slice(1).toLowerCase();
  }
  function stripFor(r) {
    if (!r.rev || !r.rev.total) return "";
    var parts = [["don", "#C8743A"], ["gov", "#7A5C45"], ["gift", "#D9B26F"], ["else", "#B8B0A4"]];
    var h = '<div class="strip mini" style="margin:0">';
    parts.forEach(function (p) {
      var v = r.rev[p[0]];
      if (v) h += '<div class="seg" style="flex:' + v + ' 1 0;background:' + p[1] + '"></div>';
    });
    return h + "</div>";
  }

  // ---------- ARIA wiring (identical on both pages) ----------
  inp.setAttribute("role", "combobox");
  inp.setAttribute("aria-expanded", "false");
  inp.setAttribute("aria-controls", "results");
  inp.setAttribute("aria-autocomplete", "list");
  box.setAttribute("role", "listbox");
  if (!box.getAttribute("aria-live")) box.setAttribute("aria-live", "polite");
  function syncAria(expanded) {
    inp.setAttribute("aria-expanded", expanded ? "true" : "false");
    if (active < 0) inp.removeAttribute("aria-activedescendant");
  }

  // ---------- states ----------
  function loadingHTML() { return '<p class="sstat" role="status">Loading the directory\u2026</p>'; }
  function errorHTML() {
    return '<div class="serror" role="alert"><p>The directory couldn\u2019t load, so search is unavailable right now. ' +
      'Check your connection, then try again. Search runs on your device, so nothing you typed was sent anywhere.</p>' +
      '<p><button type="button" class="sretry" data-retry="1">Try loading again</button></p></div>';
  }
  function setStatus(html) { box.innerHTML = html; curHits = []; active = -1; syncAria(true); }

  function validate(d) {
    if (!d || Object.prototype.toString.call(d) !== "[object Array]" || !d.length) return false;
    for (var i = 0; i < d.length; i++) {
      var e = d[i];
      if (!e || typeof e.b !== "string" || typeof e.n !== "string") return false;
    }
    return true;
  }
  function loadIndex() {
    state = "loading"; IDX = null; NORM = null;
    setStatus(loadingHTML());
    fetch("search-index.json").then(function (r) {
      if (!r.ok) throw new Error("index HTTP " + r.status);
      return r.json();
    }).then(function (d) {
      if (!validate(d)) throw new Error("index malformed");
      IDX = d;
      NORM = d.map(function (e) {
        return { n: normName(e.n), a: normName(e.a), b: bnForm(e.b), d: bnDigits(e.b) };
      });
      state = "ready";
      render();
    }).catch(function () {
      state = "error"; IDX = null; NORM = null;
      render();
    });
  }

  // ---------- matching & rendering ----------
  function render() {
    var raw = inp.value || "";
    var q = normName(raw);
    var qbn = bnForm(raw);
    active = -1;
    if (state === "loading") { setStatus(loadingHTML()); return; }
    if (state === "error") { setStatus(errorHTML()); return; }
    if (q.length < 2 && qbn.length < 2) { box.innerHTML = ""; curHits = []; syncAria(false); return; }
    var scored = [];
    for (var i = 0; i < IDX.length; i++) {
      var nz = NORM[i], tier = -1;
      if (qbn && (nz.b === qbn || (nz.d && nz.d === qbn))) tier = 0;          // exact business number
      else if (q && (nz.n === q || (nz.a && nz.a === q))) tier = 1;          // exact name
      else if (q && nz.n.indexOf(q) === 0) tier = 2;                          // name starts with query
      else if (q && nz.n.indexOf(q) >= 0) tier = 3;                           // name contains query
      else if ((q && nz.a && nz.a.indexOf(q) >= 0) || (qbn && nz.b.indexOf(qbn) >= 0)) tier = 4;
      if (tier >= 0) scored.push([tier, i]);
    }
    scored.sort(function (x, y) { return x[0] - y[0] || x[1] - y[1]; });
    var total = scored.length;
    curHits = scored.slice(0, 60).map(function (s) { return IDX[s[1]]; });
    if (!total) {
      box.innerHTML = '<p class="noresult">No charity here matches that. Check the spelling, or try the business number.</p>';
      syncAria(true);
      return;
    }
    var h = '<p class="sstat" role="status">' +
      (total > 60 ? "Showing 60 of " + total.toLocaleString("en-CA") + " matches"
                  : (total === 1 ? "1 match" : total + " matches")) + "</p>";
    h += curHits.map(function (e, i) {
      var name = esc(displayName(e.n));
      var small = (e.c ? esc(cityName(e.c)) + " \u00b7 " : "") + "Business number " + esc(e.b);
      var link = '<a href="' + PREFIX + esc(e.b) + '.html">' + name + "</a>" +
                 '<div class="small">' + small + "</div>";
      if (STRIPS) {
        return '<div class="result" role="option" id="bl-opt-' + i + '" data-bn="' + esc(e.b) +
               '" aria-selected="false"><div class="rmain">' + link + '</div><div class="rstrip">' +
               stripFor(e) + "</div></div>";
      }
      return '<div class="result" role="option" id="bl-opt-' + i + '" data-bn="' + esc(e.b) +
             '" aria-selected="false"><div>' + link + "</div></div>";
    }).join("");
    box.innerHTML = h;
    syncAria(true);
  }

  function paintActive() {
    var opts = box.querySelectorAll(".result");
    for (var i = 0; i < opts.length; i++) {
      var on = i === active;
      if (on) opts[i].classList.add("kb-on"); else opts[i].classList.remove("kb-on");
      opts[i].setAttribute("aria-selected", on ? "true" : "false");
    }
    if (active >= 0) {
      inp.setAttribute("aria-activedescendant", "bl-opt-" + active);
      if (opts[active] && opts[active].scrollIntoView) opts[active].scrollIntoView({ block: "nearest" });
    } else {
      inp.removeAttribute("aria-activedescendant");
    }
  }

  inp.addEventListener("input", render);
  inp.addEventListener("keydown", function (ev) {
    var n = curHits.length;
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      if (!n) return;
      ev.preventDefault();
      active = ev.key === "ArrowDown" ? Math.min(active + 1, n - 1) : Math.max(active - 1, 0);
      paintActive();
    } else if (ev.key === "Enter") {
      if (active >= 0 && curHits[active]) {
        ev.preventDefault();
        window.location.href = PREFIX + curHits[active].b + ".html";
      }
    } else if (ev.key === "Escape") {
      if (active >= 0) { active = -1; paintActive(); }
    }
  });
  box.addEventListener("click", function (ev) {
    var t = ev.target;
    if (t && t.getAttribute && t.getAttribute("data-retry")) loadIndex();
  });
  if (rnd) {
    rnd.addEventListener("click", function () {
      if (state === "ready" && IDX && IDX.length) {
        var pick = IDX[Math.floor(Math.random() * IDX.length)];
        window.location.href = PREFIX + pick.b + ".html";
      } else if (state === "loading") {
        setStatus('<p class="sstat" role="status">Loading the directory\u2026 one moment.</p>');
      } else {
        setStatus(errorHTML());
      }
    });
  }

  loadIndex();
})();
