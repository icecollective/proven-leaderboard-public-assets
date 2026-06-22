/* Proven — Rep Baseball Card Completion / Accountability page.
   Self-contained: injects its own styles + Inter font and mounts into
   #completion-app (created if missing). Fetches the same leaderboard API and
   reuses the real office / qualifying-leader logic. */
(function () {
  "use strict";

  var API_URL = "https://script.google.com/macros/s/AKfycbwAum0sv4KhswD0Svr2QWEdBw4cP2K-_wg_bBzkA4lNAgWDX58JX4ODT9xRXxljqR5T/exec";
  var INCLUDE_RECRUITER_SELF = true;
  var OFFICE_RECRUITER_SLUG = "justin-wall";

  var HIDDEN = new Set(["justin wall", "meredith fields", "erin wall", "connor fouts"]);
  var EXCLUDED_GROUP_LEADERS = new Set(["kelton higgins", "adam lloyd", "ruan meyer", "luke sanders"]);
  var OFFICE_GROUP_LABELS = new Set(["ice collective", "riot"]);

  // ---- helpers ----
  function norm(v) { return String(v == null ? "" : v).trim().toLowerCase().replace(/\s+/g, " "); }
  function slug(v) { return String(v == null ? "" : v).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // ---- state ----
  var recruitingRows = [];
  var deals = [];
  var statusMap = {};        // norm name -> "Approved" | "Pending" | "Rejected"
  var iceSet = new Set();    // norm names in the Ice Collective umbrella
  var ytdCache = null;       // filtered YTD deals
  var leaderTotalCache = {}; // leaderNorm -> ytd (sets+cs)/2

  var view = "all";          // "all" | "office" | "groups"
  var sortMode = "status";   // "status" | "name"
  var officeFilter = "ice";  // "ice" | "riot"
  var drillLeader = null;    // leader name when drilled into a group

  // ---- core logic (ported from the leaderboard) ----
  function downlineOf(leaderName) {
    var ln = norm(leaderName);
    var set = new Set();
    recruitingRows.forEach(function (r) {
      var parts = String(r.treePath || "").split(">").map(norm);
      var isSelf = norm(r.name) === ln;
      if (parts.indexOf(ln) !== -1 && (INCLUDE_RECRUITER_SELF || !isSelf)) set.add(norm(r.name));
    });
    return set;
  }

  function buildOfficeSets() {
    iceSet = new Set();
    var recRow = null;
    for (var i = 0; i < recruitingRows.length; i++) {
      var r = recruitingRows[i];
      if (slug(r.slug || r.name) === OFFICE_RECRUITER_SLUG || slug(r.name) === OFFICE_RECRUITER_SLUG) { recRow = r; break; }
    }
    if (!recRow) return;
    var base = downlineOf(recRow.name);
    recruitingRows.forEach(function (r) { if (base.has(norm(r.name))) iceSet.add(norm(r.name)); });
  }
  function officeOf(n) { return iceSet.has(n) ? "Ice Collective" : "Riot"; }

  function validSetter(name) {
    var n = norm(name);
    if (!n) return false;
    return ["idk", "unknown", "n/a", "na"].indexOf(n) === -1;
  }
  function ytdDeals() {
    if (ytdCache) return ytdCache;
    var year = String(new Date().getFullYear());
    ytdCache = deals.filter(function (d) { return String(d.date || "").slice(0, 4) === year; });
    return ytdCache;
  }
  function leaderYtdTotal(leaderName) {
    var key = norm(leaderName);
    if (leaderTotalCache[key] != null) return leaderTotalCache[key];
    var dl = downlineOf(leaderName);
    var sets = 0, cs = 0;
    ytdDeals().forEach(function (d) {
      var s = norm(d.setter), e = norm(d.expert);
      if (dl.has(s) && validSetter(d.setter)) sets += 1;
      if (dl.has(e)) cs += 1;
    });
    var total = (sets + cs) / 2;
    leaderTotalCache[key] = total;
    return total;
  }
  function qualifies(leaderName) {
    var n = norm(leaderName);
    if (!n || HIDDEN.has(n) || EXCLUDED_GROUP_LEADERS.has(n) || OFFICE_GROUP_LABELS.has(n)) return false;
    return leaderYtdTotal(leaderName) >= 25;
  }

  // ---- roster + status ----
  function roster() {
    var seen = {};
    var out = [];
    recruitingRows.forEach(function (r) {
      var n = norm(r.name);
      if (!n || HIDDEN.has(n) || seen[n]) return;
      seen[n] = true;
      var st = statusMap[n] || "";
      out.push({ name: String(r.name).trim(), n: n, office: officeOf(n), status: st });
    });
    return out;
  }
  function isDone(st) { return st === "Approved" || st === "Pending"; }
  function badgeFor(st) {
    if (st === "Approved") return { cls: "ok", label: "Approved" };
    if (st === "Pending") return { cls: "pend", label: "In review" };
    if (st === "Rejected") return { cls: "rej", label: "Needs redo" };
    return { cls: "none", label: "Not submitted" };
  }

  function sortReps(list) {
    var copy = list.slice();
    if (sortMode === "name") {
      copy.sort(function (a, b) { return a.name.localeCompare(b.name); });
      return copy;
    }
    // status mode: not-done first, then done; alpha within each
    copy.sort(function (a, b) {
      var ad = isDone(a.status) ? 1 : 0, bd = isDone(b.status) ? 1 : 0;
      if (ad !== bd) return ad - bd;
      return a.name.localeCompare(b.name);
    });
    return copy;
  }

  // ---- rendering ----
  function tally(list) {
    var t = { total: list.length, done: 0, approved: 0, pending: 0, rejected: 0, none: 0 };
    list.forEach(function (r) {
      if (r.status === "Approved") { t.approved++; t.done++; }
      else if (r.status === "Pending") { t.pending++; t.done++; }
      else if (r.status === "Rejected") t.rejected++;
      else t.none++;
    });
    return t;
  }

  function summaryHtml(list) {
    var t = tally(list);
    var pct = t.total ? Math.round((t.done / t.total) * 100) : 0;
    return '' +
      '<div class="cmp-summary">' +
        '<div class="cmp-bigpct">' + pct + '%<span>submitted</span></div>' +
        '<div class="cmp-bar"><div class="cmp-bar-fill" style="width:' + pct + '%"></div></div>' +
        '<div class="cmp-stats">' +
          '<span class="cmp-chip ok">' + t.approved + ' approved</span>' +
          '<span class="cmp-chip pend">' + t.pending + ' in review</span>' +
          '<span class="cmp-chip rej">' + t.rejected + ' need redo</span>' +
          '<span class="cmp-chip none">' + t.none + ' not submitted</span>' +
        '</div>' +
      '</div>';
  }

  function repRowHtml(r, showOffice) {
    var b = badgeFor(r.status);
    return '' +
      '<div class="cmp-row ' + (isDone(r.status) ? "is-done" : "is-not") + '">' +
        '<span class="cmp-dot ' + b.cls + '"></span>' +
        '<span class="cmp-name">' + esc(r.name) + (showOffice ? '<span class="cmp-sub">' + esc(r.office) + '</span>' : '') + '</span>' +
        '<span class="cmp-badge ' + b.cls + '">' + b.label + '</span>' +
      '</div>';
  }

  function listHtml(list, showOffice) {
    var sorted = sortReps(list);
    if (!sorted.length) return '<div class="cmp-empty">No reps here.</div>';
    if (sortMode === "name") {
      return sorted.map(function (r) { return repRowHtml(r, showOffice); }).join("");
    }
    var notDone = sorted.filter(function (r) { return !isDone(r.status); });
    var done = sorted.filter(function (r) { return isDone(r.status); });
    var html = "";
    html += '<div class="cmp-grouphdr not">Not done <span>' + notDone.length + '</span></div>';
    html += notDone.length ? notDone.map(function (r) { return repRowHtml(r, showOffice); }).join("") : '<div class="cmp-empty">Everyone here is done. 🎉</div>';
    html += '<div class="cmp-grouphdr done">Done <span>' + done.length + '</span></div>';
    html += done.length ? done.map(function (r) { return repRowHtml(r, showOffice); }).join("") : '<div class="cmp-empty">Nobody yet.</div>';
    return html;
  }

  function controlsHtml() {
    return '' +
      '<div class="cmp-sortrow">' +
        '<span class="cmp-sortlbl">Sort</span>' +
        '<button class="cmp-sortbtn ' + (sortMode === "status" ? "active" : "") + '" data-sort="status">Done / Not done</button>' +
        '<button class="cmp-sortbtn ' + (sortMode === "name" ? "active" : "") + '" data-sort="name">Name</button>' +
      '</div>';
  }

  function groupsHtml() {
    if (drillLeader) {
      var dl = downlineOf(drillLeader);
      var members = roster().filter(function (r) { return dl.has(r.n) && r.n !== norm(drillLeader); });
      return '' +
        '<button class="cmp-back" data-back="1">&larr; All groups</button>' +
        '<div class="cmp-drillhdr">' + esc(drillLeader) + ' Group</div>' +
        summaryHtml(members) +
        controlsHtml() +
        '<div class="cmp-list">' + listHtml(members, false) + '</div>';
    }
    // list of qualifying leaders with completion ratios
    var leaders = [];
    recruitingRows.forEach(function (r) {
      var n = norm(r.name);
      if (qualifies(r.name)) leaders.push({ name: String(r.name).trim(), n: n });
    });
    // dedupe + sort by % not done (worst first)
    var seen = {};
    leaders = leaders.filter(function (l) { if (seen[l.n]) return false; seen[l.n] = true; return true; });
    var cards = leaders.map(function (l) {
      var dl = downlineOf(l.name);
      var members = roster().filter(function (r) { return dl.has(r.n) && r.n !== l.n; });
      var t = tally(members);
      var pct = t.total ? Math.round((t.done / t.total) * 100) : 0;
      return { l: l, t: t, pct: pct };
    }).filter(function (c) { return c.t.total > 0; });
    cards.sort(function (a, b) { return a.pct - b.pct; }); // least complete first
    if (!cards.length) return '<div class="cmp-empty">No qualifying groups yet.</div>';
    return '<div class="cmp-grouplist">' + cards.map(function (c) {
      return '' +
        '<button class="cmp-groupcard" data-leader="' + esc(c.l.name) + '">' +
          '<div class="cmp-groupcard-top">' +
            '<span class="cmp-groupname">' + esc(c.l.name) + ' Group</span>' +
            '<span class="cmp-groupratio">' + c.t.done + '/' + c.t.total + '</span>' +
          '</div>' +
          '<div class="cmp-bar"><div class="cmp-bar-fill" style="width:' + c.pct + '%"></div></div>' +
          '<div class="cmp-groupsub">' + (c.t.total - c.t.done) + ' still to do' + (c.t.rejected ? ' · ' + c.t.rejected + ' need redo' : '') + '</div>' +
        '</button>';
    }).join("") + '</div>';
  }

  function render() {
    var app = document.getElementById("completion-app");
    if (!app) return;

    var body = "";
    if (view === "all") {
      var all = roster();
      body = summaryHtml(all) + controlsHtml() + '<div class="cmp-list">' + listHtml(all, true) + '</div>';
    } else if (view === "office") {
      var key = officeFilter === "ice" ? "Ice Collective" : "Riot";
      var officeList = roster().filter(function (r) { return r.office === key; });
      body = '' +
        '<div class="cmp-officerow">' +
          '<button class="cmp-officebtn ' + (officeFilter === "ice" ? "active" : "") + '" data-office="ice">Ice Collective</button>' +
          '<button class="cmp-officebtn ' + (officeFilter === "riot" ? "active" : "") + '" data-office="riot">Riot</button>' +
        '</div>' +
        summaryHtml(officeList) + controlsHtml() + '<div class="cmp-list">' + listHtml(officeList, false) + '</div>';
    } else {
      body = groupsHtml();
    }

    app.innerHTML = '' +
      '<div class="cmp-wrap">' +
        '<div class="cmp-head">' +
          '<div class="cmp-logo">PROVEN<span>BASEBALL CARD &middot; COMPLETION</span></div>' +
        '</div>' +
        '<div class="cmp-tabs">' +
          '<button class="cmp-tab ' + (view === "all" ? "active" : "") + '" data-view="all">All Reps</button>' +
          '<button class="cmp-tab ' + (view === "office" ? "active" : "") + '" data-view="office">By Office</button>' +
          '<button class="cmp-tab ' + (view === "groups" ? "active" : "") + '" data-view="groups">Groups</button>' +
        '</div>' +
        body +
      '</div>';

    wire(app);
  }

  function wire(app) {
    app.querySelectorAll("[data-view]").forEach(function (b) {
      b.addEventListener("click", function () { view = b.getAttribute("data-view"); drillLeader = null; render(); });
    });
    app.querySelectorAll("[data-sort]").forEach(function (b) {
      b.addEventListener("click", function () { sortMode = b.getAttribute("data-sort"); render(); });
    });
    app.querySelectorAll("[data-office]").forEach(function (b) {
      b.addEventListener("click", function () { officeFilter = b.getAttribute("data-office"); render(); });
    });
    app.querySelectorAll("[data-leader]").forEach(function (b) {
      b.addEventListener("click", function () { drillLeader = b.getAttribute("data-leader"); render(); });
    });
    var back = app.querySelector("[data-back]");
    if (back) back.addEventListener("click", function () { drillLeader = null; render(); });
  }

  // ---- styles ----
  function injectStyles() {
    if (document.getElementById("cmp-styles")) return;
    var font = document.createElement("link");
    font.rel = "stylesheet";
    font.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap";
    document.head.appendChild(font);

    var css = document.createElement("style");
    css.id = "cmp-styles";
    css.textContent = [
      "#completion-app{font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#0f172a;}",
      ".cmp-wrap{max-width:680px;margin:0 auto;padding:18px 14px 48px;}",
      ".cmp-logo{font-weight:900;font-size:22px;letter-spacing:.5px;line-height:1;color:#0f172a;}",
      ".cmp-logo span{display:block;font-size:9px;letter-spacing:3px;color:#6b7280;font-weight:700;margin-top:6px;}",
      ".cmp-tabs{display:flex;gap:6px;margin:18px 0 16px;}",
      ".cmp-tab{flex:1 1 0;padding:11px 6px;border:1px solid #e7ebf2;background:#fff;color:#475569;border-radius:11px;font-weight:700;font-size:14px;cursor:pointer;box-shadow:0 1px 2px rgba(15,23,42,.05);transition:all .12s ease;}",
      ".cmp-tab:hover{border-color:#cbd3e0;}",
      ".cmp-tab.active{background:linear-gradient(180deg,#293548,#0f172a);color:#fff;border-color:#0f172a;box-shadow:0 2px 6px rgba(15,23,42,.2);}",
      ".cmp-summary{background:#fff;border:1px solid #eef1f7;border-radius:16px;padding:16px;box-shadow:0 8px 24px rgba(15,23,42,.06);margin-bottom:14px;}",
      ".cmp-bigpct{font-size:34px;font-weight:900;line-height:1;color:#0f172a;}",
      ".cmp-bigpct span{font-size:12px;font-weight:700;color:#94a3b8;margin-left:8px;letter-spacing:.2px;}",
      ".cmp-bar{height:8px;border-radius:999px;background:#eef1f6;overflow:hidden;margin:12px 0;}",
      ".cmp-bar-fill{height:100%;border-radius:999px;background:linear-gradient(90deg,#293548,#0f172a);}",
      ".cmp-stats{display:flex;flex-wrap:wrap;gap:6px;}",
      ".cmp-chip{font-size:11.5px;font-weight:700;padding:4px 9px;border-radius:999px;border:1px solid #e7ebf2;color:#475569;background:#f8fafc;}",
      ".cmp-chip.ok{color:#15803d;border-color:#bbf7d0;background:#f0fdf4;}",
      ".cmp-chip.pend{color:#a16207;border-color:#fde68a;background:#fffbeb;}",
      ".cmp-chip.rej{color:#b91c1c;border-color:#fecaca;background:#fef2f2;}",
      ".cmp-chip.none{color:#64748b;}",
      ".cmp-sortrow{display:flex;align-items:center;gap:6px;margin:4px 0 12px;}",
      ".cmp-sortlbl{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;font-weight:700;margin-right:2px;}",
      ".cmp-sortbtn{padding:6px 12px;border:1px solid #e7ebf2;background:#fff;color:#475569;border-radius:999px;font-weight:700;font-size:12.5px;cursor:pointer;}",
      ".cmp-sortbtn.active{background:linear-gradient(180deg,#293548,#0f172a);color:#fff;border-color:#0f172a;}",
      ".cmp-list{background:#fff;border:1px solid #eef1f7;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(15,23,42,.06);}",
      ".cmp-grouphdr{display:flex;justify-content:space-between;align-items:center;padding:10px 16px;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;background:#f6f8fc;color:#64748b;border-bottom:1px solid #eef1f7;}",
      ".cmp-grouphdr.not{color:#b91c1c;}",
      ".cmp-grouphdr.done{color:#15803d;}",
      ".cmp-grouphdr span{background:#fff;border:1px solid #e7ebf2;border-radius:999px;padding:1px 9px;font-size:11px;color:#475569;}",
      ".cmp-row{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid #f1f4f9;}",
      ".cmp-row:last-child{border-bottom:none;}",
      ".cmp-dot{width:9px;height:9px;border-radius:50%;flex:0 0 auto;background:#cbd5e1;}",
      ".cmp-dot.ok{background:#22c55e;}.cmp-dot.pend{background:#f59e0b;}.cmp-dot.rej{background:#ef4444;}.cmp-dot.none{background:#cbd5e1;}",
      ".cmp-name{flex:1 1 auto;font-weight:700;font-size:14.5px;min-width:0;}",
      ".cmp-sub{display:block;font-weight:500;font-size:11px;color:#94a3b8;margin-top:1px;}",
      ".cmp-badge{flex:0 0 auto;font-size:11.5px;font-weight:700;padding:4px 10px;border-radius:999px;border:1px solid #e7ebf2;color:#64748b;background:#f8fafc;white-space:nowrap;}",
      ".cmp-badge.ok{color:#15803d;border-color:#bbf7d0;background:#f0fdf4;}",
      ".cmp-badge.pend{color:#a16207;border-color:#fde68a;background:#fffbeb;}",
      ".cmp-badge.rej{color:#b91c1c;border-color:#fecaca;background:#fef2f2;}",
      ".cmp-empty{padding:18px 16px;text-align:center;color:#94a3b8;font-size:13px;font-weight:600;}",
      ".cmp-officerow{display:flex;gap:6px;margin-bottom:14px;}",
      ".cmp-officebtn{flex:1 1 0;padding:10px 6px;border:1px solid #e7ebf2;background:#fff;color:#475569;border-radius:11px;font-weight:700;font-size:14px;cursor:pointer;}",
      ".cmp-officebtn.active{background:linear-gradient(180deg,#293548,#0f172a);color:#fff;border-color:#0f172a;}",
      ".cmp-grouplist{display:flex;flex-direction:column;gap:10px;}",
      ".cmp-groupcard{text-align:left;border:1px solid #eef1f7;background:#fff;border-radius:16px;padding:14px 16px;cursor:pointer;box-shadow:0 6px 18px rgba(15,23,42,.05);transition:all .12s ease;}",
      ".cmp-groupcard:hover{border-color:#cbd3e0;box-shadow:0 8px 22px rgba(15,23,42,.09);}",
      ".cmp-groupcard-top{display:flex;justify-content:space-between;align-items:baseline;}",
      ".cmp-groupname{font-weight:800;font-size:15px;}",
      ".cmp-groupratio{font-weight:800;font-size:14px;color:#0f172a;}",
      ".cmp-groupsub{font-size:12px;color:#94a3b8;font-weight:600;margin-top:8px;}",
      ".cmp-back{border:none;background:none;color:#475569;font-weight:700;font-size:13px;cursor:pointer;padding:0;margin-bottom:10px;}",
      ".cmp-drillhdr{font-weight:900;font-size:20px;margin-bottom:12px;}",
      ".cmp-loading{padding:60px 0;text-align:center;color:#94a3b8;font-weight:700;}"
    ].join("\n");
    document.head.appendChild(css);
  }

  // ---- boot ----
  function boot() {
    injectStyles();
    var app = document.getElementById("completion-app");
    if (!app) {
      app = document.createElement("div");
      app.id = "completion-app";
      document.body.appendChild(app);
    }
    app.innerHTML = '<div class="cmp-loading">Loading completion…</div>';

    fetch(API_URL)
      .then(function (res) { return res.json(); })
      .then(function (payload) {
        recruitingRows = (payload.recruiting && payload.recruiting.rows) || [];
        deals = payload.deals || [];
        statusMap = payload.repCardStatus || {};
        buildOfficeSets();
        render();
      })
      .catch(function (err) {
        console.error(err);
        if (app) app.innerHTML = '<div class="cmp-loading">Couldn\'t load data. Check the console.</div>';
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
