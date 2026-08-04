/**
 * growth.js — Proven Growth Dashboard (icecollective.com/proven/growth).
 *
 * Manager-only view of how the offices are growing: volume (CS / SRA / CAP /
 * Installs from the internal Discord-fed deals), active headcount (distinct
 * reps with a deal in the month), and new recruits + activation (from the
 * Roster Log daily snapshot, served by ?action=growth).
 *
 * Self-contained IIFE like completion.js — shares the leaderboard's login
 * session (same localStorage token key) but talks to its own token-gated,
 * allowlist-restricted endpoint. Access is granted per-person via the
 * GROWTH_ACCESS_PHONES Script Property; everyone else gets a no-access card.
 *
 * v1 data = internal deals only. Tableau-fed metrics (IC, PTO, deeper SRA/CAP)
 * plug in later as new entries in the METRICS array; Plata becomes a real
 * scope once its roster source exists (tab stays as a disabled placeholder).
 */
(function () {
  "use strict";

  var API_URL = "https://script.google.com/macros/s/AKfycbwAum0sv4KhswD0Svr2QWEdBw4cP2K-_wg_bBzkA4lNAgWDX58JX4ODT9xRXxljqR5T/exec";
  var DEBUG = /[?&]debug=1/.test(location.search);

  // Leadership/admin names excluded from headcount + activity math (same list
  // the leaderboard hides from the board).
  var HIDDEN_REPS = ["justin wall", "meredith fields", "erin wall", "connor fouts", "kelton higgins"];

  // ---- tiny utils ----------------------------------------------------------
  function normalizeName(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function isValidSetterName(name) {
    var norm = normalizeName(name);
    if (!norm) return false;
    return norm !== "idk" && norm !== "unknown" && norm !== "n/a" && norm !== "na";
  }
  function isHidden(norm) { return HIDDEN_REPS.indexOf(norm) !== -1; }

  // ---- auth (copied from leaderboard-v2.js — same token => shared session) --
  var AUTH_KEY = "pl_session_token";
  function getSessionToken() { try { return localStorage.getItem(AUTH_KEY) || ""; } catch (e) { return ""; } }
  function setSessionToken(t) { try { localStorage.setItem(AUTH_KEY, t); } catch (e) {} }
  function clearSessionToken() { try { localStorage.removeItem(AUTH_KEY); } catch (e) {} }

  async function loginRequestCode(phone) {
    var res = await fetch(API_URL + "?action=requestCode&phone=" + encodeURIComponent(phone));
    return res.json();
  }
  async function loginVerifyCode(phone, code) {
    var res = await fetch(API_URL + "?action=verifyCode&phone=" + encodeURIComponent(phone) + "&code=" + encodeURIComponent(code));
    return res.json();
  }

  function ensureLoginOverlay() {
    if (document.getElementById("pl-login-overlay")) return;
    var o = document.createElement("div");
    o.id = "pl-login-overlay";
    o.className = "pl-modal";
    o.innerHTML =
      '<div class="pl-login-card">' +
        '<div class="pl-login-logo">PROVEN<span>GROWTH</span></div>' +
        '<div class="pl-login-title">Manager sign in</div>' +
        '<div class="pl-login-sub">Enter your phone number and we’ll text you a code.</div>' +
        '<div id="pl-login-step1">' +
          '<input id="pl-login-phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="(555) 555-5555">' +
          '<button id="pl-login-send" type="button" class="pl-login-btn">Text me a code</button>' +
        '</div>' +
        '<div id="pl-login-step2" style="display:none">' +
          '<input id="pl-login-code" type="text" inputmode="numeric" autocomplete="one-time-code" placeholder="6-digit code">' +
          '<button id="pl-login-verify" type="button" class="pl-login-btn">Verify & sign in</button>' +
          '<button id="pl-login-back" type="button" class="pl-login-linkbtn">Use a different number</button>' +
        '</div>' +
        '<div id="pl-login-msg" class="pl-login-msg"></div>' +
      '</div>';
    document.body.appendChild(o);

    var phoneEl = o.querySelector("#pl-login-phone");
    var codeEl = o.querySelector("#pl-login-code");
    var msgEl = o.querySelector("#pl-login-msg");
    var step1 = o.querySelector("#pl-login-step1");
    var step2 = o.querySelector("#pl-login-step2");
    var sendBtn = o.querySelector("#pl-login-send");
    var verifyBtn = o.querySelector("#pl-login-verify");
    var setMsg = function (t, err) { msgEl.textContent = t || ""; msgEl.className = "pl-login-msg" + (err ? " pl-login-err" : ""); };

    sendBtn.addEventListener("click", async function () {
      var phone = (phoneEl.value || "").trim();
      if (phone.replace(/\D/g, "").length < 10) { setMsg("Enter a valid 10-digit phone number.", true); return; }
      sendBtn.disabled = true; setMsg("Sending…");
      try {
        var r = await loginRequestCode(phone);
        if (r && r.ok) { step1.style.display = "none"; step2.style.display = "block"; setMsg("Code sent. Check your texts."); codeEl.focus(); }
        else { setMsg((r && r.error) || "Couldn't send a code.", true); }
      } catch (e) { setMsg("Network error. Try again.", true); }
      sendBtn.disabled = false;
    });

    verifyBtn.addEventListener("click", async function () {
      var phone = (phoneEl.value || "").trim();
      var code = (codeEl.value || "").trim();
      if (!code) { setMsg("Enter the code we texted you.", true); return; }
      verifyBtn.disabled = true; setMsg("Verifying…");
      try {
        var r = await loginVerifyCode(phone, code);
        if (r && r.ok && r.token) { setSessionToken(r.token); setMsg("Signed in."); hideLoginOverlay(); bootGrowth(); }
        else { setMsg((r && r.error) || "That code wasn't right.", true); verifyBtn.disabled = false; }
      } catch (e) { setMsg("Network error. Try again.", true); verifyBtn.disabled = false; }
    });

    o.querySelector("#pl-login-back").addEventListener("click", function () {
      step2.style.display = "none"; step1.style.display = "block"; setMsg(""); phoneEl.focus();
    });
    codeEl.addEventListener("keydown", function (e) { if (e.key === "Enter") verifyBtn.click(); });
    phoneEl.addEventListener("keydown", function (e) { if (e.key === "Enter") sendBtn.click(); });
  }
  function showLoginOverlay() {
    ensureLoginOverlay();
    var o = document.getElementById("pl-login-overlay");
    if (o) { o.style.display = "flex"; var p = o.querySelector("#pl-login-phone"); if (p) p.focus(); }
  }
  function hideLoginOverlay() {
    var o = document.getElementById("pl-login-overlay");
    if (o) o.style.display = "none";
  }

  var sessionHeartbeat = null;
  function startSessionHeartbeat() {
    if (sessionHeartbeat) return;
    sessionHeartbeat = setInterval(async function () {
      var t = getSessionToken();
      if (!t) return;
      try {
        var res = await fetch(API_URL + "?action=ping&token=" + encodeURIComponent(t));
        var j = await res.json();
        if (j && j.authRequired) {
          clearInterval(sessionHeartbeat); sessionHeartbeat = null;
          clearSessionToken();
          showLoginOverlay();
        }
      } catch (e) { /* transient — retry next tick */ }
    }, 60000);
  }

  // ---- state ---------------------------------------------------------------
  var deals = [];              // payload.deals
  var recruitingRows = [];     // payload.recruiting.rows
  var rosterLog = [];          // ?action=growth rosterLog
  var logStartDate = "";       // first real snapshot date ("" = tracking not started)
  var viewerName = "";

  var scopeType = "all";       // all | ice | riot | pods
  var activePod = null;        // pod leader name while drilled in
  var minPodSize = 5;
  var monthKey = "";           // "YYYY-MM", set at boot

  var officeSets = null;       // { ice:Set, riot:Set } of normalized names
  var rosterNorms = [];        // all recruiting names (normalized, hidden excluded)

  // ---- months --------------------------------------------------------------
  function monthKeyOf(dateStr) { return String(dateStr || "").slice(0, 7); }
  function currentMonthKey() {
    var n = new Date();
    return n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0");
  }
  function shiftMonth(key, delta) {
    var y = +key.slice(0, 4), m = +key.slice(5, 7) - 1 + delta;
    var d = new Date(y, m, 1);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }
  function trailingMonths(endKey, n) {
    var out = [];
    for (var i = n - 1; i >= 0; i--) out.push(shiftMonth(endKey, -i));
    return out;
  }
  var MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function monthLabel(key) { return MONTH_NAMES[+key.slice(5, 7) - 1] + " " + key.slice(0, 4); }

  // ---- status fields (sra/cap/install) -------------------------------------
  // First consumer of these Proven-sheet fields; the vocabulary isn't formally
  // spec'd, so accept a date-like value or an affirmative word. ?debug=1 logs
  // the distinct raw values so the predicate can be tightened against reality.
  function statusDate(v) {
    var s = String(v || "").trim();
    if (!s) return null;
    var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return iso[1] + "-" + iso[2];
    var us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (us) return us[3] + "-" + String(+us[1]).padStart(2, "0");
    return null;
  }
  function isDone(v) {
    if (statusDate(v)) return true;
    return /^(yes|y|true|done|complete|completed|approved|paid|installed|✓|x)$/i.test(String(v || "").trim());
  }
  // Month a status lands in: its own date when it has one, else the deal month.
  function statusMonth(deal, field) {
    var v = deal[field];
    if (!isDone(v)) return null;
    return statusDate(v) || monthKeyOf(deal.date);
  }

  // ---- scopes --------------------------------------------------------------
  function downlineOf(leaderName) {
    var norm = normalizeName(leaderName);
    var set = new Set();
    recruitingRows.forEach(function (row) {
      var parts = String(row.treePath || "").split(">").map(normalizeName);
      if (parts.indexOf(norm) !== -1 || normalizeName(row.name) === norm) set.add(normalizeName(row.name));
    });
    return set;
  }
  function buildOfficeSets() {
    var ice = downlineOf("Justin Wall");
    var riot = new Set();
    recruitingRows.forEach(function (row) {
      var n = normalizeName(row.name);
      if (!ice.has(n)) riot.add(n);
    });
    officeSets = { ice: ice, riot: riot };
  }
  // Active scope as {label, set} — set is a Set of normalized names, null = all reps.
  function currentScope() {
    if (scopeType === "ice") return { label: "Ice Collective", set: officeSets.ice };
    if (scopeType === "riot") return { label: "Riot", set: officeSets.riot };
    if (scopeType === "pods" && activePod) return { label: activePod + "'s Pod", set: downlineOf(activePod) };
    return { label: "All Proven", set: null };
  }
  function inScope(name, set) {
    var n = normalizeName(name);
    if (!n || isHidden(n)) return false;
    return set ? set.has(n) : rosterNorms.indexOf(n) !== -1;
  }
  function rosterCountFor(set) {
    if (!set) return rosterNorms.length;
    var c = 0;
    set.forEach(function (n) { if (!isHidden(n) && rosterNorms.indexOf(n) !== -1) c++; });
    return c;
  }

  // ---- metric math ---------------------------------------------------------
  function dealTouchesScope(deal, set) {
    return inScope(deal.expert, set) || (isValidSetterName(deal.setter) && inScope(deal.setter, set));
  }
  function computeMonthStats(mk, set) {
    var cs = 0, sra = 0, cap = 0, installs = 0;
    var activeSet = new Set();
    deals.forEach(function (deal) {
      if (!dealTouchesScope(deal, set)) return;
      if (monthKeyOf(deal.date) === mk) {
        cs++;
        if (inScope(deal.expert, set)) activeSet.add(normalizeName(deal.expert));
        if (isValidSetterName(deal.setter) && inScope(deal.setter, set)) activeSet.add(normalizeName(deal.setter));
      }
      if (statusMonth(deal, "sra") === mk) sra++;
      if (statusMonth(deal, "cap") === mk) cap++;
      if (statusMonth(deal, "install") === mk) installs++;
    });
    return { cs: cs, sra: sra, cap: cap, installs: installs, active: activeSet.size };
  }
  function newRecruitsIn(mk, set) {
    return rosterLog.filter(function (r) {
      return r.source !== "baseline" && monthKeyOf(r.date) === mk && inScope(r.name, set);
    });
  }
  function activatedCount(recruits) {
    var n = 0;
    recruits.forEach(function (r) {
      var norm = normalizeName(r.name);
      var hit = deals.some(function (deal) {
        if (deal.date < r.date) return false;
        return normalizeName(deal.expert) === norm ||
               (isValidSetterName(deal.setter) && normalizeName(deal.setter) === norm);
      });
      if (hit) n++;
    });
    return n;
  }

  // Card definitions — Tableau-fed metrics (IC, PTO, ...) get added here later.
  var METRICS = [
    { key: "cs",       label: "CS (Internal)",  compute: function (mk, set) { return { value: computeMonthStats(mk, set).cs }; } },
    { key: "sra",      label: "SRA",            compute: function (mk, set) { return { value: computeMonthStats(mk, set).sra }; } },
    { key: "cap",      label: "CAP",            compute: function (mk, set) { return { value: computeMonthStats(mk, set).cap }; } },
    { key: "installs", label: "Installs",       compute: function (mk, set) { return { value: computeMonthStats(mk, set).installs }; } },
    { key: "active",   label: "Active Reps",    compute: function (mk, set) {
        var stats = computeMonthStats(mk, set);
        var roster = rosterCountFor(set);
        return { value: stats.active, suffix: roster ? "/ " + roster : "", note: roster ? Math.round(100 * stats.active / roster) + "% of roster had a sale" : "" };
      } },
    { key: "recruits", label: "New Recruits",   compute: function (mk, set) {
        if (!logStartDate) return { value: null, note: "Tracking starts once the daily roster snapshot runs." };
        return { value: newRecruitsIn(mk, set).length, note: "Tracked since " + logStartDate };
      } },
    { key: "convert",  label: "Recruit → Active", compute: function (mk, set) {
        if (!logStartDate) return { value: null, note: "Tracking starts once the daily roster snapshot runs." };
        var recruits = newRecruitsIn(mk, set);
        if (!recruits.length) return { value: 0, suffix: "of 0", note: "No new recruits this month" };
        var act = activatedCount(recruits);
        return { value: act, suffix: "of " + recruits.length, note: Math.round(100 * act / recruits.length) + "% activated with a sale" };
      } }
  ];

  // Metric value series across trailing months (for sparkline + delta), cached
  // per render since computeMonthStats walks all deals per month.
  function metricSeries(metric, months, set) {
    return months.map(function (mk) {
      var r = metric.compute(mk, set);
      return r.value == null ? 0 : r.value;
    });
  }

  // ---- sparkline (inline SVG, no libs) ------------------------------------
  function sparklineSvg(values) {
    var w = 100, h = 30, pad = 2;
    var max = Math.max.apply(null, values.concat([1]));
    var step = (w - pad * 2) / Math.max(values.length - 1, 1);
    var pts = values.map(function (v, i) {
      var x = pad + i * step;
      var y = h - pad - (v / max) * (h - pad * 2);
      return [x.toFixed(1), y.toFixed(1)];
    });
    var line = pts.map(function (p) { return p.join(","); }).join(" ");
    var area = "M" + pts[0].join(",") + " L" + pts.map(function (p) { return p.join(","); }).join(" L") +
               " L" + pts[pts.length - 1][0] + "," + (h - pad) + " L" + pts[0][0] + "," + (h - pad) + " Z";
    var last = pts[pts.length - 1];
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" aria-hidden="true">' +
      '<path d="' + area + '" fill="rgba(15,23,42,.07)"></path>' +
      '<polyline points="' + line + '" fill="none" stroke="#0f172a" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"></polyline>' +
      '<circle cx="' + last[0] + '" cy="' + last[1] + '" r="2.2" fill="#0f172a"></circle>' +
      '</svg>';
  }

  // ---- rendering -----------------------------------------------------------
  function appEl() {
    var el = document.getElementById("growth-app");
    if (!el) {
      el = document.createElement("div");
      el.id = "growth-app";
      document.body.appendChild(el);
    }
    return el;
  }

  function renderLoading(msg) {
    appEl().innerHTML = '<div class="gr-loading"><div class="gr-spinner"></div>' + esc(msg || "Loading growth data…") + "</div>";
  }

  function renderNoAccess(name) {
    appEl().innerHTML =
      '<div class="gr-noaccess">' +
        "<h2>This dashboard is limited to leadership.</h2>" +
        "<p>You're signed in" + (name ? " as <b>" + esc(name) + "</b>" : "") + ", but this account doesn't have access to the Growth Dashboard. Ask Justin if you think it should.</p>" +
        '<button id="gr-switch" type="button">Sign in with a different number</button>' +
      "</div>";
    document.getElementById("gr-switch").addEventListener("click", function () {
      clearSessionToken();
      showLoginOverlay();
    });
  }

  function metricCardHtml(metric, months, set) {
    var now = metric.compute(monthKey, set);
    var html = '<div class="gr-card"><div class="gr-card-label">' + esc(metric.label) + "</div>";
    if (now.value == null) {
      html += '<div class="gr-card-value">—</div><div class="gr-card-delta"></div><div class="gr-card-note">' + esc(now.note || "") + "</div></div>";
      return html;
    }
    html += '<div class="gr-card-value">' + now.value + (now.suffix ? " <small>" + esc(now.suffix) + "</small>" : "") + "</div>";
    var prev = metric.compute(shiftMonth(monthKey, -1), set).value;
    if (prev == null || prev === now.value) {
      html += '<div class="gr-card-delta gr-flat">' + (prev == null ? "" : "even vs " + monthLabel(shiftMonth(monthKey, -1))) + "</div>";
    } else {
      var diff = now.value - prev;
      html += '<div class="gr-card-delta ' + (diff > 0 ? "gr-up" : "gr-down") + '">' + (diff > 0 ? "+" : "") + diff + " vs " + monthLabel(shiftMonth(monthKey, -1)) + "</div>";
    }
    if (now.note) html += '<div class="gr-card-note">' + esc(now.note) + "</div>";
    html += '<div class="gr-spark">' + sparklineSvg(metricSeries(metric, months, set)) + "</div></div>";
    return html;
  }

  function render() {
    var months = trailingMonths(monthKey, 12);
    var scope = currentScope();

    var tabs = [
      { id: "all", label: "All Proven" },
      { id: "ice", label: "Ice Collective" },
      { id: "riot", label: "Riot" },
      { id: "plata", label: "Plata", disabled: true },
      { id: "pods", label: "Pods" }
    ].map(function (t) {
      return '<button type="button" class="gr-tab' + (scopeType === t.id ? " gr-on" : "") + '" data-scope="' + t.id + '"' + (t.disabled ? " disabled title=\"Coming soon\"" : "") + ">" + esc(t.label) + "</button>";
    }).join("");

    var monthOpts = trailingMonths(currentMonthKey(), 12).slice().reverse().map(function (mk) {
      return '<option value="' + mk + '"' + (mk === monthKey ? " selected" : "") + ">" + esc(monthLabel(mk)) + "</option>";
    }).join("");

    var controls =
      '<div class="gr-controls">' +
        '<div class="gr-tabs">' + tabs + "</div>" +
        '<div class="gr-selects">' +
          (scopeType === "pods" && !activePod
            ? '<label for="gr-podsize">Min pod size</label><select id="gr-podsize">' +
              [3, 5, 10].map(function (n) { return '<option value="' + n + '"' + (n === minPodSize ? " selected" : "") + ">" + n + "+</option>"; }).join("") +
              "</select>"
            : "") +
          '<label for="gr-month">Month</label><select id="gr-month">' + monthOpts + "</select>" +
        "</div>" +
      "</div>";

    var body;
    if (scopeType === "pods" && !activePod) {
      var pods = recruitingRows
        .map(function (row) { return { name: row.name, set: downlineOf(row.name) }; })
        .filter(function (p) { return p.set.size - 1 >= minPodSize && !isHidden(normalizeName(p.name)); })
        .sort(function (a, b) { return b.set.size - a.set.size; });
      body = pods.length
        ? '<div class="gr-pod-list">' + pods.map(function (p) {
            var stats = computeMonthStats(monthKey, p.set);
            return '<button type="button" class="gr-pod" data-pod="' + esc(p.name) + '">' +
              '<div class="gr-pod-name">' + esc(p.name) + "</div>" +
              '<div class="gr-pod-meta">' + rosterCountFor(p.set) + " reps · " + stats.cs + " CS · " + stats.active + " active in " + esc(monthLabel(monthKey)) + "</div>" +
              "</button>";
          }).join("") + "</div>"
        : '<div class="gr-card-note">No pods with ' + minPodSize + '+ reps.</div>';
    } else {
      var backBtn = (scopeType === "pods" && activePod)
        ? '<button type="button" class="gr-back" id="gr-back">← All pods</button><div class="gr-scope-title">' + esc(scope.label) + "</div>"
        : "";
      body = backBtn + '<div class="gr-grid">' +
        METRICS.map(function (m) { return metricCardHtml(m, months, scope.set); }).join("") +
        "</div>";
    }

    appEl().innerHTML =
      '<div class="gr-head"><div class="gr-title">Proven Growth<span>DASHBOARD</span></div>' +
      '<div class="gr-viewer">' + esc(viewerName || "") + "</div></div>" +
      '<div class="gr-sub">' + esc(scope.label) + " · " + esc(monthLabel(monthKey)) + " · internal deal data</div>" +
      controls + body;
    wire();
  }

  function wire() {
    var app = appEl();
    app.querySelectorAll(".gr-tab").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var s = btn.getAttribute("data-scope");
        if (s === "plata") return;
        scopeType = s;
        activePod = null;
        render();
      });
    });
    var monthSel = app.querySelector("#gr-month");
    if (monthSel) monthSel.addEventListener("change", function () { monthKey = monthSel.value; render(); });
    var sizeSel = app.querySelector("#gr-podsize");
    if (sizeSel) sizeSel.addEventListener("change", function () { minPodSize = +sizeSel.value; render(); });
    app.querySelectorAll(".gr-pod").forEach(function (btn) {
      btn.addEventListener("click", function () { activePod = btn.getAttribute("data-pod"); render(); });
    });
    var back = app.querySelector("#gr-back");
    if (back) back.addEventListener("click", function () { activePod = null; render(); });
  }

  // ---- boot ----------------------------------------------------------------
  async function bootGrowth() {
    if (!getSessionToken()) { renderLoading(""); showLoginOverlay(); return; }
    renderLoading();
    var t = getSessionToken();
    try {
      var results = await Promise.all([
        fetch(API_URL + "?action=growth&token=" + encodeURIComponent(t)).then(function (r) { return r.json(); }),
        fetch(API_URL + "?token=" + encodeURIComponent(t)).then(function (r) { return r.json(); })
      ]);
      var growth = results[0], payload = results[1];

      if ((growth && growth.authRequired) || (payload && payload.authRequired)) {
        clearSessionToken();
        showLoginOverlay();
        return;
      }
      viewerName = (growth && growth.name) || "";
      if (growth && growth.accessDenied) { renderNoAccess(growth.name); return; }

      deals = (payload && payload.deals) || [];
      recruitingRows = (payload && payload.recruiting && payload.recruiting.rows) || [];
      rosterLog = (growth && growth.rosterLog) || [];
      logStartDate = (growth && growth.logStartDate) || "";

      rosterNorms = recruitingRows.map(function (r) { return normalizeName(r.name); })
        .filter(function (n) { return n && !isHidden(n); });
      buildOfficeSets();
      if (!monthKey) monthKey = currentMonthKey();

      if (DEBUG) {
        var vocab = { sra: {}, cap: {}, install: {} };
        deals.forEach(function (d) {
          ["sra", "cap", "install"].forEach(function (f) {
            var v = String(d[f] || "").trim();
            if (v) vocab[f][v] = (vocab[f][v] || 0) + 1;
          });
        });
        console.log("[growth debug] status field vocabulary:", vocab);
      }

      hideLoginOverlay();
      render();
      startSessionHeartbeat();
    } catch (e) {
      appEl().innerHTML = '<div class="gr-loading">Couldn’t load growth data. Refresh to try again.</div>';
      if (DEBUG) console.error(e);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootGrowth);
  } else {
    bootGrowth();
  }
})();
