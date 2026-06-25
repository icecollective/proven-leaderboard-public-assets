  const API_URL = "https://script.google.com/macros/s/AKfycbwAum0sv4KhswD0Svr2QWEdBw4cP2K-_wg_bBzkA4lNAgWDX58JX4ODT9xRXxljqR5T/exec";

  // Mexico incentive-trip banner (static image; @main so it isn't tied to a JS commit hash).
  const MEXICO_IMG_URL = "https://cdn.jsdelivr.net/gh/icecollective/proven-leaderboard-public-assets@main/mexico-trip.jpg";

  const INCLUDE_RECRUITER_SELF = true;

  // Debug/testing UI — set true to re-enable
  const SHOW_DEBUG_LEADERBOARD_META = false;
  const SHOW_DEBUG_TITLE_DATE_RANGE = false;
  const SHOW_DEBUG_LEADERBOARD_TITLE = false;
  
  const officeMap = {
    "ice-collective": { recruiterSlug: "justin-wall", title: "Ice Collective Leaderboard" },
    "riot": { recruiterSlug: "justin-wall", title: "Riot Leaderboard" },
    "raze": { recruiterSlug: "mason-lehman", title: "Raze Leaderboard" }
  };
  
  function normalizeName(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  }
  
  const HIDDEN_REPS = new Set([
    "Justin Wall",
    "Meredith Fields",
    "Erin Wall",
    "Connor Fouts",
    "Kelton Higgins"
  ].map(normalizeName));
  
  let allDeals = [];
  let apiMeta = null;
  let previousYearDeals = [];
  let previousYearDetailsMap = new Map();
  let showYoy = false;
  let showMom = false;
  let showCoc = false; // Custom-over-Custom: the applied Custom range vs the same dates last year
  let appliedCustom = { start: "", end: "" }; // the Custom range that's actually live on the board
  // The "Include Old Reps" toggle (YOY/MOM). Set false to hide it + force OFF.
  const OLD_REPS_TOGGLE_ENABLED = true;
  let includeOldReps = true;
  let includeNewReps = true;
  let includeIceCollective = true;
  let includeRiot = true;
  let includePlata = true;
  let iceCollectiveNames = null;
  let riotNames = null;
  let iceCollective2025Names = null;
  let riot2025Names = null;
  let recruitingNames = null;
  let activeSortMode = "tableau"; // "tableau", "internal", or "previousYear"
  let tableauData = {};
  let tableauOffices = {}; // office-level tableau totals: {ytd:{ice,riot,plata},...}
  let tableauMap = new Map();
  let recruitingRows = [];
  let recruiting2025Rows = [];
  let repProfiles = {}; // approved rep card info keyed by normalized name
  let repGoals = {};    // per-rep goals (weekly CS / monthly / yearly) keyed by normalized name
  let prStatsCache = null; // {bestMonth, bestWeek, cohort} for PR Month/Week ranking
  let showInactive = false;     // "Inactive" toggle (default off)
  let inactiveSetCache = null;  // Set of normalized names inactive THIS WEEK
  let activeInactiveDrill = false; // viewing the Inactive Reps drill-down
  let inactiveDrillLeader = null;  // when set, the inactive drill is scoped to this group leader's downline
  let bagelsOn = false;            // "Bagels" reverse-leaderboard skin (days since last credited deal)
  let bagelDataCache = null;       // per-normalized-name bagel info, computed from real "today"
  let mexicoOn = false;            // "Mexico" incentive-trip skin (YTD installs vs 35/15 thresholds)
  let mexicoReturn = null;         // captured view state to restore on the Mexico Back button
  let tableauExperts = new Set();  // normalized names of reps treated as Experts for Mexico (from the "Tableau Experts" sheet tab)
  let secondSystemsByName = new Map(); // normalized name -> # approved Second Systems (reporter + named party)
  let activePreviousYearDownlineNames = null;
  let previousMonthDetailsMap = new Map();
  let momDateRanges = null;
  
  const TABLEAU_METRICS = {
    cs: "CS",
    sra: "SRA",
    cap: "CAP",
    ic: "IC"
  };
  
  let activeTableauMetric = "cap";
  
  let activeView = "general";
  // Rep-type "lens" applied to the Groups view (and group drill-downs):
  // "general" (default blend), "setters", "experts", or "selfgen". Only meaningful
  // while activeView === "groups".
  let groupsRepType = "general";
  let activeDateMode = "ytd";
  let showTableau = true;
  // Remembers when the user INTENTIONALLY turned Tableau off, so we don't
  // auto-re-enable it on every view/date switch. Only an explicit Tableau toggle
  // (or a view like Mexico that requires Tableau) clears this.
  let tableauUserOff = false;
  
  let isSubsetMode = false;
  let activeDownlineNames = null;
  let activeTitle = "";
  let activeGroupDrillLeader = null;
  let isLeaderboardReady = false;
  // Name of the rep whose card is currently open (last opened).
  let currentRepCardName = null;
  // When a group drill-down is entered by clicking the group link inside a rep
  // card, this holds { rep, state }: the rep's name plus a full snapshot of the
  // view state from before the drill, so "← Back" can restore that exact view
  // and reopen the card on top of it.
  let groupDrillReturn = null;

  const OFFICE_GROUP_LABELS = new Set(["ice collective", "riot"]);
  const EXCLUDED_GROUP_LEADERS = new Set([
    "kelton higgins",
    "adam lloyd",
    "ruan meyer",
    "luke sanders"
  ]);

  const MARKET_LEADER_NAMES = new Set([
    "adam lloyd",
    "ruan meyer",
    "parker stevens",
    "mason lehman"
  ]);
  
  function makeSlug(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }
  
  function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  
  function formatShortDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (isNaN(date.getTime())) return "";
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }
  
  function getTableauKeyForDateMode() {
    if (activeDateMode === "ytd") return "ytd";
    if (activeDateMode === "mtd") return "mtd";
    if (activeDateMode === "wtd") return "wtd";
    if (activeDateMode === "lastWeek") return "lastWeek";
    return null;
  }

  // Did this rep DO anything in the active period? An internal close (CS) or any
  // Tableau metric (CS/SRA/CAP/IC) for that period. Used to hide 0-production reps
  // in the short date modes (everything except YTD, which still shows everyone).
  function rowHasPeriodActivity(row) {
    if ((Number(row && row.cs) || 0) > 0) return true;
    const key = getTableauKeyForDateMode();          // null for Today / Custom (no Tableau period)
    if (key) {
      const tr = getTableauRowForDateMode(normalizeName(row && row.name), key);
      if (tr && ((Number(tr.cs) || 0) > 0 || (Number(tr.sra) || 0) > 0 ||
                 (Number(tr.cap) || 0) > 0 || (Number(tr.ic) || 0) > 0)) return true;
    }
    return false;
  }
  
  function getDateRange(mode) {
    const today = new Date();
    const todayStr = formatDate(today);
  
    if (mode === "today") return { start: todayStr, end: todayStr, label: "Today" };
  
    if (mode === "wtd") {
      const start = new Date(today);
      const day = start.getDay();
      const diff = day === 0 ? 6 : day - 1;
      start.setDate(start.getDate() - diff);
      return { start: formatDate(start), end: todayStr, label: "WTD" };
    }
  
    if (mode === "mtd") {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start: formatDate(start), end: todayStr, label: "MTD" };
    }
  
    if (mode === "ytd") {
      const start = new Date(today.getFullYear(), 0, 1);
      return { start: formatDate(start), end: todayStr, label: "YTD" };
    }
  
    if (mode === "lastWeek") {
      const end = new Date(today);
      const day = end.getDay();
      const diffToSunday = day === 0 ? 7 : day;
      end.setDate(end.getDate() - diffToSunday);
  
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
  
      return { start: formatDate(start), end: formatDate(end), label: "Last Week" };
    }
  
    return {
      start: document.getElementById("custom-start").value,
      end: document.getElementById("custom-end").value,
      label: "Custom"
    };
  }

  // True once the user has applied a Custom date range (both inputs filled).
  function hasCustomRange() {
    const s = document.getElementById("custom-start");
    const e = document.getElementById("custom-end");
    return !!(s && e && s.value && e.value && s.value <= e.value);
  }

  // Dim the date inputs when they've been changed but not yet applied, so the
  // board never looks like it reflects dates that aren't actually live.
  function updateCustomPending() {
    const wrap = document.getElementById("custom-date-wrapper");
    if (!wrap) return;
    const s = (document.getElementById("custom-start") || {}).value || "";
    const e = (document.getElementById("custom-end") || {}).value || "";
    const pending = activeDateMode === "custom" && s && e &&
      (s !== appliedCustom.start || e !== appliedCustom.end);
    wrap.classList.toggle("custom-pending", !!pending);
  }
  // Record the currently-entered Custom range as the live/applied one.
  function recordAppliedCustom() {
    appliedCustom = {
      start: (document.getElementById("custom-start") || {}).value || "",
      end: (document.getElementById("custom-end") || {}).value || ""
    };
    updateCustomPending();
  }
  // One-time: balance the row so the two date boxes are centered with Apply just
  // to the right (a hidden Apply-sized clone on the left), + wire the pending dim.
  function setupCustomDateRow() {
    const wrap = document.getElementById("custom-date-wrapper");
    const applyBtn = document.getElementById("apply-custom");
    if (!wrap || !applyBtn || document.getElementById("pv-date-spacer")) return;
    const spacer = applyBtn.cloneNode(true);
    spacer.id = "pv-date-spacer";
    spacer.style.visibility = "hidden";
    spacer.style.pointerEvents = "none";
    spacer.setAttribute("aria-hidden", "true");
    spacer.removeAttribute("onclick");
    wrap.insertBefore(spacer, wrap.firstChild);
    const sEl = document.getElementById("custom-start");
    const eEl = document.getElementById("custom-end");
    if (sEl) sEl.addEventListener("input", updateCustomPending);
    if (eEl) eEl.addEventListener("input", updateCustomPending);
  }

  // COC: the applied Custom range (this year) vs the SAME calendar dates last year.
  function getCocDateRanges() {
    const startStr = document.getElementById("custom-start").value;
    const endStr = document.getElementById("custom-end").value;
    const shiftYear = str => {
      const p = str.split("-");
      return formatDate(new Date(+p[0] - 1, +p[1] - 1, +p[2]));
    };
    const md = str => { const p = str.split("-"); return `${+p[1]}/${+p[2]}`; };       // 6/1
    const yy = str => `'${str.slice(2, 4)}`;                                            // '26
    const pStart = shiftYear(startStr), pEnd = shiftYear(endStr);
    return {
      current: { start: startStr, end: endStr, label: `${md(startStr)}–${md(endStr)} ${yy(startStr)}` },
      previous: { start: pStart, end: pEnd, label: `${md(pStart)}–${md(pEnd)} ${yy(pStart)}` }
    };
  }

  function getMomDateRanges() {
    // COC reuses the entire MoM "two explicit ranges" pipeline — it just supplies
    // the Custom range vs the same dates last year instead of the month ranges.
    if (showCoc && activeDateMode === "custom" && hasCustomRange()) {
      momDateRanges = getCocDateRanges();
      return momDateRanges;
    }
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const day = today.getDate();
    const monthLabel = today.toLocaleString("en-US", { month: "short" });

    const currentStart = new Date(year, month, 1);
    const prevYear = year - 1;
    const prevStart = new Date(prevYear, month, 1);
    let prevEnd = new Date(prevYear, month, day);
    if (prevEnd.getMonth() !== month) {
      prevEnd = new Date(prevYear, month + 1, 0);
    }

    momDateRanges = {
      current: {
        start: formatDate(currentStart),
        end: formatDate(today),
        label: `${monthLabel} '${String(year).slice(2)}`
      },
      previous: {
        start: formatDate(prevStart),
        end: formatDate(prevEnd),
        label: `${monthLabel} '${String(prevYear).slice(2)}`
      }
    };

    return momDateRanges;
  }

  function getMomCurrentDeals() {
    const ranges = momDateRanges || getMomDateRanges();
    return allDeals.filter(deal =>
      dealInScope(deal) && dealInDateRange(deal, ranges.current)
    );
  }

  function getMomPreviousDeals() {
    const ranges = momDateRanges || getMomDateRanges();
    return previousYearDeals.filter(deal => dealInDateRange(deal, ranges.previous));
  }

  function getRepContribution(sets, closes) {
    return (sets + closes) / 2;
  }

  function getRowContributionCredit(row) {
    return getRepContribution(row.sets, row.closes);
  }

  function getRowPreviousContributionCredit(row) {
    return getRepContribution(getRowPreviousSets(row), getRowPreviousCloses(row));
  }

  function getDealId(deal) {
    return String(deal.messageId || "").trim();
  }

  function isComparisonMode() {
    return useComparisonColumn();
  }

  function useYoyColumn() {
    return activeDateMode === "ytd" && showYoy;
  }

  // "Explicit two-range comparison" column — drives MoM AND COC, which share the
  // same machinery (getMomDateRanges / getMomPreviousDeals / previousMonthDetailsMap).
  function useMomColumn() {
    return (showMom && activeDateMode === "mtd") ||
           (showCoc && activeDateMode === "custom" && hasCustomRange());
  }

  function useComparisonColumn() {
    return useYoyColumn() || useMomColumn();
  }

  function isPeriodMetricSuffix(suffix) {
    return suffix === "Total" || suffix === "CS" || suffix === "SG";
  }

  function isCocActive() {
    return showCoc && activeDateMode === "custom" && hasCustomRange();
  }

  function getCurrentComparisonLabel(suffix) {
    // COC selectors show just the YEAR (the exact range is in the date boxes).
    if (isCocActive()) {
      const y = (getMomDateRanges().current.start || "").slice(0, 4);
      return isPeriodMetricSuffix(suffix) ? y : `${y} ${suffix}`;
    }
    if (useMomColumn()) {
      if (isPeriodMetricSuffix(suffix)) {
        return (momDateRanges || getMomDateRanges()).current.label;
      }
      return `${(momDateRanges || getMomDateRanges()).current.label} ${suffix}`;
    }
    if (showYoy) {
      if (isPeriodMetricSuffix(suffix)) return "2026";
      return `2026 ${suffix}`;
    }
    if (isPeriodMetricSuffix(suffix)) return getPeriodLabel();
    return suffix;
  }

  function getPreviousComparisonLabel(suffix) {
    if (isCocActive()) {
      const y = (getMomDateRanges().previous.start || "").slice(0, 4);
      return isPeriodMetricSuffix(suffix) ? y : `${y} ${suffix}`;
    }
    if (useMomColumn()) {
      if (isPeriodMetricSuffix(suffix)) {
        return (momDateRanges || getMomDateRanges()).previous.label;
      }
      return `${(momDateRanges || getMomDateRanges()).previous.label} ${suffix}`;
    }
    if (showYoy) {
      if (isPeriodMetricSuffix(suffix)) return "2025";
      return `2025 ${suffix}`;
    }
    return "";
  }

  function getMondayOfWeek(date) {
    const monday = new Date(date);
    const day = monday.getDay();
    const diff = day === 0 ? 6 : day - 1;
    monday.setDate(monday.getDate() - diff);
    monday.setHours(0, 0, 0, 0);
    return monday;
  }

  function getSummerSeasonStart(date = new Date()) {
    const year = date.getFullYear();
    const may1 = new Date(year, 4, 1);
    may1.setHours(0, 0, 0, 0);
    const day = may1.getDay();
    const daysUntilMonday = (8 - day) % 7;
    may1.setDate(may1.getDate() + daysUntilMonday);
    return may1;
  }

  function getSummerWeekNumber(date = new Date()) {
    const monday = getMondayOfWeek(date);
    const year = monday.getFullYear();
    let seasonStart = getSummerSeasonStart(monday);

    if (monday < seasonStart) {
      seasonStart = getMondayOfWeek(new Date(year, 0, 1));
    }

    const diffWeeks = Math.floor((monday - seasonStart) / (7 * 24 * 60 * 60 * 1000));
    return diffWeeks + 1;
  }

  function getPeriodLabel(date = new Date()) {
    if (useMomColumn()) {
      return (momDateRanges || getMomDateRanges()).current.label;
    }

    if (showYoy && activeDateMode === "ytd") {
      return "2026";
    }

    switch (activeDateMode) {
      case "ytd":
        return String(date.getFullYear());
      case "mtd":
        return date.toLocaleString("en-US", { month: "long" });
      case "wtd":
        return `Week ${getSummerWeekNumber(date)}`;
      case "today":
        return date.toLocaleString("en-US", { month: "short", day: "numeric" });
      case "lastWeek": {
        const range = getDateRange("lastWeek");
        const endDate = new Date(`${range.end}T12:00:00`);
        return `Week ${getSummerWeekNumber(endDate)}`;
      }
      case "custom": {
        const range = getDateRange("custom");
        if (range.start && range.end) {
          return `${formatShortDate(range.start)}-${formatShortDate(range.end)}`;
        }
        return "Custom";
      }
      default:
        return "Total";
    }
  }

  function getPreviousPeriodLabel() {
    if (useMomColumn()) {
      return (momDateRanges || getMomDateRanges()).previous.label;
    }
    if (showYoy && activeDateMode === "ytd") {
      return "2025";
    }
    return "";
  }

  function getTotalRowLabel() {
    return "";
  }

  function formatTitleWithOptionalDateRange(label, range) {
    if (!SHOW_DEBUG_TITLE_DATE_RANGE || !range?.start || !range?.end) return label;
    return `${label} (${range.start} to ${range.end})`;
  }

  function buildRankHeaderCell() {
    return "Rank";
  }

  // Consistent grid columns: Rank + Rep are FIXED across every view (matching the
  // densest tableau+comparison layout) so they never shift; only the value
  // columns change. nValueCols = number of value columns (1-3).
  function gridCols(nValueCols) {
    // minmax(0,fr) on every track so columns DON'T resize to fit content (long
    // rep names were widening the Rep column and shifting the value columns,
    // misaligning the numbers). Fixed proportions => every row identical.
    let RANK = 0.45, REP = 1.85, VALUE_TOTAL = 3.0;
    // On mobile, ALWAYS use the wider Rep / fixed value-total proportions —
    // regardless of how many value columns are showing. This keeps the Rep
    // column (and the goal progress bar that spans it) exactly the same width
    // in every view/date/toggle combination, so the bar never grows or shrinks
    // when columns are added/removed (e.g. Tableau turning off after visiting
    // Groups). It also keeps the CS column pushed right on dense views.
    const mobile = typeof window !== "undefined" && window.innerWidth <= 760;
    if (mobile) { REP = 2.6; VALUE_TOTAL = 2.5; }
    const each = (VALUE_TOTAL / nValueCols).toFixed(3);
    let s = `minmax(0,${RANK}fr) minmax(0,${REP}fr)`;
    for (let i = 0; i < nValueCols; i++) s += ` minmax(0,${each}fr)`;
    return s;
  }

  function buildViewRepCountCell(count, label = "Reps") {
    return `<div class="view-rep-count">${count} ${label}</div>`;
  }

  function buildLeaderboardTitleHtml(title) {
    if (!SHOW_DEBUG_LEADERBOARD_TITLE) return "";
    return `<div class="leaderboard-title">${title}</div>`;
  }

  function updateLeaderboardStickyOffsets() {
    const column = document.querySelector(".leaderboard-column");
    if (!column) return;

    const title = column.querySelector(".leaderboard-title");
    const header = column.querySelector(".leaderboard-header-row");
    if (!header) return;

    // The sticky topbar (logo + "?" + Tableau) sits above the column; the header
    // / total rows must pin BELOW it, not under it. Measure its live height so
    // the offsets stay correct even as the topbar's height changes.
    const topbar = document.getElementById("pv-topbar");
    column.style.setProperty("--pv-topbar-h", `${topbar ? Math.ceil(topbar.getBoundingClientRect().height) : 56}px`);
    column.style.setProperty("--lb-title-height", `${title ? title.offsetHeight : 0}px`);
    column.style.setProperty("--lb-header-height", `${header.offsetHeight}px`);
  }

  function finishLeaderboardRender() {
    updateBagelButtonState();
    updateMexicoUI();
    applyExclusiveToggleStates();
    requestAnimationFrame(updateLeaderboardStickyOffsets);
  }

  // Mutual exclusion between the comparison toggles (YOY/MOM/COC) and the
  // Bagels/Mexico skins — neither pair can be on together. Also, when ONLY Plata
  // is selected, fade the views (Groups/SelfGen) and date modes (Today/Custom)
  // that Plata's Tableau data can't drive. Runs every render after the other
  // button-state updates so it has the final say on disabled state.
  function applyExclusiveToggleStates() {
    const cmpActive = isComparisonMode();          // YOY / MOM / COC on
    const bmActive = bagelsOn || mexicoOn;         // Bagels / Mexico skin on
    const onlyPlata = isOnlyPlataOfficeSelected(); // only the Plata office selected
    const inInactiveDrill = activeView === "groups" && activeInactiveDrill;

    // Comparison on OR in the Inactive Reps drill -> fade Bagels + Mexico.
    const fadeBM = cmpActive || inInactiveDrill;
    [document.getElementById("bagel-toggle"), document.getElementById("mexico-toggle")]
      .forEach(btn => {
        if (!btn) return;
        btn.disabled = fadeBM;
        btn.classList.toggle("disabled", fadeBM);
      });

    // Bagels/Mexico on OR only Plata selected -> fade YOY + MOM (+ COC, on top of its
    // own range gate). Plata's Tableau data has no comparison column.
    const fadeCmp = bmActive || onlyPlata;
    const yoyBtn = document.getElementById("yoy-toggle");
    const momBtn = document.getElementById("mom-toggle");
    const cocBtn = document.getElementById("coc-toggle");
    if (yoyBtn) { yoyBtn.disabled = fadeCmp; yoyBtn.classList.toggle("disabled", fadeCmp); }
    if (momBtn) { momBtn.disabled = fadeCmp; momBtn.classList.toggle("disabled", fadeCmp); }
    if (cocBtn && fadeCmp) { cocBtn.disabled = true; cocBtn.classList.add("disabled"); }

    // Per-button fade by a predicate(label) -> boolean.
    const fadeBy = (containerId, shouldFade) => {
      const c = document.getElementById(containerId);
      if (!c) return;
      Array.prototype.slice.call(c.querySelectorAll("button")).forEach(b => {
        const label = b.textContent.trim();
        const fade = shouldFade(label);
        if (fade === null) return; // not a button we manage
        b.disabled = fade;
        b.classList.toggle("mexico-faded", fade);
      });
    };
    // Only Plata -> Groups/SelfGen views unusable.
    fadeBy("view-tabs", label =>
      (label === "Groups" || label === "SelfGen") ? onlyPlata : null);
    // Only Plata -> Today/Custom faded; Inactive drill -> Today/WTD faded.
    fadeBy("date-tabs", label => {
      if (label === "Today") return onlyPlata || inInactiveDrill;
      if (label === "Custom") return onlyPlata;
      if (label === "WTD") return inInactiveDrill;
      return null;
    });
  }

  function updateLeaderboardMeta(filteredDealsCount) {
    const meta = document.getElementById("leaderboard-meta");
    if (!meta) return;

    if (!SHOW_DEBUG_LEADERBOARD_META) {
      meta.textContent = "";
      meta.style.display = "none";
      return;
    }

    meta.style.display = "";
    meta.textContent = apiMeta
      ? `Deals loaded: ${apiMeta.recordCount} | Deals in view: ${filteredDealsCount} | Last updated: ${new Date(apiMeta.lastUpdated).toLocaleString()}`
      : "";
  }

  // The rep-type "role" governing per-rep display: normally the active view, but
  // inside the Groups view a rep-type lens (Setters/Experts/SelfGen) overrides it
  // so group drill-downs render each rep through that lens. "general" groups keeps
  // the original group behavior (returns "groups").
  function effectiveRoleView() {
    if (activeView === "groups" && groupsRepType !== "general") return groupsRepType;
    return activeView;
  }

  function getRowPreviousCs(row) {
    const view = effectiveRoleView();
    if (view === "selfgen") return getRowPreviousSelfGen(row) || 0;
    const norm = normalizeName(row.name);
    const stats = useMomColumn()
      ? previousMonthDetailsMap.get(norm)
      : previousYearDetailsMap.get(norm);
    if (!stats) return 0;
    if (view === "experts") return stats.expertDealIds?.size || 0;
    if (view === "setters") return stats.setterDealIds?.size || 0;
    return stats.dealIds?.size || 0;
  }

  function getRowDisplayCs(row) {
    if (row && row.isPlataOnly) return plataHeadlineSra(row); // Plata: headline = SRA
    const view = effectiveRoleView();
    if (view === "experts") return row.expertCs || 0;
    if (view === "setters") return row.setterCs || 0;
    if (view === "selfgen") return row.selfGen || 0;
    return row.cs;
  }

  function getRowPreviousSelfGen(row) {
    return useMomColumn() ? row.previousMonthSelfGen : row.previousYearSelfGen;
  }

  function getRowPreviousSets(row) {
    return useMomColumn() ? row.previousMonthSets : row.previousYearSets;
  }

  function getRowPreviousCloses(row) {
    return useMomColumn() ? row.previousMonthCloses : row.previousYearCloses;
  }

  function getRowPreviousSetOnly(row) {
    return useMomColumn() ? row.previousMonthSetOnly : row.previousYearSetOnly;
  }

  function buildOfficeNameSetsFromRows(rows) {
    const ice = new Set();
    const riot = new Set();

    const recruiterRow = rows.find(row =>
      makeSlug(row.slug || row.name) === "justin-wall" ||
      makeSlug(row.name) === "justin-wall"
    );

    if (!recruiterRow) return { ice, riot };

    const baseDownline = buildDownlineSetFromRows(rows, recruiterRow.name);

    rows.forEach(row => {
      const norm = normalizeName(row.name);
      if (baseDownline.has(norm)) {
        ice.add(norm);
      } else {
        riot.add(norm);
      }
    });

    return { ice, riot };
  }

  function rebuildRecruitingNames() {
    recruitingNames = new Set(
      recruitingRows
        .map(row => normalizeName(row.name))
        .filter(norm => norm && !HIDDEN_REPS.has(norm))
    );
  }

  function ensureRecruitingNames() {
    if (!recruitingNames) rebuildRecruitingNames();
  }

  function getPreviousDetailsMap() {
    return useMomColumn() ? previousMonthDetailsMap : previousYearDetailsMap;
  }

  function getPreviousRepStats(normName) {
    return getPreviousDetailsMap().get(normName);
  }

  function hasInternalRepHistory(normName) {
    const previousStats = previousYearDetailsMap.get(normName);
    if (previousStats && previousStats.sets + previousStats.closes > 0) return true;

    const monthStats = previousMonthDetailsMap.get(normName);
    if (monthStats && monthStats.sets + monthStats.closes > 0) return true;

    return allDeals.some(deal =>
      normalizeName(deal.setter) === normName ||
      normalizeName(deal.expert) === normName
    );
  }

  function isTableauOnlyRep(normName) {
    if (!normName || HIDDEN_REPS.has(normName)) return false;
    ensureRecruitingNames();
    return !recruitingNames.has(normName);
  }

  function isPlataRep(normName) {
    return isTableauOnlyRep(normName) && !hasInternalRepHistory(normName);
  }
  // Plata has no internal data — an "Expert" is identified from the Tableau
  // Experts list (same source as Mexico); everyone else in Plata is a Setter.
  function isPlataExpert(normName) {
    return isPlataRep(normName) && tableauExperts.has(normName);
  }
  // Plata's headline number = their Tableau SRA for the active period.
  function plataHeadlineSra(row) {
    const key = getTableauKeyForDateMode();
    if (!key) return 0;
    const t = getTableauRowForDateMode(normalizeName(row && row.name), key);
    return t ? (Number(t.sra) || 0) : 0;
  }
  // Plata "bagel" estimate from weekly Tableau SRA (lower bound, shown as "≥N").
  function plataBagelInfo(norm) {
    const w = getTableauRowForDateMode(norm, "wtd");
    const l = getTableauRowForDateMode(norm, "lastWeek");
    const soldThisWeek = !!(w && (Number(w.sra) || 0) > 0);
    const soldLastWeek = !!(l && (Number(l.sra) || 0) > 0);
    return {
      count: getBagelData().plataBagels(soldThisWeek, soldLastWeek),
      cold: !soldThisWeek && !soldLastWeek, // no SRA this week or last -> yellow
      soldThisWeek: soldThisWeek
    };
  }

  function isGroupDrillDownView() {
    return activeView === "groups" && (!!activeGroupDrillLeader || activeInactiveDrill);
  }

  function isTableauViewRelevant() {
    if (activeView === "selfgen") return false;
    if (activeView === "groups" && !isGroupDrillDownView()) return false;
    return ["ytd", "mtd", "wtd", "lastWeek"].includes(activeDateMode);
  }

  function canShowTableauButton() {
    const key = getTableauKeyForDateMode();
    const dataset = key ? tableauData[key] : null;
    return isTableauViewRelevant() &&
      dataset &&
      Array.isArray(dataset.rows) &&
      dataset.rows.length > 0;
  }

  function isPortraitMobile() {
    return window.matchMedia("(max-width: 768px) and (orientation: portrait)").matches;
  }

  function setShowTableau(value) {
    showTableau = value;
    if (!value) includePlata = false;
    if (value && isPortraitMobile() && showYoy) {
      showYoy = false;
    }
  }

  // The "Include Old Reps" filter — currently force-disabled (see
  // OLD_REPS_TOGGLE_ENABLED). Always returns false so it behaves as "not selected".
  function oldRepsActive() {
    return OLD_REPS_TOGGLE_ENABLED && includeOldReps;
  }

  // Decide whether Tableau should be shown after a view/date change. Auto-restores
  // Tableau when we land back in a tableau-capable context, UNLESS the user
  // intentionally turned it off, or (on portrait mobile) YOY/MOM is active — those
  // can't share the screen with Tableau.
  function applyTableauAutoState() {
    let desired;
    if (!canShowTableauButton()) {
      desired = false;                       // not a tableau-capable context
    } else if (tableauUserOff) {
      desired = false;                       // respect an intentional off
    } else if (isPortraitMobile() && (showYoy || showMom || showCoc)) {
      desired = false;                       // mobile: can't show with YOY/MOM
    } else {
      desired = true;
    }
    setShowTableau(desired);
  }

  function canUsePlataToggle() {
    // Plata works on General, Setters, Experts (we know who's an Expert from the
    // Tableau Experts list). NOT Groups/group drills, NOT SelfGen, and not while a
    // comparison (YOY/MOM/COC) is on — Tableau data has no prior-period column.
    return ["general", "setters", "experts"].includes(activeView) &&
      canShowTableauButton() &&
      !isComparisonMode();
  }

  function wouldHaveActiveOfficeAfterToggle(officeId, turningOn) {
    const ice = officeId === "ice-collective-toggle" ? turningOn : includeIceCollective;
    const riot = officeId === "riot-toggle" ? turningOn : includeRiot;
    const plata = officeId === "plata-toggle" ? turningOn : includePlata;

    if (ice || riot) return true;
    if (plata && canUsePlataToggle()) return true;
    return false;
  }

  function isOnlyPlataOfficeSelected() {
    return includePlata &&
      canUsePlataToggle() &&
      !includeIceCollective &&
      !includeRiot;
  }

  function shouldShowPlataRows(useTableauColumn) {
    return useTableauColumn && includePlata && canUsePlataToggle();
  }

  function getTableauRowForDateMode(normName, dateModeKey) {
    const dataset = tableauData[dateModeKey];
    if (!dataset || !Array.isArray(dataset.rows)) return null;

    return dataset.rows.find(row => normalizeName(row.name) === normName) || null;
  }

  function getTableauCsForDateMode(normName, dateModeKey) {
    const row = getTableauRowForDateMode(normName, dateModeKey);
    return Number(row?.cs) || 0;
  }

  function plataRepMeetsActiveTableauCsGate(normName) {
    const key = getTableauKeyForDateMode();
    if (!key) return false;
    return getTableauCsForDateMode(normName, key) > 0;
  }

  function hasTableauRowData(tableauRow) {
    return Object.keys(TABLEAU_METRICS).some(metric => {
      const value = tableauRow?.[metric];
      return value !== undefined && value !== null && value !== "";
    });
  }

  function isRecruitingRep(normName) {
    ensureRecruitingNames();
    return recruitingNames.has(normName);
  }

  function hasTableauDataForNorm(normName) {
    const tableauRow = tableauMap.get(normName);
    return tableauRow && hasTableauRowData(tableauRow);
  }

  function rowShowsInternalNa(row) {
    if (row.isPlataOnly) return false;
    const norm = normalizeName(row.name);
    return isRecruitingRep(norm) && hasTableauDataForNorm(norm) && !hasInternalRepHistory(norm);
  }

  function rowShowsCurrentNa(row) {
    return rowShowsInternalNa(row);
  }

  function rowShowsPreviousNa(row) {
    return rowShowsInternalNa(row);
  }

  function buildEmptyInternalRow(name, tableauRow) {
    const norm = normalizeName(name);
    return {
      name: String(name).trim(),
      sets: 0,
      closes: 0,
      selfGen: 0,
      setOnly: 0,
      lifetimeSets: 0,
      lifetimeCloses: 0,
      lifetimeSelfGen: 0,
      cs: 0,
      setterCs: 0,
      expertCs: 0,
      dealIds: new Set(),
      setterDealIds: new Set(),
      expertDealIds: new Set(),
      tableau: tableauRow || {},
      previousYearSetOnly: previousYearDetailsMap.get(norm)?.setOnly || 0,
      previousYearSelfGen: previousYearDetailsMap.get(norm)?.selfGen || 0,
      previousYearSets: previousYearDetailsMap.get(norm)?.sets || 0,
      previousYearCloses: previousYearDetailsMap.get(norm)?.closes || 0,
      previousMonthSetOnly: previousMonthDetailsMap.get(norm)?.setOnly || 0,
      previousMonthSelfGen: previousMonthDetailsMap.get(norm)?.selfGen || 0,
      previousMonthSets: previousMonthDetailsMap.get(norm)?.sets || 0,
      previousMonthCloses: previousMonthDetailsMap.get(norm)?.closes || 0
    };
  }

  function rebuildOfficeNameSets() {
    const current = buildOfficeNameSetsFromRows(recruitingRows);
    iceCollectiveNames = current.ice;
    riotNames = current.riot;

    const previous = buildOfficeNameSetsFromRows(recruiting2025Rows);
    iceCollective2025Names = previous.ice;
    riot2025Names = previous.riot;

    rebuildRecruitingNames();
  }

  function ensureOfficeNameSets() {
    if (!iceCollectiveNames || !riotNames || !iceCollective2025Names || !riot2025Names) {
      rebuildOfficeNameSets();
    }
  }

  function getOfficeNameSets(year = "current") {
    ensureOfficeNameSets();
    if (year === "previous") {
      return { ice: iceCollective2025Names, riot: riot2025Names };
    }
    return { ice: iceCollectiveNames, riot: riotNames };
  }

  function repInOfficeUmbrella(normName, year = "current") {
    if (!normName) return true;
    if (includeIceCollective && includeRiot) return true;

    const { ice, riot } = getOfficeNameSets(year);

    if (!includeIceCollective && ice.has(normName)) return false;
    if (!includeRiot && riot.has(normName)) return false;

    return true;
  }

  function rebuildComparisonMapsForOffice() {
    rebuildPreviousYearMap();
    rebuildPreviousMonthMap();
  }
  
  async function loadDownlineIfNeeded() {
    const mode = getUrlMode();
    const isRiotOffice = new URLSearchParams(window.location.search).get("office") === "riot";
  
    if (!mode.isSubset) {
      isSubsetMode = false;
      activeDownlineNames = null;
      activePreviousYearDownlineNames = null;
      activeTitle = "Proven Leaderboard V2";
      document.getElementById("scope-title").textContent = "";
      return;
    }
  
    isSubsetMode = true;
  
    const currentRows = recruitingRows || [];
    const previousRows = recruiting2025Rows || [];
  
    const recruiterRow = currentRows.find(row =>
      makeSlug(row.slug || row.name) === mode.lookupSlug ||
      makeSlug(row.name) === mode.lookupSlug
    );
  
    const previousRecruiterRow = previousRows.find(row =>
      makeSlug(row.slug || row.name) === mode.lookupSlug ||
      makeSlug(row.name) === mode.lookupSlug
    );
  
    if (!recruiterRow && !previousRecruiterRow) {
      document.getElementById("scope-title").textContent = "Rep not found";
      activeDownlineNames = new Set();
      activePreviousYearDownlineNames = new Set();
      return;
    }
  
    const activeRepName = recruiterRow
      ? recruiterRow.name
      : previousRecruiterRow.name;
  
    activeTitle = mode.title || `${activeRepName} Group Leaderboard`;
  
    activeDownlineNames = buildDownlineSetFromRows(currentRows, activeRepName);
    activePreviousYearDownlineNames = buildDownlineSetFromRows(previousRows, activeRepName);
  
    if (isRiotOffice) {
    const riotCurrent = new Set();
  
    currentRows.forEach(row => {
      const norm = normalizeName(row.name);
  
      if (!activeDownlineNames.has(norm)) {
        riotCurrent.add(norm);
      }
    });
  
    const riot2025 = new Set();
  
    previousRows.forEach(row => {
      const norm = normalizeName(row.name);
  
      if (!activePreviousYearDownlineNames.has(norm)) {
        riot2025.add(norm);
      }
    });
  
    activeDownlineNames = riotCurrent;
    activePreviousYearDownlineNames = riot2025;
  }
  
    document.getElementById("scope-title").textContent = activeTitle;
  }
  
  function isOfficeGroupName(name) {
    return OFFICE_GROUP_LABELS.has(normalizeName(name));
  }

  function isClickableGroupLeader(name) {
    return name && !isOfficeGroupName(name);
  }

  function getOfficeGroupKey(name) {
    const norm = normalizeName(name);
    if (norm === "ice collective") return "ice";
    if (norm === "riot") return "riot";
    return "";
  }

  function buildGroupNameCell(name) {
    const officeKey = getOfficeGroupKey(name);
    if (officeKey) {
      return `<button type="button" class="group-leader-link" data-office-group="${officeKey}">${name}</button>`;
    }
    if (isClickableGroupLeader(name)) {
      return `<button type="button" class="group-leader-link" data-group-leader="${escapeAttr(name)}">${name}</button>`;
    }
    return `<div>${name}</div>`;
  }

  function setActiveViewTab(viewKey) {
    const labels = {
      general: "General",
      setters: "Setters",
      experts: "Experts",
      selfgen: "SelfGen",
      groups: "Groups"
    };
    // In the Groups view the Groups tab is fully selected and the active rep-type
    // lens (General/Setters/Experts/SelfGen) gets a "half" highlight. Otherwise
    // the active view's tab is fully selected.
    const inGroups = viewKey === "groups";
    const lensLabel = inGroups ? labels[groupsRepType] : null;
    document.querySelectorAll("#view-tabs button").forEach(btn => {
      const isFull = btn.textContent === labels[viewKey];
      const isHalf = inGroups && btn.textContent === lensLabel && btn.textContent !== labels.groups;
      btn.classList.toggle("active", isFull);
      btn.classList.toggle("half-active", isHalf);
    });
  }

  function navigateToGeneralFromOfficeGroup(office) {
    // Carry the active Groups lens (Setters/Experts/SelfGen) into the destination
    // view — the lens names map 1:1 to the standalone view keys. Default General.
    const targetView = (groupsRepType && groupsRepType !== "general") ? groupsRepType : "general";

    activeGroupDrillLeader = null;
    activeInactiveDrill = false;
    inactiveDrillLeader = null;
    groupsRepType = "general";
    groupDrillReturn = null;

    if (office === "ice") {
      includeIceCollective = true;
      includeRiot = false;
    } else if (office === "riot") {
      includeRiot = true;
      includeIceCollective = false;
    }

    includePlata = false;
    rebuildComparisonMapsForOffice();

    activeView = targetView;
    if (activeSortMode !== "bagels") {
      activeSortMode = targetView === "selfgen" ? "selfGen" : "currentContribution";
    }

    setActiveViewTab(targetView);
    updateGroupDrillNav();
    renderLeaderboard();
  }

  function escapeAttr(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  let repCardEventsReady = false;

  function isValidSetterName(name) {
    const norm = normalizeName(name);
    if (!norm) return false;
    if (norm === "idk" || norm === "unknown" || norm === "n/a" || norm === "na") return false;
    return true;
  }

  // Lightweight role + office for the row subtitle (no group computation).
  function repRoleOffice(repName) {
    const norm = normalizeName(repName);
    const row = getRecruitingRowForRep(repName);
    const isPlata = isPlataRep(norm);
    let role = row?.role || row?.title || "";
    if (MARKET_LEADER_NAMES.has(norm)) role = "Market Leader";
    else if (isPlata) role = isPlataExpert(norm) ? "Expert" : "Setter"; // from Tableau Experts list
    else if (!role) {
      let hasClose = false, hasSet = false;
      const ytd = getDateRange("ytd");
      allDeals.forEach(d => {
        if (!dealInDateRange(d, ytd)) return;
        if (normalizeName(d.expert) === norm) hasClose = true;
        if (isValidSetterName(d.setter) && normalizeName(d.setter) === norm) hasSet = true;
      });
      role = hasClose ? "Expert" : (hasSet ? "Setter" : "Rep");
    }
    let office = row?.office || "";
    if (isPlata) office = "Plata";
    else if (!office) {
      ensureOfficeNameSets();
      if (iceCollectiveNames.has(norm)) office = "Ice Collective";
      else if (riotNames.has(norm)) office = "Riot";
      else office = "";
    }
    // Abbreviate "Market Leader" -> "ML" in the row subtitle only (the baseball
    // card keeps the full label).
    const rowRole = role === "Market Leader" ? "ML" : role;
    if (office && normalizeName(office) !== normalizeName(role)) return `${rowRole} · ${office}`;
    return rowRole;
  }

  function buildRepNameCell(name, row) {
    const displayName = String(name || "").trim();
    const sub = repRoleOffice(displayName);
    const btn = `<button type="button" class="rep-card-name-button" data-rep-card-name="${escapeAttr(displayName)}">${escapeHtml(displayName)}</button>`;
    // Bagels skin: a "# Bagels" badge to the RIGHT of the name (kept on one line
    // with the name via an inline-flex wrapper).
    const bagelTag = bagelTagHtmlForName(displayName);
    const nameEl = bagelTag ? `<span class="rep-name-line">${btn}${bagelTag}</span>` : btn;

    // Mexico skin: goal = YTD installs vs the 35 (Expert) / 15 (Setter) threshold,
    // with the role relabeled to "Expert Setter" where relevant.
    if (mexicoOn) {
      const norm = normalizeName(displayName);
      const inst = mexicoInstalls(norm);
      const req = mexicoRequired(norm);
      const ss = mexicoSecondSystems(norm);
      const pct = Math.max(0, Math.min(100, Math.round((inst / req) * 100)));
      const done = inst >= req;
      const mSub = mexicoRoleOffice(displayName);
      const goalLabel = `<span class="rep-goal-label">${inst}<span>/${req} Installs</span></span>`;
      let subLine;
      if (ss > 0) {
        // Install count gets a "N Second Systems" line under it; the stack is
        // vertically centered against the office/title.
        const ssLabel = `<span class="mex-ss-note">${ss} Second System${ss === 1 ? "" : "s"}</span>`;
        subLine = `<div class="rep-row-sub mex-sub-ss">${mSub ? `<span class="mex-role">${escapeHtml(mSub)}</span>` : ""}<span class="mex-inst-stack">${goalLabel}${ssLabel}</span></div>`;
      } else {
        subLine = `<div class="rep-row-sub">${mSub ? escapeHtml(mSub) + " · " : ""}${goalLabel}</div>`;
      }
      const bar = `<div class="rep-goal-track"><div class="rep-goal-fill${done ? " done" : ""}" style="width:${pct}%"></div></div>`;
      return `<div class="rep-name-cell has-goal">${nameEl}${subLine}${bar}</div>`;
    }

    // Outside the goal tabs: original simple name + role/office stack.
    if (["wtd", "mtd", "ytd"].indexOf(activeDateMode) === -1) {
      return `<div class="rep-name-cell">${nameEl}${sub ? `<div class="rep-row-sub">${escapeHtml(sub)}</div>` : ""}</div>`;
    }

    // Inactive reps (shown inline when the toggle is on): "Not in Market" in
    // place of the goal bar.
    if (row && isRowInactive(row)) {
      const subLine = `<div class="rep-row-sub">${sub ? escapeHtml(sub) + " · " : ""}<span class="rep-goal-none">Not in Market</span></div>`;
      return `<div class="rep-name-cell has-goal">${nameEl}${subLine}</div>`;
    }

    // Goal tabs: SAME name + title row as the standard layout (position unchanged),
    // with the goal number joined onto the title via a dot, and the bar added
    // directly under the title row.
    const p = getRepGoalProgress(displayName, row);
    const pct = p ? p.pct : 0;
    const done = p && p.pct >= 100;
    const goalLabel = p
      ? `<span class="rep-goal-label">${p.current}<span>/${p.target} ${escapeHtml(p.label)}</span></span>`
      : `<span class="rep-goal-none">No Goal</span>`;
    const subLine = `<div class="rep-row-sub">${sub ? escapeHtml(sub) + " · " : ""}${goalLabel}</div>`;
    const bar = `<div class="rep-goal-track"><div class="rep-goal-fill${done ? " done" : ""}" style="width:${pct}%"></div></div>`;
    return `<div class="rep-name-cell has-goal">${nameEl}${subLine}${bar}</div>`;
  }

  // Per-rep goal progress for the active timeframe:
  //   WTD -> this week's internal CS vs weekly CS goal
  //   MTD -> Tableau month (SRA setters / CAP experts) vs monthly goal
  //   YTD -> Tableau year  (SRA setters / CAP experts) vs yearly goal
  // Returns null when there's no goal for the active timeframe (or an off mode).
  function getRepGoalProgress(repName, row) {
    const norm = normalizeName(repName);
    const goal = repGoals[norm];
    if (!goal) return null;

    let target = null, current = 0, label = "";
    if (activeDateMode === "wtd") {
      target = goal.weeklyCs;
      if (isPlataRep(norm)) {
        // Plata has no internal CS — measure the weekly goal against Tableau SRA.
        label = "SRA";
        const trow = getTableauRowForDateMode(norm, "wtd");
        current = trow ? (Number(trow.sra) || 0) : 0;
      } else {
        label = "CS";
        current = Number(row && row.cs) || 0; // internal CS for the active (WTD) range
      }
    } else if (activeDateMode === "mtd" || activeDateMode === "ytd") {
      target = activeDateMode === "mtd" ? goal.monthly : goal.yearly;
      const metric = (goal.metric || "SRA").toLowerCase(); // sra | cap | cs
      label = (goal.metric || "SRA").toUpperCase();
      if (metric === "cs") {
        // Not-onboarded reps: no Tableau data — measure against INTERNAL CS.
        current = getRepDiscordCsForRange(repName, activeDateMode);
      } else {
        const trow = getTableauRowForDateMode(norm, activeDateMode);
        current = trow ? (Number(trow[metric]) || 0) : 0;
      }
    } else {
      return null; // today / lastWeek / custom -> no bar
    }

    if (target == null || target === "" || Number(target) <= 0) return null;
    target = Number(target);
    const pct = Math.max(0, Math.min(100, Math.round((current / target) * 100)));
    return { label: label, current: current, target: target, pct: pct };
  }

  function getRecruitingRowForRep(repName) {
    const norm = normalizeName(repName);
    return recruitingRows.find(row => normalizeName(row.name) === norm) || null;
  }

  function repContributesToDeal(deal, repNorm) {
    const dealId = getDealId(deal);
    if (!dealId) return false;

    const expertNorm = normalizeName(deal.expert);
    if (expertNorm === repNorm) return true;

    const setterNorm = normalizeName(deal.setter);
    return isValidSetterName(deal.setter) && setterNorm === repNorm;
  }

  function getRepDiscordCsForRange(repName, mode) {
    const repNorm = normalizeName(repName);
    if (!repNorm) return 0;

    const range = getDateRange(mode);
    const dealIds = new Set();

    allDeals.forEach(deal => {
      if (!dealInDateRange(deal, range)) return;
      if (repContributesToDeal(deal, repNorm)) {
        dealIds.add(getDealId(deal));
      }
    });

    return dealIds.size;
  }

  function getRepTableauStatsForPeriod(repName, periodKey) {
    const row = getTableauRowForDateMode(normalizeName(repName), periodKey);
    if (!row || !hasTableauRowData(row)) return null;

    return {
      cs: row.cs,
      sra: row.sra,
      cap: row.cap,
      ic: row.ic
    };
  }

  function formatRepCardStatValue(value) {
    if (value === null || value === undefined || value === "") return "—";
    return String(value);
  }

  function formatRepCardTableauSub(stats) {
    if (!stats) {
      return `<div class="rep-card-tableau-block"><div class="rep-card-tableau-heading">Tableau Data</div><div>—</div></div>`;
    }

    const metrics = [
      `CS: ${formatRepCardStatValue(stats.cs)}`,
      `SRA: ${formatRepCardStatValue(stats.sra)}`,
      `CAP: ${formatRepCardStatValue(stats.cap)}`,
      `IC: ${formatRepCardStatValue(stats.ic)}`
    ];

    const metricsHtml = metrics
      .map(metric => `<span class="rep-card-tableau-metric">${escapeHtml(metric)}</span>`)
      .join("");

    return `<div class="rep-card-tableau-block"><div class="rep-card-tableau-heading">Tableau Data</div><div class="rep-card-tableau-metrics">${metricsHtml}</div></div>`;
  }

  function getRepYtdDiscordCs(repName) {
    return getRepDiscordCsForRange(repName, "ytd");
  }

  function getRepYtdContribution(repName) {
    const repNorm = normalizeName(repName);
    if (!repNorm) return 0;

    const range = getDateRange("ytd");
    let sets = 0;
    let closes = 0;

    allDeals.forEach(deal => {
      if (!dealInDateRange(deal, range)) return;
      if (isValidSetterName(deal.setter) && normalizeName(deal.setter) === repNorm) sets += 1;
      if (normalizeName(deal.expert) === repNorm) closes += 1;
    });

    return (sets + closes) / 2;
  }

  function getRepTableauMetricValue(repName, metric) {
    const row = getTableauRowForDateMode(normalizeName(repName), "ytd");
    if (!row) return null;

    const value = row[metric];
    if (value === null || value === undefined || value === "") return null;
    return value;
  }

  function getRepBestMonthCs(repName) {
    const repNorm = normalizeName(repName);
    if (!repNorm) return 0;

    const monthly = new Map();

    allDeals.forEach(deal => {
      if (!deal.date) return;
      if (!repContributesToDeal(deal, repNorm)) return;

      const monthKey = deal.date.slice(0, 7);
      if (!monthly.has(monthKey)) monthly.set(monthKey, new Set());
      monthly.get(monthKey).add(getDealId(deal));
    });

    let best = 0;
    monthly.forEach(dealIds => {
      if (dealIds.size > best) best = dealIds.size;
    });

    return best;
  }

  function getRepBestWeekCs(repName) {
    const repNorm = normalizeName(repName);
    if (!repNorm) return 0;

    const weekly = new Map();

    allDeals.forEach(deal => {
      if (!deal.date) return;
      if (!repContributesToDeal(deal, repNorm)) return;

      const weekKey = formatDate(getMondayOfWeek(new Date(`${deal.date}T12:00:00`)));
      if (!weekly.has(weekKey)) weekly.set(weekKey, new Set());
      weekly.get(weekKey).add(getDealId(deal));
    });

    let best = 0;
    weekly.forEach(dealIds => {
      if (dealIds.size > best) best = dealIds.size;
    });

    return best;
  }

  function getEligibleRepNamesForRank() {
    ensureRecruitingNames();
    const names = [];

    recruitingRows.forEach(row => {
      const norm = normalizeName(row.name);
      if (!norm || HIDDEN_REPS.has(norm)) return;
      names.push(String(row.name).trim());
    });

    return names;
  }

  function getCompetitionRank(sortedItems, targetNorm, getNorm) {
    let rank = null;
    let currentRank = 0;
    let previousValue = null;

    sortedItems.forEach((item, index) => {
      const value = item.value;
      if (value !== previousValue) {
        currentRank = index + 1;
        previousValue = value;
      }
      if (getNorm(item) === targetNorm) {
        rank = currentRank;
      }
    });

    return rank;
  }

  function getRepYtdDiscordRank(repName) {
    const targetNorm = normalizeName(repName);
    const scored = getEligibleRepNamesForRank()
      .map(name => ({
        norm: normalizeName(name),
        name: String(name).trim(),
        discordCs: getRepYtdDiscordCs(name),
        contribution: getRepYtdContribution(name)
      }))
      .sort((a, b) => {
        if (b.discordCs !== a.discordCs) return b.discordCs - a.discordCs;
        if (b.contribution !== a.contribution) return b.contribution - a.contribution;
        return a.name.localeCompare(b.name);
      });

    const index = scored.findIndex(item => item.norm === targetNorm);
    return index >= 0 ? index + 1 : null;
  }

  function compareTableauRankRows(a, b, metric) {
    if (metric === "sra") {
      if (b.sra !== a.sra) return b.sra - a.sra;
      if (b.cap !== a.cap) return b.cap - a.cap;
      if (b.ic !== a.ic) return b.ic - a.ic;
      return a.name.localeCompare(b.name);
    }

    if (metric === "cap") {
      if (b.cap !== a.cap) return b.cap - a.cap;
      if (b.ic !== a.ic) return b.ic - a.ic;
      if (b.sra !== a.sra) return b.sra - a.sra;
      return a.name.localeCompare(b.name);
    }

    if (metric === "ic") {
      if (b.ic !== a.ic) return b.ic - a.ic;
      if (b.cap !== a.cap) return b.cap - a.cap;
      if (b.sra !== a.sra) return b.sra - a.sra;
      return a.name.localeCompare(b.name);
    }

    const aValue = Number(a[metric]) || 0;
    const bValue = Number(b[metric]) || 0;
    if (bValue !== aValue) return bValue - aValue;
    return a.name.localeCompare(b.name);
  }

  function getTableauMetricRank(repName, metric) {
    const dataset = tableauData.ytd;
    if (!dataset || !Array.isArray(dataset.rows)) return null;

    const targetNorm = normalizeName(repName);
    const scored = dataset.rows
      .map(row => ({
        norm: normalizeName(row.name),
        name: String(row.name || "").trim(),
        cs: Number(row.cs) || 0,
        sra: Number(row.sra) || 0,
        cap: Number(row.cap) || 0,
        ic: Number(row.ic) || 0
      }))
      .filter(row => row.norm)
      .sort((a, b) => compareTableauRankRows(a, b, metric));

    const index = scored.findIndex(item => item.norm === targetNorm);
    return index >= 0 ? index + 1 : null;
  }

  function getGroupLeaderYtdTotal(leaderName) {
    const downline = buildDownlineSetFromRows(recruitingRows, leaderName);
    const ytdDeals = allDeals.filter(deal => dealInDateRange(deal, getDateRange("ytd")));
    let sets = 0;
    let cs = 0;

    ytdDeals.forEach(deal => {
      const setterNorm = normalizeName(deal.setter);
      const expertNorm = normalizeName(deal.expert);
      if (downline.has(setterNorm) && isValidSetterName(deal.setter)) sets += 1;
      if (downline.has(expertNorm)) cs += 1;
    });

    return (sets + cs) / 2;
  }

  function leaderQualifiesForGroup(leaderName) {
    const norm = normalizeName(leaderName);
    if (!norm || HIDDEN_REPS.has(norm)) return false;
    if (EXCLUDED_GROUP_LEADERS.has(norm)) return false;
    if (OFFICE_GROUP_LABELS.has(norm)) return false;
    return getGroupLeaderYtdTotal(leaderName) >= 25;
  }

  function getLowestQualifyingGroup(repName) {
    const row = getRecruitingRowForRep(repName);
    const path = String(row?.treePath || "");
    const repNorm = normalizeName(repName);

    const candidates = path
      .split(">")
      .map(part => String(part || "").trim())
      .filter(Boolean)
      .filter(name => {
        const norm = normalizeName(name);
        if (norm === repNorm) return false;
        if (HIDDEN_REPS.has(norm)) return false;
        if (EXCLUDED_GROUP_LEADERS.has(norm)) return false;
        if (OFFICE_GROUP_LABELS.has(norm)) return false;
        return true;
      });

    for (let i = candidates.length - 1; i >= 0; i--) {
      if (leaderQualifiesForGroup(candidates[i])) {
        return `${candidates[i]} Group`;
      }
    }

    if (candidates.length) {
      return `${candidates[candidates.length - 1]} Group`;
    }

    if (row?.directRecruiter) {
      return `${row.directRecruiter} Group`;
    }

    return "—";
  }

  function applyTemporaryRepCardGroupOverride(repName, groupLabel, groupLeader, isPlata) {
    // TEMPORARY BASEBALL-CARD GROUP OVERRIDE START
    // This group-display override is intentionally isolated to baseball cards only.
    // The reporting structure for Adam/Ruan/Justin/Kelton downlines is not finalized.
    // In particular, there is an unresolved conversation about whether Justin Wall group reps
    // should be treated as directly under Adam/Ruan in all aspects or only in certain reporting views.
    // This should be corrected later when the final reporting hierarchy is decided.

    let resultLabel = groupLabel;
    let resultLeader = groupLeader;

    if (!isPlata && groupLeader) {
      const leaderNorm = normalizeName(groupLeader);

      if (leaderNorm === "adam lloyd") {
        resultLabel = null;
        resultLeader = null;
      } else if (
        leaderNorm === "justin wall" ||
        leaderNorm === "ruan meyer" ||
        leaderNorm === "kelton higgins"
      ) {
        if (leaderQualifiesForGroup(repName)) {
          resultLabel = `${repName} Group`;
          resultLeader = repName;
        } else {
          resultLabel = null;
          resultLeader = null;
        }
      }
    }

    // TEMPORARY BASEBALL-CARD GROUP OVERRIDE END
    return { groupLabel: resultLabel, groupLeader: resultLeader };
  }

  function getRepProfileInfo(repName) {
    const displayName = String(repName || "").trim();
    const norm = normalizeName(repName);
    const row = getRecruitingRowForRep(repName);
    const isPlata = isPlataRep(norm);
    const ytdRange = getDateRange("ytd");
    let hasClose = false;
    let hasSet = false;

    allDeals.forEach(deal => {
      if (!dealInDateRange(deal, ytdRange)) return;
      if (normalizeName(deal.expert) === norm) hasClose = true;
      if (isValidSetterName(deal.setter) && normalizeName(deal.setter) === norm) hasSet = true;
    });

    let role = row?.role || row?.title || "";
    if (MARKET_LEADER_NAMES.has(norm)) {
      role = "Market Leader";
    } else if (isPlata) {
      role = isPlataExpert(norm) ? "Expert" : "Setter"; // title from the Tableau Experts list
    } else if (!role) {
      if (hasClose) role = "Expert";
      else if (hasSet) role = "Setter";
      else role = "Rep";
    }

    let office = row?.office || "";
    if (isPlata) {
      office = "Plata";
    } else if (!office) {
      ensureOfficeNameSets();
      if (iceCollectiveNames.has(norm)) office = "Ice Collective";
      else if (riotNames.has(norm)) office = "Riot";
      else office = "—";
    }

    let officeKey = "";
    if (isPlata) {
      officeKey = "plata";
    } else if (normalizeName(office) === "ice collective") {
      officeKey = "ice-collective";
    } else if (normalizeName(office) === "riot") {
      officeKey = "riot";
    }

    let groupLabel = null;
    let groupLeader = null;
    if (!isPlata) {
      const managementGroup = getLowestQualifyingGroup(repName);
      if (managementGroup && managementGroup !== "—") {
        groupLabel = managementGroup;
        groupLeader = managementGroup.replace(/\s+Group$/i, "").trim();
      }
      const groupOverride = applyTemporaryRepCardGroupOverride(displayName, groupLabel, groupLeader, isPlata);
      groupLabel = groupOverride.groupLabel;
      groupLeader = groupOverride.groupLeader;
    }

    const submitted = repProfiles[norm] || {};

    return {
      name: displayName || "—",
      role,
      office,
      officeKey,
      groupLabel,
      groupLeader,
      isPlata,
      phone: submitted.phone || "",
      instagram: submitted.instagram || "",
      photoUrl: submitted.photoUrl || ""
    };
  }

  // CS breakdown (self-gen + set-only) for a rep over any deal filter.
  function repCsBreakdown(repName, filterFn) {
    const norm = normalizeName(repName);
    const sgIds = new Set(), setIds = new Set();
    allDeals.forEach(d => {
      if (!filterFn(d)) return;
      const s = normalizeName(d.setter), e = normalizeName(d.expert), id = getDealId(d);
      const validS = isValidSetterName(d.setter);
      if (e === norm && s === norm && validS) sgIds.add(id);          // self-gen
      else if (s === norm && e !== norm && validS) setIds.add(id);    // set only
    });
    return { selfGen: sgIds.size, setOnly: setIds.size };
  }
  function repExtrasForRange(repName, mode) {
    const range = getDateRange(mode);
    return repCsBreakdown(repName, d => dealInDateRange(d, range));
  }
  // Best calendar month/week CS, plus the SG/Sets breakdown for that period.
  function repBestPeriodInfo(repName, keyFn) {
    const norm = normalizeName(repName);
    // DISPLAY = best single period by UNIQUE DEALS (self-gen counts once). The
    // pecking-order ranking (getPrStats) uses total contribution instead, so
    // self-gens still move a rep up the rank even though the shown number is deals.
    const buckets = new Map();
    allDeals.forEach(d => {
      if (!d.date || !repContributesToDeal(d, norm)) return;
      const k = keyFn(d);
      if (!buckets.has(k)) buckets.set(k, new Set());
      buckets.get(k).add(getDealId(d));
    });
    let bestK = null, best = 0;
    buckets.forEach((ids, k) => { if (ids.size > best) { best = ids.size; bestK = k; } });
    const extras = bestK ? repCsBreakdown(repName, d => d.date && keyFn(d) === bestK) : { selfGen: 0, setOnly: 0 };
    return { cs: best, selfGen: extras.selfGen, setOnly: extras.setOnly };
  }

  // PR ("personal record") cohort stats: for each rep, their best single month /
  // week of internal CS (contributions), plus the cohort = # of reps with >=1
  // internal CS this year. Used to show "1 of N · Top X%" on the PR tiles.
  function getPrStats() {
    if (prStatsCache) return prStatsCache;
    const year = formatDate(new Date()).slice(0, 4);
    // Count TOTAL CONTRIBUTION (sets + closes) per period — a self-gen counts the
    // rep twice (once as setter, once as expert), so self-gens raise their PR.
    const monthCnt = {}, weekCnt = {}, ytdCnt = {};
    allDeals.forEach(d => {
      if (!d.date) return;
      const e = normalizeName(d.expert), s = normalizeName(d.setter);
      const reps = [];
      if (e) reps.push(e);                                  // a close
      if (s && isValidSetterName(d.setter)) reps.push(s);   // a set (self-gen: same rep added again)
      if (!reps.length) return;
      const mk = d.date.slice(0, 7);
      const wk = formatDate(getMondayOfWeek(new Date(`${d.date}T12:00:00`)));
      const thisYear = d.date.slice(0, 4) === year;
      reps.forEach(rep => {
        const mkey = rep + "|" + mk; monthCnt[mkey] = (monthCnt[mkey] || 0) + 1;
        const wkey = rep + "|" + wk; weekCnt[wkey] = (weekCnt[wkey] || 0) + 1;
        if (thisYear) ytdCnt[rep] = (ytdCnt[rep] || 0) + 1;
      });
    });
    const bestMonth = {}, bestWeek = {};
    Object.keys(monthCnt).forEach(k => { const r = k.slice(0, k.lastIndexOf("|")); const n = monthCnt[k]; if (n > (bestMonth[r] || 0)) bestMonth[r] = n; });
    Object.keys(weekCnt).forEach(k => { const r = k.slice(0, k.lastIndexOf("|")); const n = weekCnt[k]; if (n > (bestWeek[r] || 0)) bestWeek[r] = n; });
    const cohort = Object.keys(ytdCnt).filter(r => ytdCnt[r] > 0).length;
    prStatsCache = { bestMonth, bestWeek, cohort };
    return prStatsCache;
  }
  // "1 of N · Top X%" for a rep's PR month/week (kind: "month" | "week").
  function repPrSub(repName, kind) {
    const stats = getPrStats();
    const map = kind === "month" ? stats.bestMonth : stats.bestWeek;
    const myBest = map[normalizeName(repName)] || 0;
    if (myBest <= 0 || !stats.cohort) return "";
    let n = 0;
    Object.keys(map).forEach(r => { if (map[r] >= myBest) n++; });
    const pct = Math.max(1, Math.round((n / stats.cohort) * 100));
    return `1 of ${n} · Top ${pct}%`;
  }

  // "Bagels" = working days (NOT counting today, and NOT counting Sundays) a rep
  // has gone without a credited deal (set OR close). Always vs the real current
  // date. A Sunday deal still resets the streak, but a Sunday with no deal does
  // not count against the rep (Sunday isn't a normal working day).
  //   e.g. (today Tue): last deal this Fri -> 2 ; last deal the prior Fri -> 8.
  //   never sold -> counts all the way back to the earliest loaded deal.
  // Also flags reps with ZERO credited deals across the last completed calendar
  // week (Mon–Sun) and across the last two.
  function getBagelData() {
    if (bagelDataCache) return bagelDataCache;

    const todayStr = formatDate(new Date());
    const dayNum = s => {
      const p = String(s).split("-");
      return Math.floor(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000);
    };
    const addDays = (s, n) => {
      const p = String(s).split("-");
      return formatDate(new Date(+p[0], +p[1] - 1, +p[2] + n));
    };
    const todayNum = dayNum(todayStr);
    const lastWeek = getDateRange("lastWeek");        // most recent completed Mon–Sun
    const twoStart = addDays(lastWeek.start, -7);      // start of the week before that
    const thisWeek = getDateRange("wtd");             // current (in-progress) Mon–today

    // Sunday detection by day-index residue (derived, TZ-safe).
    const todayDow = new Date(todayNum * 86400000).getUTCDay();
    const sundayRes = (((todayNum % 7) - todayDow) % 7 + 7) % 7;
    const countSundays = (lo, hi) => {
      if (hi < lo) return 0;
      let first = lo + ((((sundayRes - (lo % 7)) % 7) + 7) % 7);
      if (first > hi) return 0;
      return Math.floor((hi - first) / 7) + 1;
    };

    const lastDate = new Map();        // norm -> latest credited-deal date string
    const inLastWeek = new Set();      // had a credited deal in the last completed week
    const inTwoWeeks = new Set();      // ...in either of the last two completed weeks
    const inThisWeek = new Set();      // ...in the current (in-progress) week
    let earliest = todayStr;

    allDeals.forEach(d => {
      const date = d.date;
      if (!date) return;
      if (date < earliest) earliest = date;
      // Credit the same way the leaderboard does (getRepMap credits any non-hidden
      // setter/expert), so a rep with a deal today always reads 0 bagels — even if
      // the setter name is a placeholder like "Unknown".
      const expert = normalizeName(d.expert);
      const setter = normalizeName(d.setter);
      [expert, setter].forEach(norm => {
        if (!norm || HIDDEN_REPS.has(norm)) return;
        const cur = lastDate.get(norm);
        if (!cur || date > cur) lastDate.set(norm, date);
        if (date >= lastWeek.start && date <= lastWeek.end) inLastWeek.add(norm);
        if (date >= twoStart && date <= lastWeek.end) inTwoWeeks.add(norm);
        if (date >= thisWeek.start && date <= thisWeek.end) inThisWeek.add(norm);
      });
    });

    const earliestNum = dayNum(earliest);
    // Completed weekdays so far this week (Mon..yesterday, excluding Sundays) —
    // used for the Plata lower-bound estimate.
    const mondayNum = dayNum(formatDate(getMondayOfWeek(new Date(todayStr + "T12:00:00"))));
    const completedThisWeek = (() => {
      const lo = mondayNum, hi = todayNum - 1;
      if (hi < lo) return 0;
      return Math.max(0, (hi - lo + 1) - countSundays(lo, hi));
    })();
    bagelDataCache = {
      bagels(norm) {
        const d = lastDate.get(norm);
        const baseNum = d ? dayNum(d) : earliestNum;
        const lo = baseNum + 1, hi = todayNum - 1;   // days strictly between last deal and today
        if (hi < lo) return 0;
        return Math.max(0, (hi - lo + 1) - countSundays(lo, hi));
      },
      bageledLastWeek(norm) { return !inLastWeek.has(norm); },
      bageledTwoWeeks(norm) { return !inTwoWeeks.has(norm); },
      soldThisWeek(norm) { return inThisWeek.has(norm); }, // a sale this week clears the cold flag
      hasEverSold(norm) { return lastDate.has(norm); }, // any credited deal this year
      // Plata lower-bound bagel estimate (no daily data, only weekly Tableau SRA):
      // sold this week -> 0; else 6 (full prior week) only if they also didn't
      // sell last week, plus the weekdays completed so far this week.
      plataBagels(soldThisWeek, soldLastWeek) {
        if (soldThisWeek) return 0;
        return (soldLastWeek ? 0 : 6) + completedThisWeek;
      }
    };
    return bagelDataCache;
  }

  // "# Bagels" badge HTML for a rep by name. Empty when the skin is off, or for
  // Plata / inactive reps (excluded). Colored yellow if they bageled all of last
  // week / red for the last two — but only while ON a streak (count > 0).
  function bagelTagHtmlForName(name) {
    if (!bagelsOn) return "";
    const norm = normalizeName(name);
    if (!norm || getInactiveSet().has(norm)) return "";
    // Plata: lower-bound estimate from weekly Tableau SRA ("≥N Bagels", yellow when cold).
    if (isPlataRep(norm)) {
      const info = plataBagelInfo(norm);
      if (info.soldThisWeek) return `<span class="rep-bagel-tag bagel-sold">Sold</span>`;
      return `<span class="rep-bagel-tag${info.cold ? " bagel-week" : ""}">&ge; ${info.count} Bagels</span>`;
    }
    const b = getBagelData();
    // Never sold this year -> "Hasn't Sold" (red), ranked as the most bagels.
    if (!b.hasEverSold(norm)) return `<span class="rep-bagel-tag bagel-neversold">Hasn't Sold</span>`;
    const count = b.bagels(norm);
    const colored = count > 0 && !b.soldThisWeek(norm); // a sale this week = not cold
    const cls = count === 0 ? " bagel-sold"             // 0 bagels = sold recently = green
              : (colored && b.bageledTwoWeeks(norm)) ? " bagel-2week"
              : (colored && b.bageledLastWeek(norm)) ? " bagel-week" : "";
    return `<span class="rep-bagel-tag${cls}">${count === 1 ? "1 Bagel" : count + " Bagels"}</span>`;
  }

  // Groups-list badge: counts of a group's reps who bageled last week (yellow) /
  // the last two weeks (red), using the same yellow/red sets the rep rows use.
  // Desktop spells it out; mobile shows just "N Reps".
  function buildGroupBagelBadge(downline, yellowSet, redSet) {
    if (!bagelsOn || !downline) return "";
    let y = 0, r = 0;
    downline.forEach(n => { if (redSet.has(n)) r++; else if (yellowSet.has(n)) y++; });
    if (!y && !r) return "";
    let html = "";
    if (y) html += `<span class="group-bagel-line gb-yellow"><span class="gb-full">${y} ${y === 1 ? "rep" : "reps"} didn't sell last week</span><span class="gb-short">${y} ${y === 1 ? "Rep" : "Reps"}</span></span>`;
    if (r) html += `<span class="group-bagel-line gb-red"><span class="gb-full">${r} ${r === 1 ? "rep hasn't" : "reps haven't"} sold the past two weeks</span><span class="gb-short">${r} ${r === 1 ? "Rep" : "Reps"}</span></span>`;
    return `<span class="group-bagel-tags">${html}</span>`;
  }

  // Groups-list badge for Mexico: how many of a group's reps have QUALIFIED
  // (installs >= their threshold) and how many are HALFWAY there (>= 50%, < 100%).
  function buildGroupMexicoBadge(downline, qualSet, halfSet) {
    if (!mexicoOn || !downline) return "";
    let q = 0, h = 0;
    downline.forEach(n => { if (qualSet.has(n)) q++; else if (halfSet.has(n)) h++; });
    // Always show both lines (including 0).
    const html =
      `<span class="group-bagel-line gx-qual"><span class="gb-full">${q} ${q === 1 ? "rep" : "reps"} qualified for Mexico</span><span class="gb-short">${q} Qualified</span></span>` +
      `<span class="group-bagel-line gx-half"><span class="gb-full">${h} ${h === 1 ? "rep" : "reps"} halfway there</span><span class="gb-short">${h} Halfway</span></span>`;
    return `<span class="group-bagel-tags">${html}</span>`;
  }

  // Extra class for a rep row's background when the bagel skin is on. No tint for
  // a streak of 0 (they sold recently, so they're off the streak).
  function bagelRowClass(row) {
    if (!bagelsOn) return "";
    const b = getRowBagels(row);
    if (!b || b.count <= 0) return "";
    return b.twoWeeks ? " bagel-row-2week" : (b.lastWeek ? " bagel-row-week" : "");
  }

  // Bagel info for a leaderboard row. Plata AND inactive reps are excluded
  // ("not included") — they carry no bagel data, only sort to the bottom.
  function getRowBagels(row) {
    const norm = normalizeName(row && row.name);
    if (!norm || isRowInactive(row)) return null;
    if (isPlataRep(norm) || row.isPlataOnly) {
      const info = plataBagelInfo(norm);
      return { count: info.count, plata: true, neverSold: false, lastWeek: info.cold, twoWeeks: false };
    }
    const b = getBagelData();
    const soldThisWeek = b.soldThisWeek(norm);
    return {
      count: b.bagels(norm),
      neverSold: !b.hasEverSold(norm),
      // A sale this week means they're not "cold" — clear the yellow/red flags.
      lastWeek: b.bageledLastWeek(norm) && !soldThisWeek,
      twoWeeks: b.bageledTwoWeeks(norm) && !soldThisWeek
    };
  }

  // Bagels button: 1st click turns the skin on + sorts by bagels; while on, a
  // different sort can be selected without turning it off; clicking Bagels again
  // re-sorts by bagels (if another sort is active) or turns the skin off (if it's
  // already sorting by bagels).
  function onBagelButtonClick() {
    if (!bagelsOn) {
      bagelsOn = true;
      activeSortMode = "bagels";
    } else if (activeSortMode !== "bagels") {
      activeSortMode = "bagels";
    } else {
      bagelsOn = false;
      activeSortMode = activeView === "selfgen" ? "selfGen" : "currentContribution";
    }
    updateBagelButtonState();
    renderLeaderboard();
  }
  window.onBagelButtonClick = onBagelButtonClick;

  function updateBagelButtonState() {
    const btn = document.getElementById("bagel-toggle");
    if (!btn) return;
    btn.classList.toggle("active", bagelsOn);
    btn.classList.toggle("bagel-sorting", bagelsOn && activeSortMode === "bagels");
  }

  // Sort comparator used when activeSortMode === "bagels": most bagels first;
  // ties -> Internal CS, SRA, CAP, IC, Name. Plata and (when shown) inactive reps
  // sink to the bottom, ordered among themselves by the same tie-breakers.
  function bagelBottomRank(row) {
    // Plata now ranks with everyone (by their ≥N estimate), not pinned to the bottom.
    if (showInactive && isRowInactive(row)) return 1;
    return 0;
  }
  function compareBagelRows(a, b) {
    const ra = bagelBottomRank(a), rb = bagelBottomRank(b);
    if (ra !== rb) return ra - rb;

    // Only active (rank 0) reps rank by bagels; inactive + Plata go purely on the
    // tie-breakers at the bottom. "Hasn't Sold" (never sold) ranks as the most.
    const bagelScore = r => {
      const g = getRowBagels(r);
      if (!g) return 0;
      if (g.neverSold) return Infinity;
      // Plata "Sold" (sold this week -> estimate 0) ranks just BELOW a 0-bagel rep.
      if (g.plata && (g.count || 0) === 0) return -0.5;
      // Plata estimate is a lower bound ("≥N") — rank just above an Ice/Riot rep with exactly N.
      if (g.plata) return (g.count || 0) + 0.5;
      return g.count || 0;
    };
    const ba = ra === 0 ? bagelScore(a) : -1;
    const bb = rb === 0 ? bagelScore(b) : -1;
    if (bb !== ba) return bb - ba;

    const tab = r => (r.tableau || {});
    if ((b.cs || 0) !== (a.cs || 0)) return (b.cs || 0) - (a.cs || 0);
    if ((+tab(b).sra || 0) !== (+tab(a).sra || 0)) return (+tab(b).sra || 0) - (+tab(a).sra || 0);
    if ((+tab(b).cap || 0) !== (+tab(a).cap || 0)) return (+tab(b).cap || 0) - (+tab(a).cap || 0);
    if ((+tab(b).ic || 0) !== (+tab(a).ic || 0)) return (+tab(b).ic || 0) - (+tab(a).ic || 0);
    return a.name.localeCompare(b.name);
  }

  // ---- Mexico incentive-trip skin (YTD installs vs 35 Expert / 15 Setter) ----
  // A rep is an Expert (needs 35) if listed in the Tableau Experts tab; everyone
  // else needs 15. Falls back to internal close-history until the tab is populated.
  function mexicoIsExpert(norm) {
    if (tableauExperts.size) return tableauExperts.has(norm);
    return repEverClosed(norm);
  }
  function mexicoRequired(norm) { return mexicoIsExpert(norm) ? 35 : 15; }
  function mexicoTableau(norm) {
    const t = getTableauRowForDateMode(norm, "ytd") || {};
    return { ic: Number(t.ic) || 0, sra: Number(t.sra) || 0, cap: Number(t.cap) || 0 };
  }
  function mexicoSecondSystems(norm) { return secondSystemsByName.get(norm) || 0; }
  // Installs NET of approved Second Systems (Tableau double-counts those).
  function mexicoInstalls(norm) {
    return Math.max(0, mexicoTableau(norm).ic - mexicoSecondSystems(norm));
  }
  function mexicoProgress(norm) {
    const req = mexicoRequired(norm);
    return req > 0 ? mexicoInstalls(norm) / req : 0;
  }
  // Title for the Mexico view: a Setter who's an Expert in Tableau shows
  // "Expert Setter"; otherwise the normal role/office.
  function mexicoRoleOffice(name) {
    const norm = normalizeName(name);
    const base = repRoleOffice(name);
    if (tableauExperts.has(norm) && !isPlataRep(norm) && !MARKET_LEADER_NAMES.has(norm) && !repEverClosed(norm)) {
      const idx = base.indexOf(" · ");
      return idx >= 0 ? "Expert Setter" + base.slice(idx) : "Expert Setter";
    }
    return base;
  }
  // Rank by proximity to qualifying (installs / required), so a Setter at 14/15
  // outranks an Expert at 20/35. Ties -> raw installs, then name.
  function compareMexicoRows(a, b) {
    const na = normalizeName(a.name), nb = normalizeName(b.name);
    const pa = mexicoProgress(na), pb = mexicoProgress(nb);
    if (pb !== pa) return pb - pa;
    const ia = mexicoInstalls(na), ib = mexicoInstalls(nb);
    if (ib !== ia) return ib - ia;
    return a.name.localeCompare(b.name);
  }

  function onMexicoButtonClick() {
    if (mexicoOn) return;            // already on; the Back button exits
    mexicoReturn = captureViewState();
    mexicoOn = true;
    bagelsOn = false;                // Mexico is its own skin
    showYoy = false; showMom = false; showCoc = false; // comparison can't share the Mexico skin
    activeDateMode = "ytd";          // Mexico is ALWAYS YTD (installs vs 35/15), ignore the time filter
    if (activeView === "selfgen") activeView = "general"; // SelfGen isn't a Mexico view
    activeSortMode = "currentContribution"; // default Mexico sort = qualifying %, not name
    tableauUserOff = false;                  // Mexico requires Tableau -> clear intentional-off
    if (!showTableau) setShowTableau(true);
    updateBagelButtonState();
    updateMexicoUI();
    renderLeaderboard();
    scrollLeaderboardToTop();   // re-show the top selectors when entering Mexico
    // Preload the Second System form in the background so the modal opens instantly.
    try { ensureSecondSystemOverlay(); } catch (e) {}
  }

  // Scroll the page so the leaderboard's top selectors are fully in view again.
  // Anchor on the (non-sticky) app container — the topbar is sticky, so its rect
  // top stays ~0 once stuck and can't tell us the document offset.
  function scrollLeaderboardToTop() {
    var anchor = document.getElementById("leaderboard-app");
    if (!anchor) { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    var top = 0, node = anchor;
    while (node) { top += node.offsetTop || 0; node = node.offsetParent; }
    window.scrollTo({ top: Math.max(0, top - 8), behavior: "smooth" });
  }
  // Mexico Rep toggle: name <-> qualifying-% sort.
  function toggleMexicoNameSort() {
    activeSortMode = activeSortMode === "name" ? "currentContribution" : "name";
    renderLeaderboard();
  }
  window.toggleMexicoNameSort = toggleMexicoNameSort;
  // Rep/Name header for Mexico (Rep button toggles name sort + Inactive toggle).
  function buildMexicoRepHeaderCell(label) {
    return `<div class="rep-header-controls">
      <button class="sort-header-button ${activeSortMode === "name" ? "active-sort" : ""}" onclick="toggleMexicoNameSort()">${label || "Rep"}</button>
      <button class="inactive-toggle ${showInactive ? "active-sort" : ""}" onclick="toggleInactive()">Inactive</button>
    </div>`;
  }
  // Sort comparator selector for Mexico (name when toggled, else qualifying %).
  function mexicoSortComparator() {
    return activeSortMode === "name"
      ? (a, b) => String(a.name).localeCompare(String(b.name))
      : compareMexicoRows;
  }
  function exitMexico() {
    const ret = mexicoReturn;
    mexicoOn = false;
    mexicoReturn = null;
    updateMexicoUI();
    if (ret) restoreViewState(ret);  // restores the exact prior view (incl. showTableau)
    else renderLeaderboard();
  }
  window.exitMexico = exitMexico;

  // Show/hide the Mexico image panel + Back button and hide the date controls.
  function updateMexicoUI() {
    const dateTabs = document.getElementById("date-tabs");
    const panel = document.getElementById("mexico-panel");
    const back = document.getElementById("mexico-back");
    if (dateTabs) dateTabs.style.display = mexicoOn ? "none" : "";
    // The Custom date inputs live in a separate element — hide them under Mexico
    // (Mexico is always YTD), and re-show only if we're back on the Custom tab.
    const customWrap = document.getElementById("custom-date-wrapper");
    if (customWrap) customWrap.style.display = (!mexicoOn && activeDateMode === "custom") ? "flex" : "none";
    if (panel) panel.style.display = mexicoOn ? "flex" : "none";
    // Hide the Mexico Back button inside a group/inactive drill — that view's own
    // "← Back" is the single exit; you land back in Groups (still Mexico) where the
    // Mexico Back button reappears.
    if (back) back.style.display = (mexicoOn && !activeGroupDrillLeader && !activeInactiveDrill) ? "inline-flex" : "none";
    const btn = document.getElementById("mexico-toggle");
    if (btn) btn.classList.toggle("active", mexicoOn);
    // SelfGen isn't a Mexico view — fade + disable that selector while Mexico is on.
    const viewTabs = document.getElementById("view-tabs");
    if (viewTabs) {
      Array.prototype.slice.call(viewTabs.querySelectorAll("button")).forEach(function (b) {
        if (b.textContent.trim() === "SelfGen") b.classList.toggle("mexico-faded", mexicoOn);
      });
    }
  }

  // A rep is INACTIVE this week if they have NONE of: weekly internal CS,
  // Tableau CS/SRA/CAP this week, or a submitted weekly goal. (Plata excluded.)
  // Always judged on the CURRENT WEEK regardless of the active date tab.
  function getInactiveSet() {
    if (inactiveSetCache) return inactiveSetCache;
    const set = new Set();
    const wtdRange = getDateRange("wtd");
    const wtdContrib = {}; // norm -> Set(dealId) of this-week contributions
    allDeals.forEach(d => {
      if (!dealInDateRange(d, wtdRange)) return;
      const id = getDealId(d);
      if (!id) return;
      const e = normalizeName(d.expert), s = normalizeName(d.setter);
      if (e) (wtdContrib[e] || (wtdContrib[e] = new Set())).add(id);
      if (s && isValidSetterName(d.setter)) (wtdContrib[s] || (wtdContrib[s] = new Set())).add(id);
    });
    const consider = {};
    recruitingRows.forEach(r => { const n = normalizeName(r.name); if (n) consider[n] = true; });
    Object.keys(wtdContrib).forEach(n => { consider[n] = true; });
    // Plata reps aren't in the recruiting tree — add them so they get active/
    // inactive status too (qualified by weekly Tableau SRA, not internal CS).
    tableauMap.forEach((row, norm) => { if (isPlataRep(norm)) consider[norm] = true; });
    Object.keys(consider).forEach(norm => {
      if (!norm || HIDDEN_REPS.has(norm)) return;
      // (Plata now included — qualified by weekly Tableau activity below.)
      // A brand-new rep with NO data at all (never sold AND no Tableau) is still
      // ramping to their first deal — keep them active ("Hasn't Sold"). But a rep
      // WITH Tableau data (e.g. recruiting-only reps like Brennan Whitney) follows
      // the normal rules below, so a dry week makes them inactive.
      if (!getBagelData().hasEverSold(norm) && !hasTableauDataForNorm(norm)) return;
      const goal = repGoals[norm];
      if (goal && goal.weeklyCs != null && Number(goal.weeklyCs) > 0) return; // has weekly goal
      if (wtdContrib[norm] && wtdContrib[norm].size > 0) return;              // weekly internal CS
      const t = getTableauRowForDateMode(norm, "wtd");
      if (t && ((Number(t.cs) || 0) > 0 || (Number(t.sra) || 0) > 0 || (Number(t.cap) || 0) > 0)) return; // weekly tableau
      set.add(norm);
    });
    inactiveSetCache = set;
    return set;
  }
  function isRowInactive(row) {
    return getInactiveSet().has(normalizeName(row && row.name));
  }
  // The inactive reps to actually display (drill-down + count). Starts from the
  // inactive rows in `currentRows`, then adds Tableau-recruiting inactive reps
  // that the General view would show but other views' `rows` omit (general is
  // the only view that calls addTableauRecruitingRepsToRows). This keeps the
  // "N Reps" count and the drill-down identical to the General view's roster.
  function getInactiveDisplayRows(currentRows) {
    const result = currentRows.filter(isRowInactive);
    const present = new Set(result.map(r => normalizeName(r.name)));
    const inactive = getInactiveSet();
    tableauMap.forEach((tRow, norm) => {
      if (present.has(norm) || !inactive.has(norm) || HIDDEN_REPS.has(norm)) return;
      if (!isRecruitingRep(norm) || !hasTableauRowData(tRow)) return;
      if (hasInternalRepHistory(norm)) return;
      if (!repInOfficeUmbrella(norm)) return;
      present.add(norm);
      result.push(buildEmptyInternalRow(tRow.name, tRow));
    });
    return result;
  }
  function toggleInactive() {
    showInactive = !showInactive;
    renderLeaderboard();
  }
  window.toggleInactive = toggleInactive;

  // Name cell for the "Inactive Reps" summary row — a button that drills into the
  // inactive reps (no role/office/goal). No baseball card. When `leader` is given
  // the drill is scoped to that group leader's downline (data-inactive-drill-leader);
  // otherwise it's the whole-team inactive drill (data-inactive-drill).
  function buildInactiveNameCell(leader) {
    const attr = leader
      ? `data-inactive-drill-leader="${escapeAttr(leader)}"`
      : `data-inactive-drill="1"`;
    return `<div class="rep-name-cell"><button type="button" class="rep-card-name-button inactive-reps-btn" ${attr}>Inactive Reps</button></div>`;
  }

  // REP column header: the Rep (name) sort button + the Inactive toggle.
  function buildRepHeaderCell() {
    return `<div class="rep-header-controls">
      <button class="sort-header-button ${activeSortMode === "name" ? "active-sort" : ""}" onclick="setNameSort()">Rep</button>
      <button class="inactive-toggle ${showInactive ? "active-sort" : ""}" onclick="toggleInactive()">Inactive</button>
    </div>`;
  }

  // Group-list ("Group") and leader-drill ("Name") header variants of the Rep
  // header: same Inactive toggle, different sort-button label.
  function buildNameHeaderCell(label) {
    return `<div class="rep-header-controls">
      <button class="sort-header-button ${activeSortMode === "name" ? "active-sort" : ""}" onclick="setNameSort()">${label}</button>
      <button class="inactive-toggle ${showInactive ? "active-sort" : ""}" onclick="toggleInactive()">Inactive</button>
    </div>`;
  }
  function buildDrillNameHeaderCell() { return buildNameHeaderCell("Name"); }
  function buildGroupHeaderCell() { return buildNameHeaderCell("Group"); }

  function buildRepCardData(repName) {
    const profile = getRepProfileInfo(repName);
    const ytdTableauRank = getTableauMetricRank(repName, "cs");
    const ytdDiscordCs = getRepYtdDiscordCs(repName);

    return {
      profile,
      periods: {
        ytd: {
          label: "YTD CS",
          discordCs: ytdDiscordCs,
          tableau: getRepTableauStatsForPeriod(repName, "ytd"),
          extras: repExtrasForRange(repName, "ytd")
        },
        mtd: {
          label: "MTD CS",
          discordCs: getRepDiscordCsForRange(repName, "mtd"),
          tableau: getRepTableauStatsForPeriod(repName, "mtd"),
          extras: repExtrasForRange(repName, "mtd")
        },
        wtd: {
          label: "WTD CS",
          discordCs: getRepDiscordCsForRange(repName, "wtd"),
          tableau: getRepTableauStatsForPeriod(repName, "wtd"),
          extras: repExtrasForRange(repName, "wtd")
        }
      },
      bestMonth: repBestPeriodInfo(repName, d => d.date.slice(0, 7)),
      bestWeek: repBestPeriodInfo(repName, d => formatDate(getMondayOfWeek(new Date(`${d.date}T12:00:00`)))),
      ytdDiscordRank: getRepYtdDiscordRank(repName),
      ytdDiscordCs,
      ytdTableauCsRank: ytdTableauRank,
      ytdTableauCsValue: getRepTableauMetricValue(repName, "cs"),
      ytdSraRank: getTableauMetricRank(repName, "sra"),
      ytdCapRank: getTableauMetricRank(repName, "cap"),
      ytdInstallRank: getTableauMetricRank(repName, "ic"),
      ytdSraValue: getRepTableauMetricValue(repName, "sra"),
      ytdCapValue: getRepTableauMetricValue(repName, "cap"),
      ytdIcValue: getRepTableauMetricValue(repName, "ic")
    };
  }

  function renderRepCardPlataPeriodStat(label, tableauStats) {
    const tableauHtml = formatRepCardTableauSub(tableauStats);

    return `
      <div class="rep-card-stat rep-card-stat-plata-period">
        <div class="rep-card-stat-label">${escapeHtml(label)}</div>
        <div class="rep-card-stat-plata-tableau">${tableauHtml}</div>
      </div>
    `;
  }

  function renderRepCardStat(label, value, options = {}) {
    const opts = typeof options === "string" ? { sub: options } : options;
    const sub = opts.sub || "";
    const subIsHtml = !!opts.subIsHtml;
    const valueNote = opts.valueNote || "";
    const displayValue = value === null || value === undefined ? "—" : value;

    const valueNoteHtml = valueNote
      ? `<span class="rep-card-stat-side-note">${escapeHtml(valueNote)}</span>`
      : "";

    return `
      <div class="rep-card-stat">
        <div class="rep-card-stat-label">${escapeHtml(label)}</div>
        <div class="rep-card-stat-value-wrap">
          ${valueNoteHtml}
          <div class="rep-card-stat-value">${escapeHtml(String(displayValue))}</div>
        </div>
        ${sub ? `<div class="rep-card-stat-sub">${subIsHtml ? sub : escapeHtml(sub)}</div>` : ""}
      </div>
    `;
  }

  function renderRepCardProfileMeta(profile) {
    const officeHtml = profile.officeKey
      ? `<button type="button" class="rep-card-action-button" data-rep-card-office="${escapeAttr(profile.officeKey)}">${escapeHtml(profile.office)}</button>`
      : `<span>${escapeHtml(profile.office)}</span>`;

    const groupHtml = profile.groupLabel && profile.groupLeader
      ? `<div class="rep-card-meta rep-card-meta-actions">
          <button type="button" class="rep-card-action-button" data-rep-card-group="${escapeAttr(profile.groupLeader)}">${escapeHtml(profile.groupLabel)}</button>
        </div>`
      : "";

    // Plata now carries a real title (Expert/Setter), so it uses the normal
    // "role · office" meta like everyone else (e.g. "Expert · Plata").
    return `
      <div class="rep-card-meta rep-card-meta-row">
        <span>${escapeHtml(profile.role)}</span>
        <span class="rep-card-meta-sep">·</span>
        ${officeHtml}
      </div>
      ${groupHtml}
    `;
  }

  function formatRepCardPhone(raw) {
    let d = String(raw || "").replace(/\D/g, "");
    if (d.length === 11 && d.charAt(0) === "1") d = d.slice(1);
    if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
    return String(raw || "");
  }

  function repCardPhoneTel(raw) {
    let d = String(raw || "").replace(/\D/g, "");
    if (d.length === 10) d = "1" + d;
    return d ? "+" + d : "";
  }

  function repCardInitials(name) {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    return (parts[0][0] + (parts[1] ? parts[1][0] : "")).toUpperCase();
  }

  function repCardMetrics(t) {
    if (!t || (t.cs == null && t.sra == null && t.cap == null && t.ic == null)) {
      return `<div class="rc-metrics rc-empty">—</div>`;
    }
    const n = v => (v == null ? 0 : v);
    // 2x2 grid: CS / SRA on top, CAP / IC below.
    return `<div class="rc-metrics rc-metrics-grid"><span>CS ${n(t.cs)}</span><span>SRA ${n(t.sra)}</span><span>CAP ${n(t.cap)}</span><span>IC ${n(t.ic)}</span></div>`;
  }

  function repCardChips(profile) {
    const office = profile.officeKey
      ? `<button type="button" class="rep-card-action-button" data-rep-card-office="${escapeAttr(profile.officeKey)}">${escapeHtml(profile.office)}</button>`
      : (profile.office && profile.office !== "—" ? `<span class="rep-card-action-button">${escapeHtml(profile.office)}</span>` : "");
    const group = (profile.groupLabel && profile.groupLeader)
      ? `<button type="button" class="rep-card-action-button" data-rep-card-group="${escapeAttr(profile.groupLeader)}">${escapeHtml(profile.groupLabel)}</button>`
      : "";
    return `<div class="rep-card-meta-row">${office}${group}</div>`;
  }

  // A CS value with SG / Sets shown stacked to its left (when relevant).
  function repCardCsValue(val, extras) {
    const notes = [];
    if (extras) {
      if (extras.selfGen > 0) notes.push(`<span>SG ${extras.selfGen}</span>`);
      if (extras.setOnly > 0) notes.push(`<span>Sets ${extras.setOnly}</span>`);
    }
    const left = notes.length ? `<div class="rc-sgsets">${notes.join("")}</div>` : "";
    return `<div class="rc-valwrap">${left}<div class="rep-card-stat-value">${escapeHtml(String(val == null ? "—" : val))}</div></div>`;
  }

  function repCardPeriodTile(p, isPlata, showExtras) {
    const val = isPlata ? (p.tableau && p.tableau.cs != null ? p.tableau.cs : "—") : (p.discordCs != null ? p.discordCs : "—");
    // SG/Sets subscripts are an Expert-only feature.
    const valueHtml = isPlata
      ? `<div class="rep-card-stat-value">${escapeHtml(String(val))}</div>`
      : repCardCsValue(val, showExtras ? p.extras : null);
    return `<div class="rep-card-stat is-period"><div class="rep-card-stat-label">${escapeHtml(p.label)}</div><div class="rep-card-stat-body">${valueHtml}${repCardMetrics(p.tableau)}</div></div>`;
  }

  // PR (personal-record) tile: value + "1 of N · Top X%" sub (matches the YTD CS
  // Rank tile layout). SG/Sets shown only when extras passed (Expert-only).
  function repCardPrTile(label, value, extras, subText) {
    const valueHtml = extras
      ? repCardCsValue(value, extras)
      : `<div class="rep-card-stat-value">${escapeHtml(String(value == null ? "—" : value))}</div>`;
    const sub = subText ? `<div class="rep-card-stat-sub">${escapeHtml(subText)}</div>` : "";
    return `<div class="rep-card-stat"><div class="rep-card-stat-label">${escapeHtml(label)}</div><div class="rep-card-stat-body">${valueHtml}${sub}</div></div>`;
  }

  function repCardRankTile(label, rank, metricLabel, metricVal) {
    const sub = metricVal != null ? `<div class="rep-card-stat-sub">${escapeHtml(metricLabel)} ${escapeHtml(String(metricVal))}</div>` : "";
    return `<div class="rep-card-stat"><div class="rep-card-stat-label">${escapeHtml(label)}</div><div class="rep-card-stat-body"><div class="rep-card-stat-value">#${escapeHtml(String(rank == null ? "—" : rank))}</div>${sub}</div></div>`;
  }

  // Three stacked goal rings (WTD / MTD / YTD) for the rep card. Each shows
  // current/goal inside and fills counterclockwise. WTD tracks internal CS;
  // MTD/YTD track the rep's Tableau metric (SRA setters / CAP experts).
  function repCardGoalRings(repName) {
    const goal = repGoals[normalizeName(repName)];
    if (!goal) return "";
    const metric = (goal.metric || "SRA").toUpperCase();
    const ml = metric.toLowerCase();
    // Not-onboarded reps (metric CS) have no Tableau data — use internal CS.
    const isCs = ml === "cs";
    const mtdT = getRepTableauStatsForPeriod(repName, "mtd") || {};
    const ytdT = getRepTableauStatsForPeriod(repName, "ytd") || {};
    const rings = [
      { label: "WTD", cur: getRepDiscordCsForRange(repName, "wtd") || 0, goal: goal.weeklyCs, metric: "CS" },
      { label: "MTD", cur: isCs ? getRepDiscordCsForRange(repName, "mtd") : (Number(mtdT[ml]) || 0), goal: goal.monthly, metric: metric },
      { label: "YTD", cur: isCs ? getRepDiscordCsForRange(repName, "ytd") : (Number(ytdT[ml]) || 0), goal: goal.yearly, metric: metric }
    ];
    if (!rings.some(r => r.goal != null && Number(r.goal) > 0)) return "";

    const R = 22, C = 2 * Math.PI * R;
    const oneRing = r => {
      const hasGoal = r.goal != null && Number(r.goal) > 0;
      const pct = hasGoal ? Math.max(0, Math.min(1, r.cur / r.goal)) : 0;
      const done = hasGoal && pct >= 1;
      const dash = `${(C * pct).toFixed(1)} ${C.toFixed(1)}`;
      const denom = hasGoal ? String(r.goal) : "–";
      const numText = `${r.cur}/${denom}`;
      // Grow/shrink the number to fit the circle based on its character count.
      const len = numText.length;
      const numSize = len <= 3 ? 12 : len === 4 ? 10.5 : len === 5 ? 9 : len === 6 ? 8 : 7;
      // Keep the metric subscript clear of the number, shifting it down as the
      // number grows so they never overlap.
      const metricY = (26 + numSize / 2 + 8).toFixed(1);
      // rotate(-90) starts the arc at the top; default sweep is clockwise.
      return `<div class="rc-ring">
          <svg viewBox="0 0 52 52" class="rc-ring-svg">
            <circle cx="26" cy="26" r="${R}" class="rc-ring-bg"></circle>
            <circle cx="26" cy="26" r="${R}" class="rc-ring-fg${done ? " done" : ""}"
              stroke-dasharray="${dash}" transform="rotate(-90 26 26)"></circle>
            <text x="26" y="26" class="rc-ring-num" style="font-size:${numSize}px">${escapeHtml(numText)}</text>
            <text x="26" y="${metricY}" class="rc-ring-metric">${escapeHtml(r.metric)}</text>
          </svg>
          <div class="rc-ring-label">${escapeHtml(r.label)}</div>
        </div>`;
    };
    const [wtd, mtd, ytd] = rings;
    // WTD on the left; MTD stacked over YTD on the right.
    return `<div class="rep-card-rings">${oneRing(wtd)}<div class="rc-ring-col">${oneRing(mtd)}${oneRing(ytd)}</div></div>`;
  }

  function renderRepCard(data) {
    const { profile, periods } = data;
    const isPlata = profile.isPlata;
    // SG/Sets subscripts are an Expert-only feature (Market Leaders count as experts).
    const isExpert = !isPlata && (profile.role === "Expert" || profile.role === "Market Leader");
    const goalRings = repCardGoalRings(profile.name);

    // YTD CS Rank: internal rank + internal CS, then Tableau rank · CS on one line.
    const ytdCsRankHtml = isPlata
      ? repCardRankTile("YTD CS Rank", data.ytdTableauCsRank, "CS", data.ytdTableauCsValue)
      : `<div class="rep-card-stat"><div class="rep-card-stat-label">YTD CS Rank</div>
          <div class="rep-card-stat-body">
          <div class="rc-valrow"><span class="rep-card-stat-value">#${escapeHtml(String(data.ytdDiscordRank == null ? "—" : data.ytdDiscordRank))}</span>${data.ytdDiscordCs != null ? `<span class="rc-iv">${escapeHtml(String(data.ytdDiscordCs))}</span>` : ""}</div>
          <div class="rc-trk">Tab Rk #${escapeHtml(String(data.ytdTableauCsRank == null ? "—" : data.ytdTableauCsRank))}${data.ytdTableauCsValue != null ? ` · CS ${escapeHtml(String(data.ytdTableauCsValue))}` : ""}</div>
          </div>
        </div>`;

    const phoneIcon = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.58 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.3.2 2.5.58 3.6a1 1 0 0 1-.25 1l-2.2 2.2z"/></svg>';
    const igIcon = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="3.6"/><circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none"/></svg>';
    const contact = `<div class="rep-card-contact">${
      profile.phone ? `<a class="rep-card-link" href="tel:${escapeHtml(repCardPhoneTel(profile.phone))}">${phoneIcon} ${escapeHtml(formatRepCardPhone(profile.phone))}</a>` : ""
    }${
      profile.instagram ? `<a class="rep-card-link" href="https://instagram.com/${escapeHtml(profile.instagram)}" target="_blank" rel="noopener">${igIcon} @${escapeHtml(profile.instagram)}</a>` : ""
    }</div>`;

    return `
      <div class="rep-card-profile">
        <div class="rep-card-avatar" aria-hidden="true" style="overflow:hidden">${
          profile.photoUrl
            ? `<img src="${escapeHtml(profile.photoUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block">`
            : escapeHtml(repCardInitials(profile.name))
        }</div>
        <div>
          <div class="rep-card-name" id="rep-card-title">${bagelTagHtmlForName(profile.name)}<span class="rcn-text">${escapeHtml(profile.name)}</span></div>
          <div class="rep-card-role">${escapeHtml(profile.role)}</div>
          ${repCardChips(profile)}
          ${(profile.phone || profile.instagram) ? contact : ""}
        </div>
        ${goalRings}
      </div>
      <div class="rep-card-stat-grid">
        ${repCardPeriodTile(periods.ytd, isPlata, isExpert)}
        ${repCardPeriodTile(periods.mtd, isPlata, isExpert)}
        ${repCardPeriodTile(periods.wtd, isPlata, isExpert)}
        ${repCardPrTile("PR Month CS", isPlata ? "—" : data.bestMonth.cs, isExpert ? data.bestMonth : null, isPlata ? "No Internal Data" : repPrSub(profile.name, "month"))}
        ${repCardPrTile("PR Week CS", isPlata ? "—" : data.bestWeek.cs, isExpert ? data.bestWeek : null, isPlata ? "No Internal Data" : repPrSub(profile.name, "week"))}
        ${ytdCsRankHtml}
        ${repCardRankTile("YTD SRA Rank", data.ytdSraRank, "SRA", data.ytdSraValue)}
        ${repCardRankTile("YTD CAP Rank", data.ytdCapRank, "CAP", data.ytdCapValue)}
        ${repCardRankTile("YTD IC Rank", data.ytdInstallRank, "IC", data.ytdIcValue)}
      </div>
    `;
  }

  function ensureRepCardModal() {
    if (document.getElementById("rep-card-overlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "rep-card-overlay";
    overlay.className = "rep-card-overlay";
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="rep-card-modal" role="dialog" aria-modal="true" aria-labelledby="rep-card-title">
        <button type="button" class="rep-card-close" aria-label="Close">&times;</button>
        <div id="rep-card-content"></div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  function openRepCard(repName) {
    ensureRepCardModal();

    const overlay = document.getElementById("rep-card-overlay");
    const content = document.getElementById("rep-card-content");
    if (!overlay || !content) return;

    const data = buildRepCardData(repName);
    content.innerHTML = renderRepCard(data);
    overlay.hidden = false;
    document.body.classList.add("rep-card-open");
    currentRepCardName = repName;
  }

  function handleRepCardOfficeClick(officeKey) {
    closeRepCard();

    if (officeKey === "plata") {
      includePlata = true;
      includeIceCollective = false;
      includeRiot = false;
      setShowTableau(true);
      rebuildComparisonMapsForOffice();
      renderLeaderboard();
      return;
    }

    if (officeKey === "ice-collective") {
      includeIceCollective = true;
      includeRiot = false;
    } else if (officeKey === "riot") {
      includeRiot = true;
      includeIceCollective = false;
    }

    includePlata = false;
    rebuildComparisonMapsForOffice();
    renderLeaderboard();
  }

  // Snapshot of all view-state toggles/filters that define what the leaderboard
  // is currently showing.
  function captureViewState() {
    return {
      activeView,
      activeDateMode,
      showTableau,
      tableauUserOff,
      showYoy,
      showMom,
      showCoc,
      includeOldReps,
      includeNewReps,
      includeIceCollective,
      includeRiot,
      includePlata,
      activeSortMode,
      activeTableauMetric,
      activeGroupDrillLeader,
      activeInactiveDrill,
      inactiveDrillLeader,
      groupsRepType,
      bagelsOn,
      isSubsetMode,
      activeDownlineNames,
      activePreviousYearDownlineNames,
      activeTitle
    };
  }

  function restoreViewState(state) {
    if (!state) return;
    activeView = state.activeView;
    activeDateMode = state.activeDateMode;
    showTableau = state.showTableau;
    tableauUserOff = !!state.tableauUserOff;
    showYoy = state.showYoy;
    showMom = state.showMom;
    showCoc = !!state.showCoc;
    includeOldReps = state.includeOldReps;
    includeNewReps = state.includeNewReps;
    includeIceCollective = state.includeIceCollective;
    includeRiot = state.includeRiot;
    includePlata = state.includePlata;
    activeSortMode = state.activeSortMode;
    activeTableauMetric = state.activeTableauMetric;
    activeGroupDrillLeader = state.activeGroupDrillLeader;
    activeInactiveDrill = !!state.activeInactiveDrill;
    inactiveDrillLeader = state.inactiveDrillLeader || null;
    groupsRepType = state.groupsRepType || "general";
    bagelsOn = !!state.bagelsOn;
    isSubsetMode = state.isSubsetMode;
    activeDownlineNames = state.activeDownlineNames;
    activePreviousYearDownlineNames = state.activePreviousYearDownlineNames;
    activeTitle = state.activeTitle;

    rebuildComparisonMapsForOffice();
    setActiveViewTab(activeView);
    updateGroupDrillNav();
    renderLeaderboard();
  }

  function handleRepCardGroupClick(groupLeader) {
    // Remember the rep card we came from AND the full view state behind it, so
    // the group's Back button can restore that exact view and reopen the card.
    groupDrillReturn = { rep: currentRepCardName, state: captureViewState() };
    closeRepCard();

    activeView = "groups";
    groupsRepType = "general";
    activeInactiveDrill = false;
    inactiveDrillLeader = null;
    activeGroupDrillLeader = String(groupLeader || "").trim();
    includePlata = false;

    if (showTableau) {
      setShowTableau(false);
    }
    if (activeSortMode === "tableau") {
      activeSortMode = "currentContribution";
    }

    setActiveViewTab("groups");
    updateGroupDrillNav();
    renderLeaderboard();
  }

  function closeRepCard() {
    const overlay = document.getElementById("rep-card-overlay");
    if (!overlay) return;

    overlay.hidden = true;
    document.body.classList.remove("rep-card-open");
  }

  function setupRepCardEvents() {
    if (repCardEventsReady) return;
    repCardEventsReady = true;

    ensureRepCardModal();

    const app = document.getElementById("leaderboard-app");
    if (app) {
      app.addEventListener("click", event => {
        const repButton = event.target.closest(".rep-card-name-button");
        if (!repButton) return;

        const repName = repButton.getAttribute("data-rep-card-name");
        if (repName) openRepCard(repName);
      });
    }

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") closeRepCard();
    });

    document.addEventListener("click", event => {
      const officeButton = event.target.closest("[data-rep-card-office]");
      if (officeButton) {
        handleRepCardOfficeClick(officeButton.getAttribute("data-rep-card-office"));
        return;
      }

      const groupButton = event.target.closest("[data-rep-card-group]");
      if (groupButton) {
        handleRepCardGroupClick(groupButton.getAttribute("data-rep-card-group"));
      }
    });

    const overlay = document.getElementById("rep-card-overlay");
    if (overlay) {
      overlay.addEventListener("click", event => {
        if (event.target === overlay) closeRepCard();
      });

      const closeButton = overlay.querySelector(".rep-card-close");
      if (closeButton) {
        closeButton.addEventListener("click", closeRepCard);
      }
    }
  }

  // Memoized: downline sets are pure functions of (rows array, leader name) and
  // get recomputed dozens of times per render (once per group, plus drills). The
  // WeakMap is keyed by the rows array, so it auto-invalidates when a new dataset
  // replaces recruitingRows/recruiting2025Rows. Returned sets are treated as
  // read-only by all callers (verified), so sharing the cached instance is safe.
  const _downlineCache = new WeakMap();
  function buildDownlineSetFromRows(rows, activeRepName) {
    const recruiterNorm = normalizeName(activeRepName);
    let perRows = _downlineCache.get(rows);
    if (!perRows) { perRows = new Map(); _downlineCache.set(rows, perRows); }
    const cached = perRows.get(recruiterNorm);
    if (cached) return cached;

    const downline = new Set();
    rows.forEach(row => {
      const repName = row.name;
      const path = String(row.treePath || "");
      const pathParts = path.split(">").map(part => normalizeName(part));
      const isSelf = normalizeName(repName) === recruiterNorm;

      if (pathParts.includes(recruiterNorm) && (INCLUDE_RECRUITER_SELF || !isSelf)) {
        downline.add(normalizeName(repName));
      }
    });

    perRows.set(recruiterNorm, downline);
    return downline;
  }
  
  function buildGroupContext() {
    const range = getDateRange(activeDateMode);
    const periodDeals = allDeals.filter(deal => dealInDateRange(deal, range));
    const ytdDeals = allDeals.filter(deal => dealInDateRange(deal, getDateRange("ytd")));
    const momRanges = getMomDateRanges();
    const momCurrentDeals = allDeals.filter(deal => dealInDateRange(deal, momRanges.current));
    const momPreviousDeals = previousYearDeals.filter(deal => dealInDateRange(deal, momRanges.previous));
    const useMom = useMomColumn(); // MoM (mtd) or COC (custom) — both use momRanges
    const useYoy = useYoyColumn();
    const useComparison = useMom || useYoy;
    const currentPeriodDeals = useMom ? momCurrentDeals : periodDeals;
    const previousPeriodDeals = useMom ? momPreviousDeals : previousYearDeals;

    const repContrib2026 = new Map();
    const repContrib2025 = new Map();
    const repContribDeals = useMom ? momCurrentDeals : (showYoy ? ytdDeals : periodDeals);
    repContribDeals.forEach(deal => {
      const setterNorm = normalizeName(deal.setter);
      const expertNorm = normalizeName(deal.expert);
      if (setterNorm && repInOfficeUmbrella(setterNorm)) {
        repContrib2026.set(setterNorm, (repContrib2026.get(setterNorm) || 0) + 1);
      }
      if (expertNorm && repInOfficeUmbrella(expertNorm)) {
        repContrib2026.set(expertNorm, (repContrib2026.get(expertNorm) || 0) + 1);
      }
    });
    previousYearDeals.forEach(deal => {
      const setterNorm = normalizeName(deal.setter);
      const expertNorm = normalizeName(deal.expert);
      if (setterNorm && repInOfficeUmbrella(setterNorm, "previous")) {
        repContrib2025.set(setterNorm, (repContrib2025.get(setterNorm) || 0) + 1);
      }
      if (expertNorm && repInOfficeUmbrella(expertNorm, "previous")) {
        repContrib2025.set(expertNorm, (repContrib2025.get(expertNorm) || 0) + 1);
      }
    });

    function getRepContributions2025(normName) {
      return repContrib2025.get(normName) || 0;
    }

    function filterDownlineForYear(downlineNames, year, applyYoyFilters = useComparison) {
      if (!applyYoyFilters) return downlineNames;
      if (year === "2026" && includeNewReps) return downlineNames;
      if (year === "2025" && oldRepsActive()) return downlineNames;

      const filtered = new Set();
      downlineNames.forEach(norm => {
        const contrib2026 = repContrib2026.get(norm) || 0;
        const contrib2025 = getRepContributions2025(norm);

        if (year === "2026") {
          if (contrib2026 > 0 && contrib2025 === 0) return;
        } else if (contrib2025 > 0 && contrib2026 === 0) {
          return;
        }

        filtered.add(norm);
      });

      return filtered;
    }

    // Per-rep contribution tally for a given (deals array, year), computed ONCE
    // and reused across every group/total/drill in this render. Replaces the old
    // approach of re-scanning the entire deal list for every single group.
    // Scoped to this render via the closure: office toggles are constant within a
    // render, and the deal arrays are freshly filtered each render, so the cache
    // is always consistent with the current filters (no stale-toggle risk).
    const _tallyCache = new WeakMap();
    function getRepTally(deals, year) {
      let byYear = _tallyCache.get(deals);
      if (!byYear) { byYear = {}; _tallyCache.set(deals, byYear); }
      if (byYear[year]) return byYear[year];

      const tally = new Map();
      const ensure = norm => {
        let t = tally.get(norm);
        if (!t) {
          t = { sets: 0, cs: 0, selfGen: 0, setterSets: 0, expertSets: 0, expertSelfGen: 0, expertSetOnly: 0 };
          tally.set(norm, t);
        }
        return t;
      };

      deals.forEach(deal => {
        const setterNorm = normalizeName(deal.setter);
        const expertNorm = normalizeName(deal.expert);
        const isSelf = setterNorm && setterNorm === expertNorm;

        if (setterNorm && repInOfficeUmbrella(setterNorm, year)) {
          const t = ensure(setterNorm);
          t.sets += 1;
          if (repEverClosed(setterNorm)) {
            t.expertSets += 1;
            if (isSelf) t.expertSelfGen += 1; else t.expertSetOnly += 1;
          } else {
            t.setterSets += 1;
          }
          if (isSelf) t.selfGen += 1;
        }
        if (expertNorm && repInOfficeUmbrella(expertNorm, year)) {
          ensure(expertNorm).cs += 1;
        }
      });

      byYear[year] = tally;
      return tally;
    }

    function computeGroupStats(downlineNames, deals, year = "current") {
      const tally = getRepTally(deals, year);
      let sets = 0, cs = 0, selfGen = 0;
      let setterSets = 0, expertSets = 0, expertSelfGen = 0, expertSetOnly = 0;

      downlineNames.forEach(norm => {
        const t = tally.get(norm);
        if (!t) return;
        sets += t.sets; cs += t.cs; selfGen += t.selfGen;
        setterSets += t.setterSets; expertSets += t.expertSets;
        expertSelfGen += t.expertSelfGen; expertSetOnly += t.expertSetOnly;
      });

      return {
        sets, cs, selfGen, total: (sets + cs) / 2,
        setterSets,
        expertSets, expertCs: cs, expertSelfGen, expertSetOnly,
        // experts "total contribution" = blend of their sets + closes
        expertTotal: (expertSets + cs) / 2
      };
    }

    function qualifiesByYtd(ytdCurrent, ytdPrevious) {
      if (useComparison) return ytdCurrent.total >= 25 || ytdPrevious.total >= 25;
      return ytdCurrent.total >= 25;
    }

    function buildGroupRow(name, current, previous, downline) {
      return { ...makeGroupStatRow(current, previous), name, downline: downline || null };
    }

    return {
      range,
      ytdDeals,
      useMom,
      useYoy,
      useComparison,
      currentPeriodDeals,
      previousPeriodDeals,
      filterDownlineForYear,
      computeGroupStats,
      qualifiesByYtd,
      buildGroupRow
    };
  }

  function getGroupLeaderStats(leaderName, context) {
    const downlineNames = buildDownlineSetFromRows(recruitingRows, leaderName);
    const previousDownlineNames = buildDownlineSetFromRows(recruiting2025Rows, leaderName);
    const current = context.computeGroupStats(
      context.filterDownlineForYear(downlineNames, "2026", context.useComparison),
      context.currentPeriodDeals,
      "current"
    );
    const previous = context.computeGroupStats(
      context.filterDownlineForYear(previousDownlineNames, "2025", context.useComparison),
      context.previousPeriodDeals,
      "previous"
    );

    return { current, previous, downlineNames, previousDownlineNames };
  }

  function getGroupDrillVisibleNames(leaderName, context) {
    const currentDownline = buildDownlineSetFromRows(recruitingRows, leaderName);
    const previousDownline = buildDownlineSetFromRows(recruiting2025Rows, leaderName);

    if (!context.useComparison) return currentDownline;

    const visible = new Set();
    context.filterDownlineForYear(currentDownline, "2026", true).forEach(norm => visible.add(norm));
    context.filterDownlineForYear(previousDownline, "2025", true).forEach(norm => visible.add(norm));
    return visible;
  }

  function getGroupRows() {
    const context = buildGroupContext();
    const {
      range,
      ytdDeals,
      useComparison,
      currentPeriodDeals,
      previousPeriodDeals,
      filterDownlineForYear,
      computeGroupStats,
      qualifiesByYtd,
      buildGroupRow
    } = context;
    const showYoy = context.useYoy;
    const showMom = context.useMom;

    const groupRows = [];

    recruitingRows.forEach(leader => {
      const leaderName = String(leader.name || "").trim();
      const leaderNorm = normalizeName(leaderName);

      if (!leaderName || HIDDEN_REPS.has(leaderNorm) || EXCLUDED_GROUP_LEADERS.has(leaderNorm)) return;
      if (!repInOfficeUmbrella(leaderNorm)) return;

      const downlineNames = buildDownlineSetFromRows(recruitingRows, leaderName);
      if (!downlineNames.size) return;

      const previousDownlineNames = buildDownlineSetFromRows(recruiting2025Rows, leaderName);
      const ytdCurrent = computeGroupStats(filterDownlineForYear(downlineNames, "2026", showYoy || showMom), ytdDeals, "current");
      const ytdPrevious = computeGroupStats(filterDownlineForYear(previousDownlineNames, "2025", showYoy || showMom), previousYearDeals, "previous");
      const current = computeGroupStats(filterDownlineForYear(downlineNames, "2026", useComparison), currentPeriodDeals, "current");
      const previous = computeGroupStats(filterDownlineForYear(previousDownlineNames, "2025", useComparison), previousPeriodDeals, "previous");

      if (qualifiesByYtd(ytdCurrent, ytdPrevious)) {
        groupRows.push(buildGroupRow(leaderName, current, previous, downlineNames));
      }
    });

    function addOfficeGroup(label, recruiterSlug, invert) {
      function buildOfficeNames(recruitingSource) {
        const recruiterRow = recruitingSource.find(row =>
          makeSlug(row.slug || row.name) === recruiterSlug ||
          makeSlug(row.name) === recruiterSlug
        );

        if (!recruiterRow) return null;

        const baseDownline = buildDownlineSetFromRows(recruitingSource, recruiterRow.name);
        const groupNames = new Set();

        recruitingSource.forEach(row => {
          const norm = normalizeName(row.name);
          const inBase = baseDownline.has(norm);

          if ((!invert && inBase) || (invert && !inBase)) {
            groupNames.add(norm);
          }
        });

        return groupNames;
      }

      const currentNames = buildOfficeNames(recruitingRows);
      if (!currentNames) return;

      const previousNames = buildOfficeNames(recruiting2025Rows) || new Set();
      const ytdCurrent = computeGroupStats(filterDownlineForYear(currentNames, "2026", showYoy || showMom), ytdDeals, "current");
      const ytdPrevious = computeGroupStats(filterDownlineForYear(previousNames, "2025", showYoy || showMom), previousYearDeals, "previous");
      const current = computeGroupStats(filterDownlineForYear(currentNames, "2026", useComparison), currentPeriodDeals, "current");
      const previous = computeGroupStats(filterDownlineForYear(previousNames, "2025", useComparison), previousPeriodDeals, "previous");

      if (qualifiesByYtd(ytdCurrent, ytdPrevious)) {
        groupRows.push(buildGroupRow(label, current, previous, currentNames));
      }
    }

    if (includeIceCollective) {
      addOfficeGroup("Ice Collective", "justin-wall", false);
    }
    if (includeRiot) {
      addOfficeGroup("Riot", "justin-wall", true);
    }

    const allCurrentNames = new Set(
      recruitingRows
        .map(row => normalizeName(row.name))
        .filter(norm => norm && !HIDDEN_REPS.has(norm))
    );
    const allPreviousNames = new Set(
      recruiting2025Rows
        .map(row => normalizeName(row.name))
        .filter(norm => norm && !HIDDEN_REPS.has(norm))
    );

    const totalStats = {
      current: computeGroupStats(filterDownlineForYear(allCurrentNames, "2026", useComparison), currentPeriodDeals, "current"),
      previous: computeGroupStats(filterDownlineForYear(allPreviousNames, "2025", useComparison), previousPeriodDeals, "previous")
    };

    return { groupRows, totalStats, range };
  }

  function shouldShowCurrentTotalNotes() {
    if (!includeIceCollective || !includeRiot) return true;
    if (isComparisonMode() && !includeNewReps) return true;
    return false;
  }

  function shouldShowPreviousTotalNotes() {
    if (isComparisonMode() && (!includeIceCollective || !includeRiot)) return true;
    if (isComparisonMode() && !oldRepsActive()) return true;
    return false;
  }

  function buildGeneralTotalNotesFromTotals(totals) {
    if (!totals) return null;

    const notes = [];
    if (totals.cs > 0) notes.push(`<span class="cs-note-left">CS: ${totals.cs}</span>`);
    if (totals.sets > 0) notes.push(`<span class="cs-note-left">Sets: ${totals.sets}</span>`);
    return notes.length ? notes : null;
  }

  function buildCurrentTotalNotesForView(rows, totals = null) {
    if (!shouldShowCurrentTotalNotes()) return null;
    if (activeView === "setters") return null;

    if (activeView === "general") {
      return buildGeneralTotalNotesFromTotals(totals);
    }

    if (activeView === "experts") {
      const selfGen = rows.reduce((sum, row) => sum + (row.selfGen || 0), 0);
      const setOnly = rows.reduce((sum, row) => sum + (row.setOnly || 0), 0);
      const notes = buildExpertTotalNotes(selfGen, setOnly);
      return notes.length ? notes : null;
    }

    return null;
  }

  function buildPreviousTotalNotesForView(rows, totals = null) {
    if (!shouldShowPreviousTotalNotes()) return null;
    if (activeView === "setters") return null;

    if (activeView === "general") {
      return buildGeneralTotalNotesFromTotals(totals);
    }

    if (activeView === "experts") {
      const selfGen = rows.reduce((sum, row) => sum + getRowPreviousSelfGen(row), 0);
      const setOnly = rows.reduce((sum, row) => sum + getRowPreviousSetOnly(row), 0);
      const notes = buildExpertTotalNotes(selfGen, setOnly);
      return notes.length ? notes : null;
    }

    return null;
  }

  function buildSetsCsNotesStack(sets, cs) {
    return `
        <div class="cs-notes-stack">
          <span class="cs-note-left">CS: ${cs}</span>
          <span class="cs-note-left">Sets: ${sets}</span>
        </div>`;
  }

  // The displayed group number for the active rep-type lens. General = the
  // (Sets+CS)/2 blend; Setters = total sets; Experts = total closes (CS);
  // SelfGen = total self-gen deals.
  function groupRowValue(row) {
    if (groupsRepType === "setters") return row.setterSets || 0;
    if (groupsRepType === "experts") return row.expertTotal || 0;   // blended contribution
    if (groupsRepType === "selfgen") return row.selfGen || 0;
    return row.total;
  }
  function groupRowPrevValue(row) {
    if (groupsRepType === "setters") return row.previousSetterSets || 0;
    if (groupsRepType === "experts") return row.previousExpertTotal || 0;
    if (groupsRepType === "selfgen") return row.previousSelfGen || 0;
    return row.previousTotal;
  }
  // Build a full group-stat row (with selfGen + previous fields) from a
  // current/previous computeGroupStats pair — so total rows can use the same
  // lens-aware cells as the per-group rows.
  function makeGroupStatRow(current, previous) {
    current = current || {};
    previous = previous || {};
    return {
      sets: current.sets || 0, cs: current.cs || 0, selfGen: current.selfGen || 0, total: current.total || 0,
      setterSets: current.setterSets || 0,
      expertSets: current.expertSets || 0, expertCs: current.expertCs || 0,
      expertSelfGen: current.expertSelfGen || 0, expertSetOnly: current.expertSetOnly || 0,
      expertTotal: current.expertTotal || 0,
      previousSets: previous.sets || 0, previousCs: previous.cs || 0,
      previousSelfGen: previous.selfGen || 0, previousTotal: previous.total || 0,
      previousSetterSets: previous.setterSets || 0,
      previousExpertSets: previous.expertSets || 0, previousExpertCs: previous.expertCs || 0,
      previousExpertSelfGen: previous.expertSelfGen || 0, previousExpertSetOnly: previous.expertSetOnly || 0,
      previousExpertTotal: previous.expertTotal || 0
    };
  }
  // Column label for the active lens.
  function groupMetricLabel() {
    if (groupsRepType === "setters") return "Sets";
    if (groupsRepType === "experts") return "CS";
    if (groupsRepType === "selfgen") return "SG";
    return "CS";
  }

  function getGroupYoyPercent(row) {
    const prev = groupRowPrevValue(row);
    const cur = groupRowValue(row);
    if (!prev || !cur) return null;
    return ((cur - prev) / prev) * 100;
  }

  // Left-hand subscript stack on a group total cell, per lens:
  //   General -> CS / Sets ;  Experts -> SG / Sets (of the experts) ;
  //   Setters / SelfGen -> none (the single metric is self-explanatory).
  function groupTotalNotesStack(row, previous) {
    if (groupsRepType === "general") {
      return previous
        ? buildSetsCsNotesStack(row.previousSets, row.previousCs)
        : buildSetsCsNotesStack(row.sets, row.cs);
    }
    if (groupsRepType === "experts") {
      const sg = previous ? row.previousExpertSelfGen : row.expertSelfGen;
      const setOnly = previous ? row.previousExpertSetOnly : row.expertSetOnly;
      return `<div class="cs-notes-stack"><span class="cs-note-left">SG: ${sg || 0}</span><span class="cs-note-left">Sets: ${setOnly || 0}</span></div>`;
    }
    return `<div class="cs-notes-stack"></div>`;
  }

  function buildGroupTotalCell(row, showComparison, showNotes = true) {
    const yoy = showComparison ? getGroupYoyPercent(row) : null;

    // The Experts lens always shows its SG/Sets breakdown on the total (the lens
    // is specifically about experts' full contribution), regardless of the
    // office-based note-visibility rule that governs the General blend.
    const showLeft = showNotes || groupsRepType === "experts";
    const leftBase = showLeft
      ? groupTotalNotesStack(row, false)
      : `<div class="cs-notes-stack"></div>`;
    const leftHtml = injectPctIntoStack(leftBase, yoy);

    return `
      <div class="cs-cell">
        ${leftHtml}
        <span class="cs-main">${groupRowValue(row)}</span>
      </div>
    `;
  }

  function buildGroupPreviousTotalCell(row, showNotes = true) {
    const showLeft = showNotes || groupsRepType === "experts";
    const leftHtml = showLeft
      ? groupTotalNotesStack(row, true)
      : `<div class="cs-notes-stack"></div>`;

    return `
      <div class="cs-cell">
        ${leftHtml}
        <span class="cs-main">${groupRowPrevValue(row)}</span>
      </div>
    `;
  }

  function getUrlMode() {
    // ?rep= / ?office= sub-leaderboard deep links are disabled — office/group
    // filtering is now built into the site UI, so these always resolve to the
    // full leaderboard (no subset mode).
    return { isSubset: false, lookupSlug: "", title: "" };

    // eslint-disable-next-line no-unreachable
    const params = new URLSearchParams(window.location.search);
    const officeSlug = makeSlug(params.get("office") || "");
    const repSlug = makeSlug(params.get("rep") || "");

    if (officeSlug && officeMap[officeSlug]) {
      return {
        isSubset: true,
        lookupSlug: officeMap[officeSlug].recruiterSlug,
        title: officeMap[officeSlug].title
      };
    }

    if (repSlug) {
      return {
        isSubset: true,
        lookupSlug: repSlug,
        title: null
      };
    }
  
    return { isSubset: false, lookupSlug: "", title: "" };
  }
  
  
  
  // ---- Passwordless rep login (phone -> texted code -> weekly session token) ----
  const AUTH_KEY = "pl_session_token";
  function getSessionToken() { try { return localStorage.getItem(AUTH_KEY) || ""; } catch (e) { return ""; } }
  function setSessionToken(t) { try { localStorage.setItem(AUTH_KEY, t); } catch (e) {} }

  async function loginRequestCode(phone) {
    const res = await fetch(API_URL + "?action=requestCode&phone=" + encodeURIComponent(phone));
    return res.json();
  }
  async function loginVerifyCode(phone, code) {
    const res = await fetch(API_URL + "?action=verifyCode&phone=" + encodeURIComponent(phone) + "&code=" + encodeURIComponent(code));
    return res.json();
  }

  function ensureLoginOverlay() {
    if (document.getElementById("pl-login-overlay")) return;
    const o = document.createElement("div");
    o.id = "pl-login-overlay";
    o.className = "pl-modal";
    o.innerHTML =
      '<div class="pl-login-card">' +
        '<div class="pl-login-logo">PROVEN<span>LEADERBOARD</span></div>' +
        '<div class="pl-login-title">Rep sign in</div>' +
        '<div class="pl-login-sub" id="pl-login-sub">Enter your phone number and we’ll text you a code.</div>' +
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

    const phoneEl = o.querySelector("#pl-login-phone");
    const codeEl = o.querySelector("#pl-login-code");
    const msgEl = o.querySelector("#pl-login-msg");
    const step1 = o.querySelector("#pl-login-step1");
    const step2 = o.querySelector("#pl-login-step2");
    const sendBtn = o.querySelector("#pl-login-send");
    const verifyBtn = o.querySelector("#pl-login-verify");
    const setMsg = (t, err) => { msgEl.textContent = t || ""; msgEl.className = "pl-login-msg" + (err ? " pl-login-err" : ""); };

    sendBtn.addEventListener("click", async () => {
      const phone = (phoneEl.value || "").trim();
      if (phone.replace(/\D/g, "").length < 10) { setMsg("Enter a valid 10-digit phone number.", true); return; }
      sendBtn.disabled = true; setMsg("Sending…");
      try {
        const r = await loginRequestCode(phone);
        if (r && r.ok) { step1.style.display = "none"; step2.style.display = "block"; setMsg("Code sent. Check your texts."); codeEl.focus(); }
        else { setMsg((r && r.error) || "Couldn't send a code.", true); }
      } catch (e) { setMsg("Network error. Try again.", true); }
      sendBtn.disabled = false;
    });

    verifyBtn.addEventListener("click", async () => {
      const phone = (phoneEl.value || "").trim();
      const code = (codeEl.value || "").trim();
      if (!code) { setMsg("Enter the code we texted you.", true); return; }
      verifyBtn.disabled = true; setMsg("Verifying…");
      try {
        const r = await loginVerifyCode(phone, code);
        if (r && r.ok && r.token) { setSessionToken(r.token); setMsg("Signed in."); bootLeaderboard(); }
        else { setMsg((r && r.error) || "That code wasn't right.", true); verifyBtn.disabled = false; }
      } catch (e) { setMsg("Network error. Try again.", true); verifyBtn.disabled = false; }
    });

    o.querySelector("#pl-login-back").addEventListener("click", () => {
      step2.style.display = "none"; step1.style.display = "block"; setMsg(""); phoneEl.focus();
    });
    codeEl.addEventListener("keydown", e => { if (e.key === "Enter") verifyBtn.click(); });
    phoneEl.addEventListener("keydown", e => { if (e.key === "Enter") sendBtn.click(); });
  }
  function showLoginOverlay() {
    ensureLoginOverlay();
    const o = document.getElementById("pl-login-overlay");
    if (o) { o.style.display = "flex"; const p = o.querySelector("#pl-login-phone"); if (p) p.focus(); }
  }
  function hideLoginOverlay() {
    const o = document.getElementById("pl-login-overlay");
    if (o) o.style.display = "none";
    scrollPageToTop();
  }

  // Reset the page to the very top after a modal closes. Focusing the phone/code/
  // goal inputs makes iOS scroll the page down; blur + scroll-to-0 (plus a follow-up
  // once the keyboard finishes animating away) puts it fully back at the top.
  function scrollPageToTop() {
    try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (e) {}
    window.scrollTo(0, 0);
    setTimeout(function () { window.scrollTo(0, 0); }, 350);
  }

  // ---- Goal prompt on login -------------------------------------------------
  // After a successful login, if the rep still owes a weekly / monthly / yearly
  // goal, make them set it before they can use the board. Exempt reps (Justin
  // Wall, Kelton Higgins) and reps with everything submitted skip straight in.
  async function fetchGoalStatus() {
    const res = await fetch(API_URL + "?action=goalStatus&token=" + encodeURIComponent(getSessionToken()));
    return res.json();
  }
  async function submitGoalsForLogin(vals) {
    const q = Object.keys(vals).map(k => k + "=" + encodeURIComponent(vals[k])).join("&");
    const res = await fetch(API_URL + "?action=submitGoals&token=" + encodeURIComponent(getSessionToken()) + "&" + q);
    return res.json();
  }
  function firstName(n) { return String(n || "").trim().split(/\s+/)[0] || "there"; }

  function showGoalPrompt(s) {
    let o = document.getElementById("pv-goal-overlay");
    if (!o) { o = document.createElement("div"); o.id = "pv-goal-overlay"; o.className = "pl-modal"; document.body.appendChild(o); }
    const fields = [];
    if (s.needWeek) fields.push(
      `<div class="pv-goal-field"><label>This week &mdash; ${s.weekMetric === "SRA" ? "SRA" : "Contracts Signed"} <span class="pv-goal-hint">(${s.weekLabel})</span></label>` +
      `<input id="pv-goal-week" type="number" inputmode="numeric" min="0" placeholder="e.g. 4"></div>`);
    if (s.needMonth) fields.push(
      `<div class="pv-goal-field"><label>${s.monthLabel} &mdash; ${s.metric} goal</label>` +
      `<input id="pv-goal-month" type="number" inputmode="numeric" min="0" placeholder="e.g. 15"></div>`);
    if (s.needYear) fields.push(
      `<div class="pv-goal-field"><label>${s.yearLabel} &mdash; ${s.metric} goal</label>` +
      `<input id="pv-goal-year" type="number" inputmode="numeric" min="0" placeholder="e.g. 120"></div>`);

    o.innerHTML =
      '<div class="pl-login-card">' +
        '<div class="pl-login-logo">PROVEN<span>LEADERBOARD</span></div>' +
        `<div class="pl-login-title">Hey ${firstName(s.name)} &mdash; set your goals</div>` +
        '<div class="pl-login-sub">Lock these in to get to the board.</div>' +
        fields.join("") +
        '<button id="pv-goal-submit" type="button" class="pl-login-btn">Save my goals</button>' +
        '<div id="pv-goal-msg" class="pl-login-msg"></div>' +
      '</div>';

    const msg = o.querySelector("#pv-goal-msg");
    const setMsg = (t, err) => { msg.textContent = t || ""; msg.className = "pl-login-msg" + (err ? " pl-login-err" : ""); };
    const weekEl = o.querySelector("#pv-goal-week");
    const monthEl = o.querySelector("#pv-goal-month");
    const yearEl = o.querySelector("#pv-goal-year");

    o.querySelector("#pv-goal-submit").addEventListener("click", async () => {
      // Every shown field is required (the prompt isn't skippable).
      const need = [];
      if (s.needWeek && !(weekEl.value || "").trim()) need.push("this week's");
      if (s.needMonth && !(monthEl.value || "").trim()) need.push("this month's");
      if (s.needYear && !(yearEl.value || "").trim()) need.push("this year's");
      if (need.length) { setMsg("Please enter " + need.join(", ") + " goal.", true); return; }

      const btn = o.querySelector("#pv-goal-submit");
      btn.disabled = true; setMsg("Saving…");
      const vals = {};
      if (s.needWeek) vals.weeklyCs = (weekEl.value || "").trim();
      if (s.needMonth) vals.monthly = (monthEl.value || "").trim();
      if (s.needYear) vals.yearly = (yearEl.value || "").trim();
      try {
        const r = await submitGoalsForLogin(vals);
        if (r && r.ok) {
          // Reflect the rep's just-set goals in THEIR view immediately — the shared
          // cache updates for everyone else within the normal ~1-min cycle.
          const norm = normalizeName(s.name);
          if (norm) {
            const g = repGoals[norm] || { name: s.name };
            g.role = s.role; g.metric = s.metric;
            if (s.needWeek) g.weeklyCs = Number(vals.weeklyCs);
            if (s.needMonth) g.monthly = Number(vals.monthly);
            if (s.needYear) g.yearly = Number(vals.yearly);
            repGoals[norm] = g;
          }
          o.style.display = "none";
          scrollPageToTop();
          if (isLeaderboardReady) renderLeaderboard(); // else boot will render once loaded
        }
        else { setMsg((r && r.error) || "Couldn't save. Try again.", true); btn.disabled = false; }
      } catch (e) { setMsg("Network error. Try again.", true); btn.disabled = false; }
    });

    o.style.display = "flex";
  }

  // Decide whether to show the goal prompt after the board loads.
  // TEMPORARY (tutorial video): add ?goaldemo=1 to the page URL to force the weekly
  // goal popup to appear even for exempt / already-submitted reps. Remove later.
  function goalDemoForced() {
    try { return /[?&]goaldemo=1\b/.test(window.location.search || ""); } catch (e) { return false; }
  }

  async function maybePromptGoals(statusPromise) {
    try {
      const s = await (statusPromise || fetchGoalStatus());
      if (!s || s.authRequired) return;                      // not logged in
      if (goalDemoForced()) {                                // demo override: week only
        s.exempt = false; s.needWeek = true; s.needMonth = false; s.needYear = false;
      }
      if (s.exempt) return;                                  // exempt (Justin / Kelton)
      if (!s.needWeek && !s.needMonth && !s.needYear) return; // all set
      showGoalPrompt(s);
    } catch (e) { /* never block the board on a goal-check failure */ }
  }

  // Session heartbeat: if this device's session gets kicked (logged in on too
  // many devices, or blocked), drop to the login screen within ~60s instead of
  // sitting on stale data until a manual reload.
  let sessionHeartbeat = null;
  function startSessionHeartbeat() {
    if (sessionHeartbeat) return;
    sessionHeartbeat = setInterval(async () => {
      const t = getSessionToken();
      if (!t) return;
      try {
        const res = await fetch(API_URL + "?action=ping&token=" + encodeURIComponent(t));
        const j = await res.json();
        if (j && j.authRequired) {
          clearInterval(sessionHeartbeat); sessionHeartbeat = null;
          try { localStorage.removeItem(AUTH_KEY); } catch (e) {}
          showLoginOverlay();
        }
      } catch (e) { /* transient network error — try again next tick */ }
    }, 60000);
  }

  async function loadApiData() {
    const res = await fetch(API_URL + "?token=" + encodeURIComponent(getSessionToken()));
    const payload = await res.json();
    if (payload && payload.authRequired) {
      const err = new Error("AUTH_REQUIRED");
      err.authRequired = true;
      throw err;
    }

    apiMeta = {
      lastUpdated: payload.lastUpdated,
      recordCount: payload.recordCount
    };
  
    allDeals = Array.isArray(payload.deals) ? payload.deals : [];
    previousYearDeals = payload.previousYear && Array.isArray(payload.previousYear.deals) ? payload.previousYear.deals : [];

    tableauData = payload.tableau || {};
    tableauOffices = payload.tableauOffices && typeof payload.tableauOffices === "object" ? payload.tableauOffices : {};
    recruitingRows =
    payload.recruiting && Array.isArray(payload.recruiting.rows) ? payload.recruiting.rows : [];

  recruiting2025Rows = payload.recruiting2025 && Array.isArray(payload.recruiting2025.rows) ? payload.recruiting2025.rows : [];

    repProfiles = payload.repProfiles && typeof payload.repProfiles === "object" ? payload.repProfiles : {};
    repGoals = payload.repGoals && typeof payload.repGoals === "object" ? payload.repGoals : {};
    tableauExperts = new Set(
      (Array.isArray(payload.tableauExperts) ? payload.tableauExperts : [])
        .map(n => normalizeName(n)).filter(Boolean)
    );
    // Approved Second Systems: count 1 against the reporter AND the named
    // setter/expert (each inflated Tableau install gets deducted from both).
    secondSystemsByName = new Map();
    (Array.isArray(payload.secondSystems) ? payload.secondSystems : []).forEach(ss => {
      [ss && ss.reporter, ss && ss.otherParty].forEach(nm => {
        const norm = normalizeName(nm);
        if (norm) secondSystemsByName.set(norm, (secondSystemsByName.get(norm) || 0) + 1);
      });
    });
    prStatsCache = null;
    inactiveSetCache = null;
    everClosedCache = null;
    bagelDataCache = null;

    rebuildOfficeNameSets();
    rebuildPreviousYearMap();
    rebuildPreviousMonthMap();
    rebuildTableauMap();

    setupCustomDateBounds();
  }
  
  function rebuildTableauMap() {
    tableauMap = new Map();
  
    const key = getTableauKeyForDateMode();
    if (!key) return;
  
    const dataset = tableauData[key];
  
    if (!dataset || !Array.isArray(dataset.rows)) return;
  
    dataset.rows.forEach(row => {
      tableauMap.set(normalizeName(row.name), row);
    });
  }
  
  function rebuildPreviousYearMap() {
    previousYearDetailsMap = new Map();

    function ensureStats(name) {
      const norm = normalizeName(name);
      if (!norm || HIDDEN_REPS.has(norm)) return null;

      if (!previousYearDetailsMap.has(norm)) {
        previousYearDetailsMap.set(norm, {
          dealIds: new Set(),
          setterDealIds: new Set(),
          expertDealIds: new Set(),
          sets: 0,
          closes: 0,
          setOnly: 0,
          selfGen: 0
        });
      }

      return previousYearDetailsMap.get(norm);
    }

    previousYearDeals.forEach(deal => {
      const dealId = getDealId(deal);
      if (!dealId) return;

      const setterNorm = normalizeName(deal.setter);
      const expertNorm = normalizeName(deal.expert);
      const isSelfGen = setterNorm && expertNorm && setterNorm === expertNorm;

      if (setterNorm && repInOfficeUmbrella(setterNorm, "previous")) {
        const setterStats = ensureStats(deal.setter);
        if (setterStats) {
          setterStats.dealIds.add(dealId);
          setterStats.setterDealIds.add(dealId);
          setterStats.sets += 1;
          if (isSelfGen) {
            setterStats.selfGen += 1;
          } else {
            setterStats.setOnly += 1;
          }
        }
      }

      if (expertNorm && repInOfficeUmbrella(expertNorm, "previous")) {
        const expertStats = ensureStats(deal.expert);
        if (expertStats) {
          expertStats.dealIds.add(dealId);
          expertStats.expertDealIds.add(dealId);
          expertStats.closes += 1;
        }
      }
    });
  }

  function rebuildPreviousMonthMap() {
    previousMonthDetailsMap = new Map();

    function ensureStats(name) {
      const norm = normalizeName(name);
      if (!norm || HIDDEN_REPS.has(norm)) return null;

      if (!previousMonthDetailsMap.has(norm)) {
        previousMonthDetailsMap.set(norm, {
          dealIds: new Set(),
          setterDealIds: new Set(),
          expertDealIds: new Set(),
          sets: 0,
          closes: 0,
          setOnly: 0,
          selfGen: 0
        });
      }

      return previousMonthDetailsMap.get(norm);
    }

    getMomPreviousDeals().forEach(deal => {
      const dealId = getDealId(deal);
      if (!dealId) return;

      const setterNorm = normalizeName(deal.setter);
      const expertNorm = normalizeName(deal.expert);
      const isSelfGen = setterNorm && expertNorm && setterNorm === expertNorm;

      if (setterNorm && repInOfficeUmbrella(setterNorm, "previous")) {
        const setterStats = ensureStats(deal.setter);
        if (setterStats) {
          setterStats.dealIds.add(dealId);
          setterStats.setterDealIds.add(dealId);
          setterStats.sets += 1;
          if (isSelfGen) {
            setterStats.selfGen += 1;
          } else {
            setterStats.setOnly += 1;
          }
        }
      }

      if (expertNorm && repInOfficeUmbrella(expertNorm, "previous")) {
        const expertStats = ensureStats(deal.expert);
        if (expertStats) {
          expertStats.dealIds.add(dealId);
          expertStats.expertDealIds.add(dealId);
          expertStats.closes += 1;
        }
      }
    });
  }
  
  function setupCustomDateBounds() {
    const dates = allDeals.map(d => d.date).filter(Boolean).sort();
    if (!dates.length) return;
  
    const minDate = dates[0];
    const maxDate = dates[dates.length - 1];
  
    const start = document.getElementById("custom-start");
    const end = document.getElementById("custom-end");
  
    start.min = minDate;
    start.max = maxDate;
    end.min = minDate;
    end.max = maxDate;
  
    start.value = minDate;
    end.value = maxDate;
  }
  
  function createButtons() {
    const viewTabs = document.getElementById("view-tabs");
    const dateTabs = document.getElementById("date-tabs");
    const tableauTabs = document.getElementById("tableau-tabs");

    let officeTabs = document.getElementById("office-tabs");
    if (!officeTabs) {
      officeTabs = document.createElement("div");
      officeTabs.id = "office-tabs";
      officeTabs.className = "leaderboard-tabs";
      viewTabs.parentNode.insertBefore(officeTabs, viewTabs);
    }

    viewTabs.innerHTML = "";
    dateTabs.innerHTML = "";
    tableauTabs.innerHTML = "";
    officeTabs.innerHTML = "";

    const officeToggleButtons = document.createElement("div");
    officeToggleButtons.id = "office-toggle-buttons";
    officeToggleButtons.className = "office-toggle-buttons";

    [
      { id: "ice-collective-toggle", label: "Ice Collective", get: () => includeIceCollective, set: val => { includeIceCollective = val; } },
      { id: "riot-toggle", label: "Riot", get: () => includeRiot, set: val => { includeRiot = val; } },
      { id: "plata-toggle", label: "Plata", get: () => includePlata, set: val => { includePlata = val; } }
    ].forEach(office => {
      const btn = document.createElement("button");
      btn.id = office.id;
      btn.textContent = office.label;
      btn.classList.toggle("active", office.get());

      btn.addEventListener("click", () => {
        if (office.id === "plata-toggle" && !canUsePlataToggle()) return;

        const turningOn = !office.get();
        if (!wouldHaveActiveOfficeAfterToggle(office.id, turningOn)) return;

        office.set(turningOn);
        btn.classList.toggle("active", office.get());

        if (office.id === "plata-toggle" && turningOn) {
          setShowTableau(true);
          if (activeSortMode !== "bagels") activeSortMode = "tableau";
        }

        if (office.id !== "plata-toggle") {
          rebuildComparisonMapsForOffice();
        }

        renderLeaderboard();
      });

      officeToggleButtons.appendChild(btn);
    });

    const groupDrillNav = document.createElement("div");
    groupDrillNav.id = "group-drill-nav";
    groupDrillNav.className = "group-drill-nav";

    const groupDrillBack = document.createElement("button");
    groupDrillBack.id = "group-drill-back";
    groupDrillBack.type = "button";
    groupDrillBack.className = "group-drill-back";
    groupDrillBack.textContent = "← Back";
    groupDrillBack.addEventListener("click", () => {
      // A group-scoped inactive drill goes back to that exact group's drill-down.
      if (activeInactiveDrill && inactiveDrillLeader) {
        activeGroupDrillLeader = inactiveDrillLeader;
        activeInactiveDrill = false;
        inactiveDrillLeader = null;
        updateGroupDrillNav();
        renderLeaderboard();
        return;
      }
      // If we drilled in from a rep card, Back restores the exact view that was
      // behind the card and reopens the card on top of it. Otherwise it just
      // returns to the top-level Groups list.
      if (groupDrillReturn) {
        const returnRep = groupDrillReturn.rep;
        restoreViewState(groupDrillReturn.state);
        groupDrillReturn = null;
        if (returnRep) openRepCard(returnRep);
        return;
      }
      activeGroupDrillLeader = null;
      activeInactiveDrill = false;
      inactiveDrillLeader = null;
      updateGroupDrillNav();
      renderLeaderboard();
    });

    const groupDrillTitle = document.createElement("div");
    groupDrillTitle.id = "group-drill-title";
    groupDrillTitle.className = "group-drill-title";

    groupDrillNav.appendChild(groupDrillBack);
    groupDrillNav.appendChild(groupDrillTitle);
    groupDrillNav.style.display = "none";
    officeTabs.style.display = "none";
    officeTabs.appendChild(officeToggleButtons);
    officeTabs.appendChild(groupDrillNav);
  
    [
      { key: "general", label: "General" },
      { key: "groups", label: "Groups" },
      { key: "setters", label: "Setters" },
      { key: "experts", label: "Experts" },
      { key: "selfgen", label: "SelfGen" }
    ].forEach(view => {
      const btn = document.createElement("button");
      btn.textContent = view.label;
      btn.classList.toggle("active", activeView === view.key);
  
      btn.addEventListener("click", () => {
        // While in the Groups view, the General/Setters/Experts/SelfGen tabs act
        // as rep-type LENSES on the group stats instead of switching to a
        // standalone view. Groups stays selected; the lens gets a half-highlight.
        if (activeView === "groups") {
          if (view.key === "setters" || view.key === "experts" || view.key === "selfgen") {
            groupsRepType = view.key;            // apply lens, stay in groups (+ any drill)
            setActiveViewTab("groups");
            renderLeaderboard();
            return;
          }
          if (view.key === "groups") {
            // Reset to the default (General) lens and the top-level groups list.
            groupsRepType = "general";
            activeGroupDrillLeader = null;
            activeInactiveDrill = false;
            inactiveDrillLeader = null;
            groupDrillReturn = null;
            if (activeSortMode !== "bagels") activeSortMode = "currentContribution";
            setShowTableau(false);
            updateGroupDrillNav();
            setActiveViewTab("groups");
            renderLeaderboard();
            return;
          }
          if (view.key === "general" && groupsRepType !== "general") {
            // First General click only drops the lens back to General (stays in
            // Groups). A second General click then leaves to the General view.
            groupsRepType = "general";
            setActiveViewTab("groups");
            renderLeaderboard();
            return;
          }
        }

        // Normal view switch (including leaving Groups -> General).
        if (activeView !== view.key) {
          activeGroupDrillLeader = null;
          activeInactiveDrill = false;
          inactiveDrillLeader = null;
          groupDrillReturn = null;
        }
        groupsRepType = "general";
        activeView = view.key;

        // Keep the bagel sort sticky across view switches (only an explicit sort
        // click or turning bagels off changes it).
        if (activeSortMode !== "bagels") {
          if (activeView === "selfgen") {
            activeSortMode = "selfGen";
          }
          if (activeView === "groups") {
            activeSortMode = "currentContribution";
          }
        }

        // Auto turn Tableau back on when landing in a tableau-capable view
        // (unless intentionally off / blocked by mobile YOY/MOM); off otherwise.
        applyTableauAutoState();
        if (!showTableau && activeSortMode === "tableau") {
          activeSortMode = "currentContribution";
        }

        setActiveViewTab(activeView);
        updateGroupDrillNav();
        renderLeaderboard();
      });

      viewTabs.appendChild(btn);
    });
  
    [
      { key: "today", label: "Today" },
      { key: "wtd", label: "WTD" },
      { key: "mtd", label: "MTD" },
      { key: "ytd", label: "YTD" },
      { key: "lastWeek", label: "Last Week" },
      { key: "custom", label: "Custom" }
    ].forEach(mode => {
      const btn = document.createElement("button");
      btn.textContent = mode.label;
      btn.classList.toggle("active", activeDateMode === mode.key);
  
      btn.addEventListener("click", () => {
    activeDateMode = mode.key;
    document.querySelectorAll("#date-tabs button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
  
    document.getElementById("custom-date-wrapper").style.display =
      mode.key === "custom" ? "flex" : "none";
    updateCustomPending();

    rebuildTableauMap();

    // Auto-restore Tableau when switching to a tableau-capable date (and turn it
    // off for Today/Custom), respecting an intentional off + mobile YOY/MOM.
    applyTableauAutoState();
    if (!showTableau && activeSortMode === "tableau") {
      activeSortMode = "currentContribution";
    }

    renderLeaderboard();
  });
  
      dateTabs.appendChild(btn);
    });
  
    const tableauBtn = document.createElement("button");
    tableauBtn.id = "tableau-toggle";
    tableauBtn.textContent = "Tableau";
    tableauBtn.addEventListener("click", () => {
      const turningTableauOff = showTableau;

      if (turningTableauOff && isOnlyPlataOfficeSelected()) {
        includeIceCollective = true;
        includeRiot = true;
        rebuildComparisonMapsForOffice();
      }

      setShowTableau(!showTableau);
      tableauUserOff = !showTableau; // remember the user's intentional choice
      if (showTableau) {
        if (activeSortMode !== "bagels") activeSortMode = "tableau";
        // Portrait mobile can't fit Tableau alongside a comparison column.
        if (isPortraitMobile() && (showYoy || showMom || showCoc)) {
          showYoy = false;
          showMom = false;
          showCoc = false;
        }
      }
      renderLeaderboard();
    });
    tableauTabs.appendChild(tableauBtn);
  
  const yoyBtn = document.createElement("button");
  yoyBtn.id = "yoy-toggle";
  yoyBtn.textContent = "YOY";
  yoyBtn.addEventListener("click", () => {
    showYoy = !showYoy;
    momDateRanges = null;

    if (showYoy) {
      showMom = false;
      showCoc = false;
      if (activeSortMode !== "bagels") activeSortMode = "currentContribution";
      includeOldReps = true;
      includeNewReps = true;

      if (isPortraitMobile() && showTableau) {
        setShowTableau(false);
      }
    }

    renderLeaderboard();
  });
  tableauTabs.appendChild(yoyBtn);

  const momBtn = document.createElement("button");
  momBtn.id = "mom-toggle";
  momBtn.textContent = "MOM";
  momBtn.addEventListener("click", () => {
    showMom = !showMom;
    momDateRanges = null;

    if (showMom) {
      showYoy = false;
      showCoc = false;
      if (activeSortMode !== "bagels") activeSortMode = "currentContribution";
      includeOldReps = true;
      includeNewReps = true;

      if (isPortraitMobile() && showTableau) {
        setShowTableau(false);
      }
    }

    renderLeaderboard();
  });
  tableauTabs.appendChild(momBtn);

  const cocBtn = document.createElement("button");
  cocBtn.id = "coc-toggle";
  cocBtn.textContent = "COC";
  cocBtn.addEventListener("click", () => {
    if (!hasCustomRange()) return; // only after a Custom range is applied
    showCoc = !showCoc;
    momDateRanges = null;

    if (showCoc) {
      showYoy = false;
      showMom = false;
      if (activeSortMode !== "bagels") activeSortMode = "currentContribution";
      includeOldReps = true;
      includeNewReps = true;

      if (isPortraitMobile() && showTableau) {
        setShowTableau(false);
      }
    }

    renderLeaderboard();
  });
  tableauTabs.appendChild(cocBtn);
  
  const newRepsBtn = document.createElement("button");
  newRepsBtn.id = "new-reps-toggle";
  newRepsBtn.textContent = "Include New Reps";
  newRepsBtn.addEventListener("click", () => {
    includeNewReps = !includeNewReps;
    renderLeaderboard();
  });
  tableauTabs.appendChild(newRepsBtn);
  
  const oldRepsBtn = document.createElement("button");
  oldRepsBtn.id = "old-reps-toggle";
  oldRepsBtn.textContent = "Include Old Reps";
  oldRepsBtn.addEventListener("click", () => {
    includeOldReps = !includeOldReps;
    renderLeaderboard();
  });
  tableauTabs.appendChild(oldRepsBtn);
  
  document.getElementById("apply-custom").addEventListener("click", function () {
    recordAppliedCustom();
    renderLeaderboard();
  });

  const leaderboardApp = document.getElementById("leaderboard-app");
  if (leaderboardApp) {
    leaderboardApp.addEventListener("click", event => {
      // "Inactive Reps" row INSIDE a group drill-down -> a group-scoped inactive
      // drill (just that leader's inactive reps). Back returns to that drill.
      const inactiveLeaderBtn = event.target.closest("[data-inactive-drill-leader]");
      if (inactiveLeaderBtn) {
        groupDrillReturn = null;
        inactiveDrillLeader = inactiveLeaderBtn.getAttribute("data-inactive-drill-leader");
        activeView = "groups";
        activeInactiveDrill = true;
        activeGroupDrillLeader = null;
        setActiveViewTab("groups");
        updateGroupDrillNav();
        renderLeaderboard();
        return;
      }

      // "Inactive Reps" button (group row in the Groups list, or the summary row
      // on a main view) -> open the whole-team "Inactive Reps" drill-down.
      const inactiveDrillBtn = event.target.closest("[data-inactive-drill]");
      if (inactiveDrillBtn) {
        // Coming from a main view (General/Setters/Experts/SelfGen): remember the
        // exact view so Back returns there, not the Groups list. Coming from
        // within Groups, Back should fall through to the Groups list.
        groupDrillReturn = activeView === "groups"
          ? null
          : { rep: null, state: captureViewState() };
        activeView = "groups";
        activeInactiveDrill = true;
        inactiveDrillLeader = null;
        activeGroupDrillLeader = null;
        setActiveViewTab("groups");
        updateGroupDrillNav();
        renderLeaderboard();
        return;
      }

      const officeButton = event.target.closest("[data-office-group]");
      if (officeButton && activeView === "groups" && !activeGroupDrillLeader) {
        navigateToGeneralFromOfficeGroup(officeButton.getAttribute("data-office-group"));
        return;
      }

      const leaderButton = event.target.closest("[data-group-leader]");
      if (!leaderButton || activeView !== "groups" || activeGroupDrillLeader) return;

      // Manual drill-in from the Groups list: Back should go to that list.
      groupDrillReturn = null;
      activeGroupDrillLeader = leaderButton.getAttribute("data-group-leader");
      updateGroupDrillNav();
      renderLeaderboard();
    });
  }

  applyProvenLayout();
  }

  // Help / bug-report modal: a baseball-card-sized panel holding the Apps Script
  // help page in an iframe (so the form's file upload + email + sheet save all run
  // same-origin via google.script.run — no CORS).
  function ensureHelpOverlay() {
    var ov = document.getElementById("pv-help-overlay");
    if (ov) return ov;
    // Warm up the connection to the Apps Script host so the iframe loads faster.
    try {
      ["https://script.google.com", "https://script.googleusercontent.com"].forEach(function (h) {
        var l = document.createElement("link"); l.rel = "preconnect"; l.href = h; l.crossOrigin = ""; document.head.appendChild(l);
      });
    } catch (e) {}
    ov = document.createElement("div");
    ov.id = "pv-help-overlay";
    ov.className = "pv-frame-modal";
    ov.innerHTML =
      '<div class="pv-help-card">' +
        '<button class="pv-help-close" type="button" aria-label="Close">&times;</button>' +
        '<div class="pv-help-spin" id="pv-help-spin"></div>' +
        '<iframe class="pv-help-frame" title="Help & feedback"></iframe>' +
      '</div>';
    document.body.appendChild(ov);
    ov.addEventListener("click", function (e) { if (e.target === ov) ov.style.display = "none"; });
    ov.querySelector(".pv-help-close").addEventListener("click", function () { ov.style.display = "none"; });
    var frame = ov.querySelector(".pv-help-frame");
    frame.addEventListener("load", function () { var s = document.getElementById("pv-help-spin"); if (s) s.style.display = "none"; });
    frame.src = API_URL + "?page=help"; // start loading immediately
    return ov;
  }
  function openHelpModal() {
    ensureHelpOverlay().style.display = "flex";
  }
  // Build + start loading the iframe in the background (stays hidden) so the
  // modal is instant when the rep actually taps "?".
  function preloadHelpModal() { ensureHelpOverlay(); }

  // Second System report modal (opened from the Mexico disclaimer link).
  function ensureSecondSystemOverlay() {
    var ov = document.getElementById("pv-ss-overlay");
    if (ov) return ov;
    ov = document.createElement("div");
    ov.id = "pv-ss-overlay";
    ov.className = "pv-frame-modal";
    ov.innerHTML =
      '<div class="pv-help-card">' +
        '<button class="pv-help-close" type="button" aria-label="Close">&times;</button>' +
        '<div class="pv-help-spin" id="pv-ss-spin"></div>' +
        '<iframe class="pv-help-frame" title="Report a Second System"></iframe>' +
      '</div>';
    document.body.appendChild(ov);
    ov.addEventListener("click", function (e) { if (e.target === ov) ov.style.display = "none"; });
    ov.querySelector(".pv-help-close").addEventListener("click", function () { ov.style.display = "none"; });
    var frame = ov.querySelector(".pv-help-frame");
    frame.addEventListener("load", function () { var s = document.getElementById("pv-ss-spin"); if (s) s.style.display = "none"; });
    frame.src = API_URL + "?page=secondsystem&token=" + encodeURIComponent(getSessionToken());
    return ov;
  }
  function openSecondSystemModal() { ensureSecondSystemOverlay().style.display = "flex"; }
  window.openSecondSystemModal = openSecondSystemModal;

  // One-time DOM reshuffle to match the Proven design: All Offices button,
  // Tableau as a top-right corner toggle, and the date controls as a T-island
  // with YOY/MOM tucked into the bottom-right. All buttons keep their existing
  // event listeners (moving an element preserves them), so functionality is
  // unchanged; updateTableauToggle() re-syncs active/visibility every render.
  function applyProvenLayout() {
    // Tableau toggle -> top-right corner bar
    var app = document.getElementById("leaderboard-app");
    var tabBtn = document.getElementById("tableau-toggle");
    if (app && tabBtn && !document.getElementById("pv-topbar")) {
      var bar = document.createElement("div");
      bar.id = "pv-topbar";

      var logo = document.createElement("div");
      logo.id = "pv-logo";
      logo.innerHTML = 'PROVEN<span>LEADERBOARD</span>';

      // Faint "?" help button stacked UNDER the logo, INSIDE the sticky bar — so
      // it stays aligned to the logo, is always clickable, and never gets clipped
      // by the scroll backdrop that sits in the strip below the bar.
      var helpBtn = document.createElement("button");
      helpBtn.id = "pv-help-btn";
      helpBtn.type = "button";
      helpBtn.textContent = "?";
      helpBtn.setAttribute("aria-label", "Help & feedback");
      helpBtn.addEventListener("click", openHelpModal);

      var leftCol = document.createElement("div");
      leftCol.className = "pv-topleft";
      leftCol.appendChild(logo);
      leftCol.appendChild(helpBtn);

      var spacer = document.createElement("div");
      spacer.className = "pv-topspacer";
      bar.appendChild(leftCol);
      bar.appendChild(spacer);
      bar.appendChild(tabBtn);
      app.insertBefore(bar, app.firstChild);
    }

    // 3) Date controls -> T-island; YOY/MOM tucked into the bottom-right
    var dateTabs = document.getElementById("date-tabs");
    if (dateTabs && !dateTabs.querySelector(".pv-island")) {
      var byLabel = {};
      Array.prototype.slice.call(dateTabs.querySelectorAll("button")).forEach(function (b) {
        byLabel[b.textContent.trim()] = b;
      });
      var island = document.createElement("div"); island.className = "pv-island";
      var tpill = document.createElement("div"); tpill.className = "pv-tpill";
      ["Today", "WTD", "MTD", "YTD"].forEach(function (l) { if (byLabel[l]) tpill.appendChild(byLabel[l]); });
      var brow = document.createElement("div"); brow.className = "pv-brow";
      var sp = document.createElement("span");
      var bpill = document.createElement("div"); bpill.className = "pv-bpill";
      ["Last Week", "Custom"].forEach(function (l) { if (byLabel[l]) bpill.appendChild(byLabel[l]); });
      var cmp = document.createElement("div"); cmp.className = "pv-cmpcell";
      var yoyB = document.getElementById("yoy-toggle");
      var momB = document.getElementById("mom-toggle");
      var cocB = document.getElementById("coc-toggle");
      if (yoyB) cmp.appendChild(yoyB);
      if (momB) cmp.appendChild(momB);
      if (cocB) cmp.appendChild(cocB);
      brow.appendChild(sp); brow.appendChild(bpill); brow.appendChild(cmp);
      island.appendChild(tpill); island.appendChild(brow);
      dateTabs.appendChild(island);
    }

    // "Bagels" reverse-leaderboard button + a "Mexico" button beneath it, anchored
    // just LEFT of the date T-pill (absolute, so it never depends on the island
    // width and the T-pill stays centered with YOY/MOM untouched).
    var tpillEl = dateTabs && dateTabs.querySelector(".pv-tpill");
    if (tpillEl && !document.getElementById("bagel-toggle")) {
      var bagelStack = document.createElement("div");
      bagelStack.className = "pv-bagel-stack";

      var bagelBtn = document.createElement("button");
      bagelBtn.id = "bagel-toggle";
      bagelBtn.type = "button";
      bagelBtn.className = "bagel-toggle";
      bagelBtn.textContent = "Bagels";
      bagelBtn.addEventListener("click", onBagelButtonClick);

      var mexicoBtn = document.createElement("button");
      mexicoBtn.id = "mexico-toggle";
      mexicoBtn.type = "button";
      mexicoBtn.className = "bagel-toggle mexico-toggle";
      mexicoBtn.textContent = "Mexico";
      mexicoBtn.addEventListener("click", onMexicoButtonClick);

      bagelStack.appendChild(bagelBtn);
      bagelStack.appendChild(mexicoBtn);
      tpillEl.appendChild(bagelStack);
      updateBagelButtonState();
    }

    // Mexico image panel (replaces the date controls) + disclaimer, inserted right
    // after the date controls. Hidden unless Mexico mode is on.
    if (dateTabs && !document.getElementById("mexico-panel")) {
      var mexPanel = document.createElement("div");
      mexPanel.id = "mexico-panel";
      mexPanel.style.display = "none";
      mexPanel.innerHTML =
        '<img class="mexico-img" src="' + MEXICO_IMG_URL + '" alt="The Block Trip — Cabo San Lucas, Mexico">' +
        '<div class="mexico-disclaimer">This Tableau data does not account for Second Systems. ' +
        'If you know you have a Second System, self-deduct it or ' +
        '<a href="#" class="mexico-ss-link">request that it be accounted for.</a></div>';
      dateTabs.parentNode.insertBefore(mexPanel, dateTabs.nextSibling);
      var ssLink = mexPanel.querySelector(".mexico-ss-link");
      if (ssLink) ssLink.addEventListener("click", function (e) { e.preventDefault(); openSecondSystemModal(); });
    }

    // Mexico "Back" button to the LEFT of the office selectors.
    var officeTabsEl = document.getElementById("office-tabs");
    if (officeTabsEl && !document.getElementById("mexico-back")) {
      var backBtn = document.createElement("button");
      backBtn.id = "mexico-back";
      backBtn.type = "button";
      backBtn.className = "group-drill-back mexico-back";
      backBtn.textContent = "← Back";
      backBtn.style.display = "none";
      backBtn.addEventListener("click", exitMexico);
      officeTabsEl.insertBefore(backBtn, officeTabsEl.firstChild);
    }
    updateMexicoUI();

    setupControlScrollFade();
    setupCustomDateRow();
  }

  // Mobile: fade each filter-pill row out exactly as it scrolls up to the sticky
  // top bar, so it tucks away cleanly (no hard "half pill" clip, no lingering
  // ghost, and fully visible at rest). Driven by each row's live distance to the
  // bar rather than a fixed CSS backdrop, which can't tell "at rest" from "scrolled".
  function setupControlScrollFade() {
    if (window.__pvScrollFade) return;
    window.__pvScrollFade = true;

    var app = document.getElementById("leaderboard-app");
    var ids = ["office-tabs", "view-tabs", "date-tabs"];

    function onScroll() {
      var y = window.pageYOffset || document.documentElement.scrollTop || 0;
      if (app) app.classList.toggle("pv-scrolled", y > 24);

      var mobile = window.innerWidth <= 760;
      var bar = document.getElementById("pv-topbar");
      var barBottom = bar ? bar.getBoundingClientRect().bottom : 52;

      // At/near the top of the page, never fade — just keep the selectors fully
      // visible. This avoids the load-time bug where the fade ran before layout
      // settled and left the selectors hidden until the first touch/scroll.
      var atTop = y < 4;

      ids.forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        if (!mobile || atTop) { el.style.opacity = ""; el.style.pointerEvents = ""; return; }
        var rect = el.getBoundingClientRect();
        var h = rect.height || 1;
        // Fraction of the row still BELOW the bar: 1 when fully below, fading to 0
        // as it slides up under the bar.
        var op = (rect.bottom - barBottom) / h;
        op = op < 0 ? 0 : (op > 1 ? 1 : op);
        el.style.opacity = String(op);
        el.style.pointerEvents = op < 0.12 ? "none" : "";
      });
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    window.addEventListener("load", onScroll);
    onScroll();
    // re-run after layout/fonts settle so initial opacities are correct
    setTimeout(onScroll, 60);
    setTimeout(onScroll, 300);
  }

  function updateGroupDrillNav() {
    const officeTabs = document.getElementById("office-tabs");
    const toggleButtons = document.getElementById("office-toggle-buttons");
    const drillNav = document.getElementById("group-drill-nav");
    const drillTitle = document.getElementById("group-drill-title");

    if (!officeTabs) return;

    if (!isLeaderboardReady || isSubsetMode) {
      officeTabs.style.display = "none";
      return;
    }

    const showDrillNav = activeView === "groups" && (activeGroupDrillLeader || activeInactiveDrill);

    officeTabs.style.display = "flex";
    if (toggleButtons) toggleButtons.style.display = showDrillNav ? "none" : "flex";
    if (drillNav) drillNav.style.display = showDrillNav ? "flex" : "none";
    if (showDrillNav && drillTitle) {
      drillTitle.textContent = activeInactiveDrill
        ? (inactiveDrillLeader ? `${inactiveDrillLeader} Group · Inactive` : "Inactive Reps")
        : `${activeGroupDrillLeader} Group`;
    }
  }
  
  function updateTableauToggle() {
    const wrapper = document.getElementById("tableau-tabs");
    const btn = document.getElementById("tableau-toggle");
    const yoyBtn = document.getElementById("yoy-toggle");
    const momBtn = document.getElementById("mom-toggle");
    const officeTabs = document.getElementById("office-tabs");

    if (!wrapper || !btn) return;

    updateGroupDrillNav();

    const iceBtn = document.getElementById("ice-collective-toggle");
    const riotBtn = document.getElementById("riot-toggle");
    const plataBtn = document.getElementById("plata-toggle");
    if (iceBtn) iceBtn.classList.toggle("active", includeIceCollective);
    if (riotBtn) riotBtn.classList.toggle("active", includeRiot);

    const key = getTableauKeyForDateMode();
    const dataset = key ? tableauData[key] : null;

    const shouldShowTableau = canShowTableauButton();
    const canSelectPlata = canUsePlataToggle();

    const shouldShowYoy =
      activeDateMode === "ytd" &&
      previousYearDeals.length;

    const shouldShowMom =
      activeDateMode === "mtd" &&
      previousYearDeals.length > 0;

    // The Tableau toggle and YOY/MOM were relocated (topbar / date island), so this
    // wrapper now only holds the old-reps/new-reps toggles. Only give it space when
    // those are actually visible (comparison mode); otherwise it's an empty box that
    // shifts the board up/down as date modes change.
    wrapper.style.display = isComparisonMode() ? "flex" : "none";

    // Keep the Tableau toggle in place; fade + disable it (like Plata) instead of hiding.
    btn.style.display = "inline-block";
    btn.disabled = !shouldShowTableau;
    btn.classList.toggle("disabled", !shouldShowTableau);

    if (plataBtn) {
      plataBtn.classList.toggle("active", includePlata && canSelectPlata);
      plataBtn.disabled = !canSelectPlata;
      plataBtn.classList.toggle("disabled", !canSelectPlata);
    }

    // Keep the same label (incl. the date) so the button never changes size — just fade it.
    const labelDate = dataset ? formatShortDate(dataset.lastUpdated) : "";
    btn.textContent = labelDate ? `Tableau ${labelDate}` : "Tableau";
    if (!shouldShowTableau) {
      setShowTableau(false);
      btn.classList.remove("active");
    } else {
      btn.classList.toggle("active", showTableau);
    }

    if (!canSelectPlata) {
      includePlata = false;
    }

    if (yoyBtn) {
      yoyBtn.style.display = shouldShowYoy ? "inline-block" : "none";
      if (!shouldShowYoy) showYoy = false;
      yoyBtn.classList.toggle("active", showYoy);
    }

    if (momBtn) {
      momBtn.style.display = shouldShowMom ? "inline-block" : "none";
      if (!shouldShowMom) showMom = false;
      momBtn.classList.toggle("active", showMom);
    }

    const cocBtn = document.getElementById("coc-toggle");
    if (cocBtn) {
      const shouldShowCoc = activeDateMode === "custom" && previousYearDeals.length > 0;
      const canSelectCoc = shouldShowCoc && hasCustomRange();
      cocBtn.style.display = shouldShowCoc ? "inline-block" : "none";
      if (!canSelectCoc) showCoc = false;               // no range applied -> can't be on
      cocBtn.disabled = !canSelectCoc;
      cocBtn.classList.toggle("disabled", !canSelectCoc);
      cocBtn.classList.toggle("active", showCoc);
    }

    const oldRepsBtn = document.getElementById("old-reps-toggle");
  const newRepsBtn = document.getElementById("new-reps-toggle");

  if (oldRepsBtn) {
    oldRepsBtn.style.display = (OLD_REPS_TOGGLE_ENABLED && isComparisonMode()) ? "inline-block" : "none";
    oldRepsBtn.classList.toggle("active", oldRepsActive());
  }

  if (newRepsBtn) {
    newRepsBtn.style.display = isComparisonMode() ? "inline-block" : "none";
    newRepsBtn.classList.toggle("active", includeNewReps);
  }
  }
  
  function dealInScope(deal) {
    if (!isSubsetMode || !activeDownlineNames) return true;

    const setterInScope = activeDownlineNames.has(normalizeName(deal.setter));
    const expertInScope = activeDownlineNames.has(normalizeName(deal.expert));

    return setterInScope || expertInScope;
  }
  
  function dealInDateRange(deal, range) {
    if (!deal.date || !range.start || !range.end) return false;
    return deal.date >= range.start && deal.date <= range.end;
  }
  
  function getRepMap(filteredDeals) {
    const includeZeroRows = useMomColumn() || !["today", "ytd"].includes(activeDateMode);
    const baseDeals = includeZeroRows ? allDeals.filter(deal => dealInScope(deal)) : filteredDeals;
  
    const repMap = new Map();
  
    function ensureRep(name) {
      const norm = normalizeName(name);
      if (!name || HIDDEN_REPS.has(norm)) return null;

      if (isTableauOnlyRep(norm) && !hasInternalRepHistory(norm)) return null;

      if (!repInOfficeUmbrella(norm)) return null;

      if (isSubsetMode && activeDownlineNames && !activeDownlineNames.has(norm)) {
        return null;
      }
  
      if (!repMap.has(norm)) {
        repMap.set(norm, {
          name: String(name).trim(),
          sets: 0,
          closes: 0,
          selfGen: 0,
          setOnly: 0,
          lifetimeSets: 0,
          lifetimeCloses: 0,
          lifetimeSelfGen: 0,
          dealIds: new Set(),
          setterDealIds: new Set(),
          expertDealIds: new Set()
        });
      }
  
      return repMap.get(norm);
    }
  
    baseDeals.forEach(deal => {
      const setterNorm = normalizeName(deal.setter);
      const expertNorm = normalizeName(deal.expert);
      const isSelfGen = setterNorm && expertNorm && setterNorm === expertNorm;
  
      const setter = ensureRep(deal.setter);
      if (setter) {
        setter.lifetimeSets += 1;
        if (isSelfGen) setter.lifetimeSelfGen += 1;
      }
  
      const expert = ensureRep(deal.expert);
      if (expert) {
        expert.lifetimeCloses += 1;
      }
    });
  
    filteredDeals.forEach(deal => {
      const dealId = getDealId(deal);
      if (!dealId) return;

      const setterNorm = normalizeName(deal.setter);
      const expertNorm = normalizeName(deal.expert);
      const isSelfGen = setterNorm && expertNorm && setterNorm === expertNorm;

      const setter = ensureRep(deal.setter);
      if (setter) {
        setter.sets += 1;
        setter.dealIds.add(dealId);
        setter.setterDealIds.add(dealId);

        if (isSelfGen) {
          setter.selfGen += 1;
        } else {
          setter.setOnly += 1;
        }
      }

      const expert = ensureRep(deal.expert);
      if (expert) {
        expert.closes += 1;
        expert.dealIds.add(dealId);
        expert.expertDealIds.add(dealId);
      }
    });

    return Array.from(repMap.values()).map(rep => ({
      name: rep.name,
      sets: rep.sets,
      closes: rep.closes,
      selfGen: rep.selfGen,
      setOnly: rep.setOnly,
      lifetimeSets: rep.lifetimeSets,
      lifetimeCloses: rep.lifetimeCloses,
      lifetimeSelfGen: rep.lifetimeSelfGen,
      cs: rep.dealIds.size,
      setterCs: rep.setterDealIds.size,
      expertCs: rep.expertDealIds.size,
      dealIds: rep.dealIds,
      setterDealIds: rep.setterDealIds,
      expertDealIds: rep.expertDealIds,
      tableau: tableauMap.get(normalizeName(rep.name)) || {},
      previousYearSetOnly: previousYearDetailsMap.get(normalizeName(rep.name))?.setOnly || 0,
      previousYearSelfGen: previousYearDetailsMap.get(normalizeName(rep.name))?.selfGen || 0,
      previousYearSets: previousYearDetailsMap.get(normalizeName(rep.name))?.sets || 0,
      previousYearCloses: previousYearDetailsMap.get(normalizeName(rep.name))?.closes || 0,
      previousMonthSetOnly: previousMonthDetailsMap.get(normalizeName(rep.name))?.setOnly || 0,
      previousMonthSelfGen: previousMonthDetailsMap.get(normalizeName(rep.name))?.selfGen || 0,
      previousMonthSets: previousMonthDetailsMap.get(normalizeName(rep.name))?.sets || 0,
      previousMonthCloses: previousMonthDetailsMap.get(normalizeName(rep.name))?.closes || 0
    }));
  }

  function rowMatchesActiveView(row) {
    const norm = normalizeName(row.name);
    const view = effectiveRoleView();

    if (view === "setters") {
      const isCurrentSetter =
        row.lifetimeSets > 0 &&
        row.lifetimeCloses === 0 &&
        !previousYearHadClose(norm);

      const isOldSetter =
        isComparisonMode() &&
        getRowPreviousSets(row) > 0 &&
        getRowPreviousCloses(row) === 0;

      return isCurrentSetter || isOldSetter;
    }

    if (view === "experts") {
      const isCurrentExpert = row.lifetimeCloses > 0;
      const isOldExpert =
        isComparisonMode() &&
        getRowPreviousCloses(row) > 0;

      return isCurrentExpert || isOldExpert;
    }

    if (view === "selfgen") {
      return row.selfGen > 0 || (isComparisonMode() && getRowPreviousSelfGen(row) > 0);
    }

    return true;
  }

  function addOldRepsToRows(rows) {
    if (!isComparisonMode() || !oldRepsActive()) return rows;

    const existing = new Set(rows.map(row => normalizeName(row.name)));
    const previousDeals = useMomColumn() ? getMomPreviousDeals() : previousYearDeals;

    previousDeals.forEach(deal => {
      [deal.setter, deal.expert].forEach(name => {
        const norm = normalizeName(name);
        if (!norm || HIDDEN_REPS.has(norm) || existing.has(norm)) return;
        if (!repInOfficeUmbrella(norm, "previous")) return;

        const stats = getPreviousRepStats(norm);
        if (!stats || stats.sets + stats.closes === 0) return;

        if (
            isSubsetMode &&
            activePreviousYearDownlineNames &&
            !activePreviousYearDownlineNames.has(norm)
        ) return;

        existing.add(norm);

        rows.push({
          name: String(name).trim(),
          sets: 0,
          closes: 0,
          selfGen: 0,
          setOnly: 0,
          lifetimeSets: 0,
          lifetimeCloses: 0,
          lifetimeSelfGen: 0,
          cs: 0,
          setterCs: 0,
          expertCs: 0,
          dealIds: new Set(),
          setterDealIds: new Set(),
          expertDealIds: new Set(),
          tableau: tableauMap.get(norm) || {},
          previousYearSetOnly: previousYearDetailsMap.get(norm)?.setOnly || 0,
          previousYearSelfGen: previousYearDetailsMap.get(norm)?.selfGen || 0,
          previousYearSets: previousYearDetailsMap.get(norm)?.sets || 0,
          previousYearCloses: previousYearDetailsMap.get(norm)?.closes || 0,
          previousMonthSetOnly: previousMonthDetailsMap.get(norm)?.setOnly || 0,
          previousMonthSelfGen: previousMonthDetailsMap.get(norm)?.selfGen || 0,
          previousMonthSets: previousMonthDetailsMap.get(norm)?.sets || 0,
          previousMonthCloses: previousMonthDetailsMap.get(norm)?.closes || 0
        });
      });
    });

    return rows;
  }

  function addTableauRecruitingRepsToRows(rows) {
    if (activeView !== "general") return rows;

    const existing = new Set(rows.map(row => normalizeName(row.name)));

    tableauMap.forEach((tableauRow, norm) => {
      if (HIDDEN_REPS.has(norm) || existing.has(norm)) return;
      if (!isRecruitingRep(norm) || !hasTableauRowData(tableauRow)) return;
      if (hasInternalRepHistory(norm)) return;
      if (!repInOfficeUmbrella(norm)) return;

      if (isSubsetMode && activeDownlineNames && !activeDownlineNames.has(norm)) return;

      existing.add(norm);
      rows.push(buildEmptyInternalRow(tableauRow.name, tableauRow));
    });

    return rows;
  }

  // Add org-tree reps who haven't sold yet (no internal CS, usually no Tableau),
  // so they still appear on the board with 0s. Reps already shown (any sale) are
  // skipped; intentionally-removed reps stay hidden via HIDDEN_REPS. General view
  // shows them in the list; Groups view needs them in `rows` so the group drill
  // (which filters rows by downline) includes them too.
  function addOrgTreeRepsToRows(rows) {
    if (activeView !== "general" && activeView !== "groups") return rows;

    const existing = new Set(rows.map(row => normalizeName(row.name)));

    recruitingRows.forEach(r => {
      const norm = normalizeName(r.name);
      if (!norm || HIDDEN_REPS.has(norm) || existing.has(norm)) return;
      if (!repInOfficeUmbrella(norm)) return;
      if (isSubsetMode && activeDownlineNames && !activeDownlineNames.has(norm)) return;

      existing.add(norm);
      rows.push(buildEmptyInternalRow(r.name, tableauMap.get(norm) || {}));
    });

    return rows;
  }

  function addPlataRepsToRows(rows) {
    const existing = new Set(rows.map(row => normalizeName(row.name)));

    tableauMap.forEach((tableauRow, norm) => {
      if (HIDDEN_REPS.has(norm) || existing.has(norm) || !isPlataRep(norm)) return;
      if (!hasTableauRowData(tableauRow)) return;
      // Gate relaxed: show all Plata reps (we know experts from the Tableau Experts
      // list; everyone else is a setter). View-aware so Experts/Setters tabs match.
      if (activeView === "experts" && !isPlataExpert(norm)) return;
      if (activeView === "setters" && isPlataExpert(norm)) return;

      existing.add(norm);
      rows.push({
        ...buildEmptyInternalRow(tableauRow.name, tableauRow),
        isPlataOnly: true
      });
    });

    return rows;
  }

  // Plata reps belong to no group, so the only group drill they appear in is the
  // whole-team "Inactive Reps" drill — and only the INACTIVE ones (active Plata
  // show on the main board). Caller gates on date mode (not Custom/YOY/MOM).
  function addInactivePlataRows(rows) {
    const existing = new Set(rows.map(r => normalizeName(r.name)));
    const inactive = getInactiveSet();
    const ytd = activeDateMode === "ytd";
    tableauMap.forEach((tableauRow, norm) => {
      if (HIDDEN_REPS.has(norm) || existing.has(norm) || !isPlataRep(norm)) return;
      if (!hasTableauRowData(tableauRow) || !inactive.has(norm)) return;
      const row = { ...buildEmptyInternalRow(tableauRow.name, tableauRow), isPlataOnly: true };
      if (!ytd && !rowHasPeriodActivity(row)) return; // short period: needs period activity
      existing.add(norm);
      rows.push(row);
    });
    return rows;
  }

  function getCreditTotalsFromDeals(deals, rows, year = "current") {
    const visibleNames = new Set(rows.map(row => normalizeName(row.name)));

    let sets = 0;
    let cs = 0;

    deals.forEach(deal => {
      const setterNorm = normalizeName(deal.setter);
      const expertNorm = normalizeName(deal.expert);
      if (visibleNames.has(setterNorm) && repInOfficeUmbrella(setterNorm, year)) sets += 1;
      if (visibleNames.has(expertNorm) && repInOfficeUmbrella(expertNorm, year)) cs += 1;
    });

    return { sets, cs };
  }

  function getUniqueRoleDealTotal(deals, rows, role, year = "current") {
    const visibleNames = new Set(rows.map(row => normalizeName(row.name)));
    const dealIds = new Set();

    deals.forEach(deal => {
      const dealId = getDealId(deal);
      if (!dealId) return;

      const name = role === "expert" ? deal.expert : deal.setter;
      const norm = normalizeName(name);
      if (!visibleNames.has(norm) || !repInOfficeUmbrella(norm, year)) return;

      dealIds.add(dealId);
    });

    return dealIds.size;
  }

  function previousYearHadClose(normName) {
    return previousYearDeals.some(deal =>
      normalizeName(deal.expert) === normName
    );
  }

  // "Expert" = has ever closed a deal (this year or last). Used to split group
  // lenses: pure setters (never closed) vs experts (closed). Cached per dataset.
  let everClosedCache = null;
  function repEverClosed(normName) {
    if (!normName) return false;
    if (!everClosedCache) {
      everClosedCache = new Set();
      allDeals.forEach(d => {
        const e = normalizeName(d.expert);
        if (e) everClosedCache.add(e);
      });
    }
    return everClosedCache.has(normName) || previousYearHadClose(normName);
  }

  function getComparisonPercent(current, previous) {
    if (!previous) return null;
    if (current === 0) return null;

    return ((current - previous) / previous) * 100;
  }

  // Comparison % note, colored green when positive / red when negative / default at 0.
  function pctNoteHtml(pct) {
    const sign = pct > 0 ? "+" : "";
    const cls = pct > 0 ? " pct-pos" : (pct < 0 ? " pct-neg" : "");
    return `<span class="cs-note-left${cls}">${sign}${pct.toFixed(0)}%</span>`;
  }

  // Place the comparison % at the TOP of the current-period (2026) subscript
  // stack — above Sets/SG/CS — so it never overlaps the previous-period (2025)
  // subscripts in the next column. Works on an empty stack too (% shows alone).
  function injectPctIntoStack(stackHtml, pct) {
    if (pct === null || pct === undefined) return stackHtml;
    return stackHtml.replace(/<div class="cs-notes-stack">/, `<div class="cs-notes-stack">${pctNoteHtml(pct)}`);
  }

  function buildCreditTotalCell(totals, comparisonPct = null, showNotes = true) {
    const total = (totals.sets + totals.cs) / 2;

    const leftBase = showNotes
      ? buildSetsCsNotesStack(totals.sets, totals.cs)
      : `<div class="cs-notes-stack"></div>`;
    const leftHtml = injectPctIntoStack(leftBase, comparisonPct);

    return `
      <div class="cs-cell">
        ${leftHtml}
        <span class="cs-main">${total}</span>
      </div>
    `;
  }

  function buildUniqueTotalCell(value, comparisonPct = null, leftNotes = null, showExclPlata = false) {
    const leftBase = leftNotes && leftNotes.length
      ? `<div class="cs-notes-stack">${leftNotes.join("")}</div>`
      : `<div class="cs-notes-stack"></div>`;
    const leftHtml = injectPctIntoStack(leftBase, comparisonPct);
    // Tiny note under the number: this internal total leaves out Plata SRAs.
    // Absolutely positioned so it doesn't shift the centered total.
    const exclNote = showExclPlata ? `<span class="cs-excl-plata">Excl. Plata</span>` : "";

    return `
      <div class="cs-cell">
        ${leftHtml}
        <span class="cs-main">${value}</span>
        ${exclNote}
      </div>
    `;
  }

  function buildExpertTotalNotes(selfGen, setOnly) {
    const notes = [];
    if (selfGen > 0) notes.push(`<span class="cs-note-left">SG: ${selfGen}</span>`);
    if (setOnly > 0) notes.push(`<span class="cs-note-left">Sets: ${setOnly}</span>`);
    return notes;
  }

  function sumVisibleUniqueCs(rows, getValue, forPrevious = false) {
    return rows.reduce((sum, row) => {
      if (row.isPlataOnly) return sum;
      if (forPrevious ? rowShowsPreviousNa(row) : rowShowsCurrentNa(row)) return sum;
      return sum + getValue(row);
    }, 0);
  }
  
  function getTableauTotal(rows, metric) {
    // Office-level Tableau total for the active period, summing the SELECTED
    // offices (Proven = all). Formatted like a tableau cell (main + left notes).
    const key = getTableauKeyForDateMode();
    const periodData = key ? tableauOffices[key] : null;
    if (!periodData) return "";

    const selected = [];
    if (includeIceCollective && periodData.ice) selected.push(periodData.ice);
    if (includeRiot && periodData.riot) selected.push(periodData.riot);
    if (includePlata && periodData.plata) selected.push(periodData.plata);
    if (!selected.length) return "";

    const totals = {};
    Object.keys(TABLEAU_METRICS).forEach(m => {
      totals[m] = selected.reduce((sum, o) => sum + (Number(o[m]) || 0), 0);
    });

    const selectedValue = totals[metric] != null ? totals[metric] : "";
    const notes = Object.keys(TABLEAU_METRICS)
      .filter(m => m !== metric)
      .map(m => `<span class="tableau-note-left">${TABLEAU_METRICS[m]}: ${totals[m]}</span>`)
      .join("");

    return `
      <div class="tableau-cell">
        <div class="tableau-notes-stack">${notes}</div>
        <span class="tableau-main">${selectedValue}</span>
      </div>
    `;
  }

  function getTableauValue(row, metric) {
    return Number(row.tableau?.[metric]) || 0;
  }

  function getTableauSortRowValues(row) {
    const data = row.tableau || {};
    return {
      name: String(row.name || "").trim(),
      cs: Number(data.cs) || 0,
      sra: Number(data.sra) || 0,
      cap: Number(data.cap) || 0,
      ic: Number(data.ic) || 0
    };
  }

  function compareTableauLeaderboardRows(a, b, metric) {
    return compareTableauRankRows(
      getTableauSortRowValues(a),
      getTableauSortRowValues(b),
      metric
    );
  }
  
  function setInternalSort() {
    activeSortMode = "internal";
    renderLeaderboard();
  }
  
  function setPreviousYearSort() {
    activeSortMode = "previousYear";
    renderLeaderboard();
  }
  
  function setSelfGenSort() {
    activeSortMode = "selfGen";
    renderLeaderboard();
  }
  
  function setPreviousYearSelfGenSort() {
    activeSortMode = "previousYearSelfGen";
    renderLeaderboard();
  }
  
  function setNameSort() {
    activeSortMode = "name";
    renderLeaderboard();
  }
  
  function setCurrentContributionSort() {
    activeSortMode = "currentContribution";
    renderLeaderboard();
  }
  
  function setPreviousContributionSort() {
    activeSortMode = "previousContribution";
    renderLeaderboard();
  }
  
  function setYoyPercentSort() {
    activeSortMode = "yoyPercent";
    renderLeaderboard();
  }
  
  function setTableauSortAndRender() {
    if (activeSortMode !== "tableau") {
      activeSortMode = "tableau";
      renderLeaderboard();
    }
  }
  
  function buildInternalHeader(label) {
    if (!showTableau || !["ytd","mtd","wtd","lastWeek"].includes(activeDateMode)) return label;
  
    return `
      <button class="sort-header-button ${activeSortMode === "internal" ? "active-sort" : ""}" onclick="setInternalSort()">
        ${label}
      </button>
    `;
  }
  
  function buildTableauHeader() {
    const options = Object.entries(TABLEAU_METRICS)
      .map(([key, label]) => `
        <option value="${key}" ${activeTableauMetric === key ? "selected" : ""}>TAB ${label}</option>
      `)
      .join("");
  
    return `
      <div class="tableau-header-cell">
        <select class="tableau-select ${activeSortMode === "tableau" ? "active-sort" : ""}" onmousedown="setTableauSortAndRender()" onchange="setTableauMetric(this.value)">
          ${options}
        </select>
      </div>
    `;
  }
  
  function setTableauMetric(metric) {
    if (!TABLEAU_METRICS[metric]) return;
  
    activeTableauMetric = metric;
    activeSortMode = "tableau";
  
    rebuildTableauMap();
  
    renderLeaderboard();
  }
  
  function buildInternalPlaceholderCell() {
    return `<div class="cs-cell"><span class="cs-placeholder">—</span></div>`;
  }

  function buildInternalNaCell() {
    return `<div class="cs-cell"><span class="cs-placeholder">na</span></div>`;
  }

  function buildTableauCell(row, selectedMetric) {
    const data = row.tableau || {};
    const hasTableauData = Object.keys(TABLEAU_METRICS)
      .some(metric => data[metric] !== undefined && data[metric] !== "");
  
    if (!hasTableauData) {
      return `<div></div>`;
    }
  
    const selectedValue = data[selectedMetric] ?? "";
  
    const notes = Object.keys(TABLEAU_METRICS)
      .filter(metric => metric !== selectedMetric)
      .map(metric => {
        const value = data[metric];
        return `<span class="tableau-note-left">${TABLEAU_METRICS[metric]}: ${value ?? ""}</span>`;
      })
      .join("");
  
    return `
      <div class="tableau-cell">
        <div class="tableau-notes-stack">${notes}</div>
        <span class="tableau-main">${selectedValue}</span>
      </div>
    `;
  }
  
  function buildCsCell(row, showNotes) {
    if (row.isPlataOnly) {
      // Plata: show their Tableau SRA as the headline, with an "SRA" subscript so
      // it's clear it isn't internal CS.
      return `<div class="cs-cell"><div class="cs-notes-stack"><span class="cs-note-left">SRA</span></div><span class="cs-main">${plataHeadlineSra(row)}</span></div>`;
    }
    if (rowShowsCurrentNa(row)) return buildInternalNaCell();

    const leftNotes = [];

    const rawPct = useMomColumn() ? getMomPercent(row) : getYoyPercent(row);
    const comparisonPct = (isComparisonMode() && rawPct !== null) ? rawPct : null;

    if (showNotes) {
      const roleView = effectiveRoleView();
      if (roleView === "setters" || roleView === "selfgen") {
        // Setter / self-gen rows do not show Sets/SG subscripts.
      } else if (roleView === "experts") {
        if (row.selfGen > 0) {
          leftNotes.push(`<span class="cs-note-left">SG: ${row.selfGen}</span>`);
        }
        if (row.setOnly > 0) {
          leftNotes.push(`<span class="cs-note-left">Sets: ${row.setOnly}</span>`);
        }
      } else if (roleView === "general") {
        // General mixes setters and experts. Only experts (reps with at least
        // one close) show Sets/SG subscripts; pure setters get none.
        if (row.closes > 0 && row.selfGen > 0) {
          leftNotes.push(`<span class="cs-note-left">SG: ${row.selfGen}</span>`);
        }
        if (row.closes > 0 && row.setOnly > 0) {
          leftNotes.push(`<span class="cs-note-left">Sets: ${row.setOnly}</span>`);
        }
      } else {
        if (row.closes > 0 && row.selfGen > 0) {
          leftNotes.push(`<span class="cs-note-left">SG: ${row.selfGen}</span>`);
        }
        if (row.closes > 0 && row.setOnly > 0) {
          leftNotes.push(`<span class="cs-note-left">Sets: ${row.setOnly}</span>`);
        }
      }
    }
  
    const leftBase = leftNotes.length
      ? `<div class="cs-notes-stack">${leftNotes.join("")}</div>`
      : `<div class="cs-notes-stack"></div>`;
    const leftHtml = injectPctIntoStack(leftBase, comparisonPct);

    return `
      <div class="cs-cell">
        ${leftHtml}
        <span class="cs-main">${getRowDisplayCs(row)}</span>
      </div>
    `;
  }
  
  function buildPreviousYearCell(row) {
    if (row.isPlataOnly) return buildInternalPlaceholderCell();
    if (rowShowsPreviousNa(row)) return buildInternalNaCell();

    const notes = [];
    const previousSetOnly = getRowPreviousSetOnly(row);
    const previousSelfGen = getRowPreviousSelfGen(row);
    const previousCloses = getRowPreviousCloses(row);

    const roleView = effectiveRoleView();
    if (roleView === "setters" || roleView === "selfgen") {
      // Setter / self-gen rows do not show Sets/SG subscripts.
    } else if (roleView === "experts") {
      if (previousSelfGen > 0) {
        notes.push(`<span class="cs-note-left">SG: ${previousSelfGen}</span>`);
      }
      if (previousSetOnly > 0) {
        notes.push(`<span class="cs-note-left">Sets: ${previousSetOnly}</span>`);
      }
    } else if (roleView === "general") {
      // General mixes setters and experts. Only experts (reps with at least
      // one close) show Sets/SG subscripts; pure setters get none.
      if (previousCloses > 0 && previousSelfGen > 0) {
        notes.push(`<span class="cs-note-left">SG: ${previousSelfGen}</span>`);
      }
      if (previousCloses > 0 && previousSetOnly > 0) {
        notes.push(`<span class="cs-note-left">Sets: ${previousSetOnly}</span>`);
      }
    } else {
      if (previousCloses > 0 && previousSelfGen > 0) {
        notes.push(`<span class="cs-note-left">SG: ${previousSelfGen}</span>`);
      }
      if (previousCloses > 0 && previousSetOnly > 0) {
        notes.push(`<span class="cs-note-left">Sets: ${previousSetOnly}</span>`);
      }
    }

    const noteHtml = notes.length
      ? `<div class="cs-notes-stack">${notes.join("")}</div>`
      : `<div class="cs-notes-stack"></div>`;

    return `
      <div class="cs-cell">
        ${noteHtml}
        <span class="cs-main">${getRowPreviousCs(row)}</span>
      </div>
    `;
  }

  function buildPreviousYearSelfGenCell(row) {
    const previousSelfGen = getRowPreviousSelfGen(row);
    if (!previousSelfGen) {
      return `<div></div>`;
    }

    return `
      <div class="cs-cell">
        <span class="cs-main">${previousSelfGen}</span>
      </div>
    `;
  }

  function getYoyPercent(row) {
    const current = getRowContributionCredit(row);
    const previous = getRowPreviousContributionCredit(row);

    if (!previous) return null;
    if (current === 0) return null;

    return ((current - previous) / previous) * 100;
  }

  function getMomPercent(row) {
    const current = getRowContributionCredit(row);
    const previous = getRowPreviousContributionCredit(row);

    if (!previous) return null;
    if (current === 0) return null;

    return ((current - previous) / previous) * 100;
  }
    
  function renderLeaderboard() {
    updateTableauToggle();

    // Recompute the comparison ranges fresh each render (the Custom range used by
    // COC can change between renders), and rebuild the previous-period per-rep map
    // so the comparison columns match the live ranges.
    momDateRanges = null;
    if (useMomColumn()) rebuildPreviousMonthMap();

    const range = getDateRange(activeDateMode);
  
    const filteredDeals = allDeals.filter(deal =>
      dealInScope(deal) && dealInDateRange(deal, range)
    );

    const comparisonActive = useComparisonColumn();
    const repFilteredDeals = useMomColumn() ? getMomCurrentDeals() : filteredDeals;

    let rows = getRepMap(repFilteredDeals);
    const useTableauColumn = activeView !== "selfgen" &&
      (activeView !== "groups" || isGroupDrillDownView()) &&
      ["ytd","mtd","wtd","lastWeek"].includes(activeDateMode) && showTableau;
    const useTableauSort = useTableauColumn && activeSortMode === "tableau";
  
    if (activeView === "setters" || activeView === "experts") {
      // Filtered after old reps are added via rowMatchesActiveView.
    } else if (activeView === "selfgen") {
      rows = rows.filter(row => row.lifetimeCloses > 0 && row.selfGen > 0);
    } else {
      rows = rows.filter(row => row.lifetimeSets > 0 || row.lifetimeCloses > 0);
    }
    rows = addOldRepsToRows(rows);
    if (activeView === "selfgen" && isComparisonMode()) {
    rows = rows.filter(row => row.selfGen > 0 || getRowPreviousSelfGen(row) > 0);
    }
    if (isComparisonMode() && !includeNewReps) {
    rows = rows.filter(row =>
      getRowPreviousCs(row) > 0 ||
      getRowPreviousSetOnly(row) > 0 ||
      getRowPreviousSelfGen(row) > 0
    );
  }

    if (isComparisonMode() && !oldRepsActive()) {
    rows = rows.filter(row => {
      const currentContrib = row.sets + row.closes;
      const previousContrib = getRowPreviousSets(row) + getRowPreviousCloses(row);
      return !(currentContrib === 0 && previousContrib > 0);
    });
  }

    if (activeView === "setters" || activeView === "experts") {
      rows = rows.filter(rowMatchesActiveView);
    }

    if (shouldShowPlataRows(useTableauColumn)) {
      rows = addPlataRepsToRows(rows);
    }

    rows = addTableauRecruitingRepsToRows(rows);
    rows = addOrgTreeRepsToRows(rows);

    // Short date modes (everything but YTD): drop reps with no activity in the
    // period (no internal CS and no Tableau CS/SRA/CAP/IC) — including from the
    // Inactive toggle / Inactive drill. YTD still shows everyone. General + Groups
    // only; the Setters/Experts/SelfGen lenses keep their own filters.
    if (activeDateMode !== "ytd" && (activeView === "general" || activeView === "groups")) {
      rows = rows.filter(rowHasPeriodActivity);
    }

    rows.sort((a, b) => {
    if (activeSortMode === "bagels") return compareBagelRows(a, b);
    if (activeSortMode === "name") {
    return a.name.localeCompare(b.name);
    }
  
    if (activeSortMode === "selfGen") {
    if (b.selfGen !== a.selfGen) return b.selfGen - a.selfGen;
    if (b.cs !== a.cs) return b.cs - a.cs;
  }
  
  if (activeSortMode === "previousYearSelfGen") {
    if (getRowPreviousSelfGen(b) !== getRowPreviousSelfGen(a)) {
      return getRowPreviousSelfGen(b) - getRowPreviousSelfGen(a);
    }

    if (getRowPreviousCs(b) !== getRowPreviousCs(a)) {
      return getRowPreviousCs(b) - getRowPreviousCs(a);
    }
  }
  
    if (activeSortMode === "currentContribution") {
    // Plata interleaves by its SRA (getRowDisplayCs returns SRA for Plata).
    const aValue = rowShowsCurrentNa(a) ? -Infinity : getRowDisplayCs(a);
    const bValue = rowShowsCurrentNa(b) ? -Infinity : getRowDisplayCs(b);

    if (bValue !== aValue) return bValue - aValue;
    if (b.cs !== a.cs) return b.cs - a.cs;
  }
  
    if (activeSortMode === "previousContribution") {
    const aValue = (a.isPlataOnly || rowShowsPreviousNa(a)) ? -Infinity : getRowPreviousSets(a) + getRowPreviousCloses(a);
    const bValue = (b.isPlataOnly || rowShowsPreviousNa(b)) ? -Infinity : getRowPreviousSets(b) + getRowPreviousCloses(b);

    if (bValue !== aValue) return bValue - aValue;
    if (getRowPreviousCs(b) !== getRowPreviousCs(a)) return getRowPreviousCs(b) - getRowPreviousCs(a);
  }

    if (comparisonActive && activeSortMode === "yoyPercent") {
    const aPct = useMomColumn() ? getMomPercent(a) : getYoyPercent(a);
    const bPct = useMomColumn() ? getMomPercent(b) : getYoyPercent(b);

    const aValue = aPct === null ? -Infinity : aPct;
    const bValue = bPct === null ? -Infinity : bPct;

    if (bValue !== aValue) return bValue - aValue;
  }
    if (comparisonActive && activeSortMode === "previousYear") {
    const aPrev = activeView === "selfgen"
      ? getRowPreviousSelfGen(a)
      : (a.isPlataOnly || rowShowsPreviousNa(a) ? -Infinity : getRowPreviousCs(a));

    const bPrev = activeView === "selfgen"
      ? getRowPreviousSelfGen(b)
      : (b.isPlataOnly || rowShowsPreviousNa(b) ? -Infinity : getRowPreviousCs(b));

    const diff = bPrev - aPrev;
    if (diff !== 0) return diff;
  }
  
    if (useTableauSort) {
        const tableauDiff = compareTableauLeaderboardRows(a, b, activeTableauMetric);
        if (tableauDiff !== 0) return tableauDiff;
      }
  
      if (activeView === "selfgen") {
        if (b.selfGen !== a.selfGen) return b.selfGen - a.selfGen;
      } else {
        // (Plata is no longer forced to the bottom — it interleaves by SRA above.)
        if (rowShowsCurrentNa(b) && !rowShowsCurrentNa(a)) return -1;
        if (rowShowsCurrentNa(a) && !rowShowsCurrentNa(b)) return 1;
        if (b.cs !== a.cs) return b.cs - a.cs;
      }
  
      return a.name.localeCompare(b.name);
    });
  
    // Inactive split: `rows` stays the full set (totals + count include inactive
    // reps); `displayRows` is what we actually list. When the toggle is off,
    // inactive reps are collapsed into a single "Inactive Reps" summary row.
    const inactiveRows = rows.filter(isRowInactive);
    const displayRows = showInactive ? rows : rows.filter(r => !isRowInactive(r));

    const totalSelfGen = rows.reduce((sum, row) => sum + row.selfGen, 0);
    const totalTableauValue = getTableauTotal(rows, activeTableauMetric);

    const previousComparisonDeals = useMomColumn()
      ? getMomPreviousDeals()
      : previousYearDeals;
    const currentCreditTotals = getCreditTotalsFromDeals(
      useMomColumn() ? getMomCurrentDeals() : filteredDeals,
      rows,
      "current"
    );
    const previousYearCreditTotals = getCreditTotalsFromDeals(
      previousComparisonDeals,
      rows,
      "previous"
    );
   
    const title = useMomColumn() && activeView !== "groups"
      ? `${activeTitle || "Proven Leaderboard V2"} - ${getMomDateRanges().current.label} vs ${getMomDateRanges().previous.label}`
      : formatTitleWithOptionalDateRange(`${activeTitle || "Proven Leaderboard V2"} - ${range.label}`, range);

    updateLeaderboardMeta(filteredDeals.length);
  
    let headerHtml = "";
    const bodyRows = [];
    if (activeView === "groups") {
    const useGroupsComparison = useMomColumn() || (activeDateMode === "ytd" && showYoy);
    const groupContext = buildGroupContext();
    const { range: groupRange } = groupContext;
    const cols = gridCols(useGroupsComparison ? 2 : 1);
    const groupTitle = useMomColumn()
      ? `Groups - ${getMomDateRanges().current.label} vs ${getMomDateRanges().previous.label}`
      : formatTitleWithOptionalDateRange(`Groups - ${groupRange.label}`, groupRange);
    const showCurrentGroupTotalNotes = shouldShowCurrentTotalNotes();
    const showPreviousGroupTotalNotes = shouldShowPreviousTotalNotes();

    if (activeInactiveDrill) {
      // Whole-team inactive drill uses the General roster (incl. tableau-recruiting
      // reps) so its count matches the General view. A group-scoped drill uses the
      // plain rows so its count matches that leader's drill-down inactive row.
      const inactiveDrillDownline = inactiveDrillLeader
        ? buildDownlineSetFromRows(recruitingRows, inactiveDrillLeader)
        : null;
      let drillRows = inactiveDrillDownline
        ? rows.filter(isRowInactive)
        : getInactiveDisplayRows(rows);
      // Plata reps show only in the whole-team Inactive drill, on a real Tableau
      // period (not Today/Custom) and not while a comparison (YOY/MOM/COC) is active.
      if (!inactiveDrillLeader && !isComparisonMode() &&
          ["ytd", "mtd", "wtd", "lastWeek"].includes(activeDateMode)) {
        drillRows = addInactivePlataRows(drillRows);
      }
      if (groupsRepType !== "general") drillRows = drillRows.filter(rowMatchesActiveView);
      if (inactiveDrillDownline) {
        const leaderN = normalizeName(inactiveDrillLeader);
        drillRows = drillRows.filter(r => {
          const n = normalizeName(r.name);
          return inactiveDrillDownline.has(n) && n !== leaderN;
        });
      }

      // Mexico skin: inactive drill follows the same rules as other Mexico views
      // (SRA/CAP columns, qualifying-% / name sort) — not the CS comparison skin.
      if (mexicoOn) {
        const mcols = gridCols(2);
        const mexInactive = drillRows.slice().sort(mexicoSortComparator());
        const mexHeader = `
        <div class="leaderboard-header-row" style="grid-template-columns:${mcols};">
          <div>${buildRankHeaderCell()}</div>
          <div>${buildMexicoRepHeaderCell("Name")}</div>
          <div class="mexico-col-head">SRA</div>
          <div class="mexico-col-head">CAP</div>
        </div>`;
        bodyRows.push(`
        <div class="leaderboard-row total-row" style="grid-template-columns:${mcols};">
          <div>${buildViewRepCountCell(drillRows.length)}</div>
          <div>${getTotalRowLabel()}</div><div></div><div></div>
        </div>`);
        mexInactive.forEach((row, index) => {
          const t = mexicoTableau(normalizeName(row.name));
          const rowClass = index % 2 === 0 ? "odd-row" : "even-row";
          bodyRows.push(`
        <div class="leaderboard-row ${rowClass}" style="grid-template-columns:${mcols};">
          <div>${index + 1}</div>
          <div>${buildRepNameCell(row.name, row)}</div>
          <div class="cs-cell"><span class="cs-main">${t.sra}</span></div>
          <div class="cs-cell"><span class="cs-main">${t.cap}</span></div>
        </div>`);
        });
        document.querySelector(".leaderboard-grid").innerHTML = `
        <div class="leaderboard-column tableau-on">
          ${buildLeaderboardTitleHtml(`${inactiveDrillLeader ? inactiveDrillLeader + " Group · " : ""}Inactive Reps`)}
          ${mexHeader}
          <div class="leaderboard-body">${bodyRows.join("")}</div>
        </div>`;
        finishLeaderboardRender();
        return;
      }

      const drillUseTableau = useTableauColumn;
      const drillCols = gridCols(
        drillUseTableau && useGroupsComparison ? 3
        : drillUseTableau ? 2
        : useGroupsComparison ? 2
        : 1
      );

      drillRows.sort((a, b) => {
        if (activeSortMode === "bagels") return compareBagelRows(a, b);
        if (activeSortMode === "name") return a.name.localeCompare(b.name);
        if (activeSortMode === "previousContribution") {
          const aPrev = getRowPreviousSets(a) + getRowPreviousCloses(a);
          const bPrev = getRowPreviousSets(b) + getRowPreviousCloses(b);
          if (bPrev !== aPrev) return bPrev - aPrev;
          return a.name.localeCompare(b.name);
        }
        if (useGroupsComparison && activeSortMode === "yoyPercent") {
          const aPct = useMomColumn() ? getMomPercent(a) : getYoyPercent(a);
          const bPct = useMomColumn() ? getMomPercent(b) : getYoyPercent(b);
          const aValue = aPct === null ? -Infinity : aPct;
          const bValue = bPct === null ? -Infinity : bPct;
          if (bValue !== aValue) return bValue - aValue;
        }
        if (drillUseTableau && activeSortMode === "tableau") {
          const tableauDiff = compareTableauLeaderboardRows(a, b, activeTableauMetric);
          if (tableauDiff !== 0) return tableauDiff;
        }
        const aValue = getRowDisplayCs(a);
        const bValue = getRowDisplayCs(b);
        if (bValue !== aValue) return bValue - aValue;
        if (b.cs !== a.cs) return b.cs - a.cs;
        return a.name.localeCompare(b.name);
      });

      const drillHeaderHtml = `
      <div class="leaderboard-header-row" style="grid-template-columns:${drillCols};">
        <div>${buildRankHeaderCell()}</div>
        <div>
    <button
      class="sort-header-button ${activeSortMode === "name" ? "active-sort" : ""}"
      onclick="setNameSort()">
      Name
    </button>
  </div>
        <div style="display:flex;gap:4px;justify-content:center;">
    ${useGroupsComparison ? `
      <button class="sort-header-button ${activeSortMode === "yoyPercent" ? "active-sort" : ""}" onclick="setYoyPercentSort()">
        %
      </button>
    ` : ""}
    <button
      class="sort-header-button ${activeSortMode === "currentContribution" ? "active-sort" : ""}"
      onclick="setCurrentContributionSort()">
      ${useGroupsComparison ? getCurrentComparisonLabel("CS") : (groupsRepType !== "general" ? groupMetricLabel() : "CS")}
    </button>
  </div>
        ${useGroupsComparison ? `
    <div>
      <button class="sort-header-button ${activeSortMode === "previousContribution" ? "active-sort" : ""}" onclick="setPreviousContributionSort()">
        ${getPreviousComparisonLabel("CS")}
      </button>
    </div>
  ` : ""}
  ${drillUseTableau ? buildTableauHeader() : ""}
      </div>
    `;

      let inactiveNames = getInactiveSet();
      if (inactiveDrillDownline) {
        const leaderN = normalizeName(inactiveDrillLeader);
        inactiveNames = new Set([...inactiveNames].filter(n => inactiveDrillDownline.has(n) && n !== leaderN));
      }
      const inCurrent = groupContext.computeGroupStats(
        groupContext.filterDownlineForYear(inactiveNames, "2026", groupContext.useComparison),
        groupContext.currentPeriodDeals, "current"
      );
      const inPrevious = groupContext.computeGroupStats(
        groupContext.filterDownlineForYear(inactiveNames, "2025", groupContext.useComparison),
        groupContext.previousPeriodDeals, "previous"
      );

      bodyRows.push(`
      <div class="leaderboard-row total-row" style="grid-template-columns:${drillCols};">
        <div>${buildViewRepCountCell(drillRows.length)}</div>
        <div>${getTotalRowLabel()}</div>
        <div>${buildGroupTotalCell(makeGroupStatRow(inCurrent, inPrevious), useGroupsComparison, true)}</div>
        ${useGroupsComparison ? `<div>${buildGroupPreviousTotalCell(makeGroupStatRow(inCurrent, inPrevious), true)}</div>` : ""}
        ${drillUseTableau ? `<div></div>` : ""}
      </div>
    `);

      drillRows.forEach((row, index) => {
        const rowClass = index % 2 === 0 ? "odd-row" : "even-row";
        bodyRows.push(`
        <div class="leaderboard-row ${rowClass}${bagelRowClass(row)}" style="grid-template-columns:${drillCols};">
          <div>${index + 1}</div>
          <div>${buildRepNameCell(row.name, row)}</div>
          <div>${buildCsCell(row, true)}</div>
          ${useGroupsComparison ? buildPreviousYearCell(row) : ""}
          ${drillUseTableau ? buildTableauCell(row, activeTableauMetric) : ""}
        </div>
      `);
      });

      document.querySelector(".leaderboard-grid").innerHTML = `
      <div class="leaderboard-column ${drillUseTableau ? "tableau-on" : ""}">
        ${buildLeaderboardTitleHtml(`${inactiveDrillLeader ? inactiveDrillLeader + " Group · " : ""}Inactive Reps - ${groupTitle.replace(/^Groups - /, "")}`)}
        ${drillHeaderHtml}
        <div class="leaderboard-body">
          ${bodyRows.join("")}
        </div>
      </div>
    `;

      finishLeaderboardRender();
      return;
    }

    if (activeGroupDrillLeader) {
      const leaderDownline = buildDownlineSetFromRows(recruitingRows, activeGroupDrillLeader);
      if (!leaderDownline.size) {
        activeGroupDrillLeader = null;
        updateGroupDrillNav();
      } else {
        const visibleNames = getGroupDrillVisibleNames(activeGroupDrillLeader, groupContext);
        let drillRows = rows.filter(row => visibleNames.has(normalizeName(row.name)));
        const drillUseTableau = useTableauColumn;
        const drillCols = gridCols(
          drillUseTableau && useGroupsComparison ? 3
          : drillUseTableau ? 2
          : useGroupsComparison ? 2
          : 1
        );

        const leaderNorm = normalizeName(activeGroupDrillLeader);
        if (!drillRows.some(row => normalizeName(row.name) === leaderNorm)) {
          drillRows.push(buildEmptyInternalRow(activeGroupDrillLeader, tableauMap.get(leaderNorm)));
          drillRows.sort((a, b) => {
            if (activeSortMode === "bagels") return compareBagelRows(a, b);
            if (activeSortMode === "name") return a.name.localeCompare(b.name);

            if (activeSortMode === "previousContribution") {
              const aPrev = getRowPreviousSets(a) + getRowPreviousCloses(a);
              const bPrev = getRowPreviousSets(b) + getRowPreviousCloses(b);
              if (bPrev !== aPrev) return bPrev - aPrev;
              return a.name.localeCompare(b.name);
            }

            if (useGroupsComparison && activeSortMode === "yoyPercent") {
              const aPct = useMomColumn() ? getMomPercent(a) : getYoyPercent(a);
              const bPct = useMomColumn() ? getMomPercent(b) : getYoyPercent(b);
              const aValue = aPct === null ? -Infinity : aPct;
              const bValue = bPct === null ? -Infinity : bPct;
              if (bValue !== aValue) return bValue - aValue;
            }

            if (drillUseTableau && activeSortMode === "tableau") {
              const tableauDiff = compareTableauLeaderboardRows(a, b, activeTableauMetric);
              if (tableauDiff !== 0) return tableauDiff;
            }

            const aValue = getRowDisplayCs(a);
            const bValue = getRowDisplayCs(b);
            if (bValue !== aValue) return bValue - aValue;
            if (b.cs !== a.cs) return b.cs - a.cs;
            return a.name.localeCompare(b.name);
          });
        }

        const drillHeaderHtml = `
      <div class="leaderboard-header-row" style="grid-template-columns:${drillCols};">
        <div>${buildRankHeaderCell()}</div>
        <div>${buildDrillNameHeaderCell()}</div>
        <div style="display:flex;gap:4px;justify-content:center;">
    ${useGroupsComparison ? `
      <button class="sort-header-button ${activeSortMode === "yoyPercent" ? "active-sort" : ""}" onclick="setYoyPercentSort()">
        %
      </button>
    ` : ""}
    <button
      class="sort-header-button ${activeSortMode === "currentContribution" ? "active-sort" : ""}"
      onclick="setCurrentContributionSort()">
      ${useGroupsComparison ? getCurrentComparisonLabel("CS") : (groupsRepType !== "general" ? groupMetricLabel() : "CS")}
    </button>
  </div>
        ${useGroupsComparison ? `
    <div>
      <button class="sort-header-button ${activeSortMode === "previousContribution" ? "active-sort" : ""}" onclick="setPreviousContributionSort()">
        ${getPreviousComparisonLabel("CS")}
      </button>
    </div>
  ` : ""}
  ${drillUseTableau ? buildTableauHeader() : ""}
      </div>
    `;

        const { current: drillCurrent, previous: drillPrevious } = getGroupLeaderStats(
          activeGroupDrillLeader,
          groupContext
        );

        // Apply the rep-type lens (Setters/Experts/SelfGen) to drill membership:
        // only reps matching the lens appear (an empty leader row never matches).
        if (groupsRepType !== "general") {
          drillRows = drillRows.filter(rowMatchesActiveView);
        }

        // Hide inactive reps in this leader's group unless the toggle is on, but
        // always keep the leader visible in their own drill-down.
        const drillInactive = drillRows.filter(r => isRowInactive(r) && normalizeName(r.name) !== leaderNorm);
        const drillDisplay = showInactive ? drillRows : drillRows.filter(r => !drillInactive.includes(r));

        // Mexico skin inside the group drill: install goals + SRA/CAP, ranked by
        // qualifying-proximity (same as the main Mexico views).
        if (mexicoOn) {
          const mcols = gridCols(2);
          const mexDrill = drillDisplay.slice().sort(mexicoSortComparator());
          const mexHeader = `
        <div class="leaderboard-header-row" style="grid-template-columns:${mcols};">
          <div>${buildRankHeaderCell()}</div>
          <div>${buildMexicoRepHeaderCell("Name")}</div>
          <div class="mexico-col-head">SRA</div>
          <div class="mexico-col-head">CAP</div>
        </div>`;
          // No SRA/CAP totals here — summing Tableau values isn't accurate.
          bodyRows.push(`
        <div class="leaderboard-row total-row" style="grid-template-columns:${mcols};">
          <div>${buildViewRepCountCell(drillDisplay.length)}</div>
          <div>${getTotalRowLabel()}</div>
          <div></div>
          <div></div>
        </div>`);
          mexDrill.forEach((row, index) => {
            const t = mexicoTableau(normalizeName(row.name));
            const rowClass = index % 2 === 0 ? "odd-row" : "even-row";
            bodyRows.push(`
        <div class="leaderboard-row ${rowClass}" style="grid-template-columns:${mcols};">
          <div>${index + 1}</div>
          <div>${buildRepNameCell(row.name, row)}</div>
          <div class="cs-cell"><span class="cs-main">${t.sra}</span></div>
          <div class="cs-cell"><span class="cs-main">${t.cap}</span></div>
        </div>`);
          });
          if (!showInactive && drillInactive.length) {
            const inSra = drillInactive.reduce((s, r) => s + mexicoTableau(normalizeName(r.name)).sra, 0);
            const inCap = drillInactive.reduce((s, r) => s + mexicoTableau(normalizeName(r.name)).cap, 0);
            bodyRows.push(`
        <div class="leaderboard-row inactive-summary-row" style="grid-template-columns:${mcols};">
          <div>${buildViewRepCountCell(drillInactive.length)}</div>
          <div>${buildInactiveNameCell(activeGroupDrillLeader)}</div>
          <div class="cs-cell"><span class="cs-main">${inSra}</span></div>
          <div class="cs-cell"><span class="cs-main">${inCap}</span></div>
        </div>`);
          }
          document.querySelector(".leaderboard-grid").innerHTML = `
        <div class="leaderboard-column tableau-on">
          ${buildLeaderboardTitleHtml(activeGroupDrillLeader + " Group")}
          ${mexHeader}
          <div class="leaderboard-body">${bodyRows.join("")}</div>
        </div>`;
          finishLeaderboardRender();
          return;
        }

        bodyRows.push(`
      <div class="leaderboard-row total-row" style="grid-template-columns:${drillCols};">
        <div>${buildViewRepCountCell(drillDisplay.length)}</div>
        <div>${getTotalRowLabel()}</div>
        <div>${buildGroupTotalCell(makeGroupStatRow(drillCurrent, drillPrevious), useGroupsComparison, true)}</div>
        ${useGroupsComparison ? `<div>${buildGroupPreviousTotalCell(makeGroupStatRow(drillCurrent, drillPrevious), true)}</div>` : ""}
        ${drillUseTableau ? `<div>${getTableauTotal(drillRows, activeTableauMetric)}</div>` : ""}
      </div>
    `);

        drillDisplay.forEach((row, index) => {
          const rowClass = index % 2 === 0 ? "odd-row" : "even-row";
          bodyRows.push(`
        <div class="leaderboard-row ${rowClass}${bagelRowClass(row)}" style="grid-template-columns:${drillCols};">
          <div>${index + 1}</div>
          <div>${buildRepNameCell(row.name, row)}</div>
          <div>${buildCsCell(row, true)}</div>
          ${useGroupsComparison ? buildPreviousYearCell(row) : ""}
          ${drillUseTableau ? buildTableauCell(row, activeTableauMetric) : ""}
        </div>
      `);
        });

        if (!showInactive && drillInactive.length) {
          const inNames = new Set(drillInactive.map(r => normalizeName(r.name)));
          const inCur = groupContext.computeGroupStats(
            groupContext.filterDownlineForYear(inNames, "2026", groupContext.useComparison),
            groupContext.currentPeriodDeals, "current"
          );
          const inPrev = groupContext.computeGroupStats(
            groupContext.filterDownlineForYear(inNames, "2025", groupContext.useComparison),
            groupContext.previousPeriodDeals, "previous"
          );
          bodyRows.push(`
        <div class="leaderboard-row inactive-summary-row" style="grid-template-columns:${drillCols};">
          <div>${buildViewRepCountCell(drillInactive.length)}</div>
          <div>${buildInactiveNameCell(activeGroupDrillLeader)}</div>
          <div>${buildGroupTotalCell(makeGroupStatRow(inCur, inPrev), useGroupsComparison, false)}</div>
          ${useGroupsComparison ? `<div>${buildGroupPreviousTotalCell(makeGroupStatRow(inCur, inPrev), false)}</div>` : ""}
          ${drillUseTableau ? `<div></div>` : ""}
        </div>
      `);
        }

        document.querySelector(".leaderboard-grid").innerHTML = `
      <div class="leaderboard-column ${drillUseTableau ? "tableau-on" : ""}">
        ${buildLeaderboardTitleHtml(`${activeGroupDrillLeader} Group - ${groupTitle.replace(/^Groups - /, "")}`)}
        ${drillHeaderHtml}
        <div class="leaderboard-body">
          ${bodyRows.join("")}
        </div>
      </div>
    `;

        finishLeaderboardRender();
        return;
      }
    }

    const { groupRows, totalStats } = getGroupRows();

    groupRows.sort((a, b) => {
      if (activeSortMode === "name") {
        return a.name.localeCompare(b.name);
      }

      if (activeSortMode === "previousContribution") {
        const aPrev = groupRowPrevValue(a), bPrev = groupRowPrevValue(b);
        if (bPrev !== aPrev) return bPrev - aPrev;
        if (b.previousSets !== a.previousSets) return b.previousSets - a.previousSets;
        return a.name.localeCompare(b.name);
      }

      if (useGroupsComparison && activeSortMode === "yoyPercent") {
        const aPct = getGroupYoyPercent(a);
        const bPct = getGroupYoyPercent(b);
        const aValue = aPct === null ? -Infinity : aPct;
        const bValue = bPct === null ? -Infinity : bPct;

        if (bValue !== aValue) return bValue - aValue;
      }

      const aVal = groupRowValue(a), bVal = groupRowValue(b);
      if (bVal !== aVal) return bVal - aVal;
      if (b.sets !== a.sets) return b.sets - a.sets;
      return a.name.localeCompare(b.name);
    });

    // Mexico groups list shows ONLY the qualified/halfway counts — no group value
    // columns. Use a simple 2-column (rank + group) grid.
    const listCols = mexicoOn ? "minmax(0,0.45fr) minmax(0,5fr)" : cols;

    const headerHtml = mexicoOn ? `
      <div class="leaderboard-header-row" style="grid-template-columns:${listCols};">
        <div>${buildRankHeaderCell()}</div>
        <div>${buildGroupHeaderCell()}</div>
      </div>
    ` : `
      <div class="leaderboard-header-row" style="grid-template-columns:${cols};">
        <div>${buildRankHeaderCell()}</div>
        <div>${buildGroupHeaderCell()}</div>
        <div style="display:flex;gap:4px;justify-content:center;">
    ${useGroupsComparison ? `
      <button class="sort-header-button ${activeSortMode === "yoyPercent" ? "active-sort" : ""}" onclick="setYoyPercentSort()">
        %
      </button>
    ` : ""}
    <button
      class="sort-header-button ${activeSortMode === "currentContribution" ? "active-sort" : ""}"
      onclick="setCurrentContributionSort()">
      ${useGroupsComparison ? getCurrentComparisonLabel("Total") : groupMetricLabel()}
    </button>
  </div>
        ${useGroupsComparison ? `
    <div>
      <button class="sort-header-button ${activeSortMode === "previousContribution" ? "active-sort" : ""}" onclick="setPreviousContributionSort()">
        ${getPreviousComparisonLabel("Total")}
      </button>
    </div>
  ` : ""}
      </div>
    `;

    bodyRows.push(mexicoOn ? `
      <div class="leaderboard-row total-row" style="grid-template-columns:${listCols};">
        <div>${buildViewRepCountCell(groupRows.length, "Groups")}</div>
        <div>${getTotalRowLabel()}</div>
      </div>
    ` : `
      <div class="leaderboard-row total-row" style="grid-template-columns:${cols};">
        <div>${buildViewRepCountCell(groupRows.length, "Groups")}</div>
        <div>${getTotalRowLabel()}</div>
        <div>${buildGroupTotalCell(makeGroupStatRow(totalStats.current, totalStats.previous), useGroupsComparison, showCurrentGroupTotalNotes)}</div>
        ${useGroupsComparison ? `<div>${buildGroupPreviousTotalCell(makeGroupStatRow(totalStats.current, totalStats.previous), showPreviousGroupTotalNotes)}</div>` : ""}
      </div>
    `);

    // Yellow/red rep sets (same logic as the rep rows) for the per-group bagel
    // counts, computed once from the active rows.
    const bagelYellowSet = new Set(), bagelRedSet = new Set();
    if (bagelsOn) {
      rows.forEach(r => {
        const b = getRowBagels(r);
        if (!b || b.count <= 0) return;
        const n = normalizeName(r.name);
        if (b.twoWeeks) bagelRedSet.add(n);
        else if (b.lastWeek) bagelYellowSet.add(n);
      });
    }
    // Mexico qualified / halfway sets (from the active rows), for the per-group badge.
    const mexQualSet = new Set(), mexHalfSet = new Set();
    if (mexicoOn) {
      rows.forEach(r => {
        const n = normalizeName(r.name);
        const p = mexicoProgress(n);
        if (p >= 1) mexQualSet.add(n);
        else if (p >= 0.5) mexHalfSet.add(n);
      });
    }

    groupRows.forEach((row, index) => {
      const rowClass = index % 2 === 0 ? "odd-row" : "even-row";
      const nameCell = buildGroupNameCell(row.name);
      const groupBagels = mexicoOn
        ? buildGroupMexicoBadge(row.downline, mexQualSet, mexHalfSet)
        : buildGroupBagelBadge(row.downline, bagelYellowSet, bagelRedSet);
      bodyRows.push(mexicoOn ? `
        <div class="leaderboard-row ${rowClass}" style="grid-template-columns:${listCols};">
          <div>${index + 1}</div>
          <div><div class="group-name-col">${nameCell}${groupBagels}</div></div>
        </div>
      ` : `
        <div class="leaderboard-row ${rowClass}" style="grid-template-columns:${cols};">
          <div>${index + 1}</div>
          <div><div class="group-name-col">${nameCell}${groupBagels}</div></div>
          <div>${buildGroupTotalCell(row, useGroupsComparison)}</div>
          ${useGroupsComparison ? `<div>${buildGroupPreviousTotalCell(row)}</div>` : ""}
        </div>
      `);
    });

    // "Inactive Reps" pseudo-group row at the bottom: clicks through to the
    // inactive reps drill-down. Not numbered, not counted in the group count.
    // Count reflects the reps the drill will actually list (those with a row),
    // so the "N Reps" label matches the drill-down's rep count.
    const inactiveNamesForGroup = getInactiveSet();
    const inactiveDisplayCount = getInactiveDisplayRows(rows).length;
    if (inactiveNamesForGroup.size) {
      const inGroupCur = groupContext.computeGroupStats(
        groupContext.filterDownlineForYear(inactiveNamesForGroup, "2026", groupContext.useComparison),
        groupContext.currentPeriodDeals, "current"
      );
      const inGroupPrev = groupContext.computeGroupStats(
        groupContext.filterDownlineForYear(inactiveNamesForGroup, "2025", groupContext.useComparison),
        groupContext.previousPeriodDeals, "previous"
      );
      const inGroupRow = makeGroupStatRow(inGroupCur, inGroupPrev);
      inGroupRow.name = "Inactive Reps";
      bodyRows.push(mexicoOn ? `
        <div class="leaderboard-row inactive-summary-row" style="grid-template-columns:${listCols};">
          <div>${buildViewRepCountCell(inactiveDisplayCount)}</div>
          <div>${buildInactiveNameCell()}</div>
        </div>
      ` : `
        <div class="leaderboard-row inactive-summary-row" style="grid-template-columns:${cols};">
          <div>${buildViewRepCountCell(inactiveDisplayCount)}</div>
          <div>${buildInactiveNameCell()}</div>
          <div>${buildGroupTotalCell(inGroupRow, useGroupsComparison)}</div>
          ${useGroupsComparison ? `<div>${buildGroupPreviousTotalCell(inGroupRow)}</div>` : ""}
        </div>
      `);
    }

    document.querySelector(".leaderboard-grid").innerHTML = `
      <div class="leaderboard-column">
        ${buildLeaderboardTitleHtml(groupTitle)}
        ${headerHtml}
        <div class="leaderboard-body">
          ${bodyRows.join("")}
        </div>
      </div>
    `;

    finishLeaderboardRender();
    return;
  }

    // ---- Mexico incentive-trip skin (rep views only; Groups handled above) ----
    if (mexicoOn) {
      const mcols = gridCols(2); // Rank | Rep(install goal) | SRA | CAP
      const mexRows = displayRows.slice().sort(mexicoSortComparator());

      headerHtml = `
        <div class="leaderboard-header-row" style="grid-template-columns:${mcols};">
          <div>${buildRankHeaderCell()}</div>
          <div>${buildMexicoRepHeaderCell("Rep")}</div>
          <div class="mexico-col-head">SRA</div>
          <div class="mexico-col-head">CAP</div>
        </div>`;

      // SRA/CAP office totals only make sense on General/Experts (where the office
      // numbers line up); blank them on Setters/SelfGen.
      const mexShowTotals = activeView === "general" || activeView === "experts";
      bodyRows.push(`
        <div class="leaderboard-row total-row" style="grid-template-columns:${mcols};">
          <div>${buildViewRepCountCell(displayRows.length)}</div>
          <div>${getTotalRowLabel()}</div>
          <div>${mexShowTotals ? getTableauTotal(rows, "sra") : ""}</div>
          <div>${mexShowTotals ? getTableauTotal(rows, "cap") : ""}</div>
        </div>`);

      mexRows.forEach((row, index) => {
        const t = mexicoTableau(normalizeName(row.name));
        const rowClass = index % 2 === 0 ? "odd-row" : "even-row";
        bodyRows.push(`
          <div class="leaderboard-row ${rowClass}" style="grid-template-columns:${mcols};">
            <div>${index + 1}</div>
            <div>${buildRepNameCell(row.name, row)}</div>
            <div class="cs-cell"><span class="cs-main">${t.sra}</span></div>
            <div class="cs-cell"><span class="cs-main">${t.cap}</span></div>
          </div>`);
      });

      if (!showInactive && inactiveRows.length) {
        const sraSum = inactiveRows.reduce((s, r) => s + mexicoTableau(normalizeName(r.name)).sra, 0);
        const capSum = inactiveRows.reduce((s, r) => s + mexicoTableau(normalizeName(r.name)).cap, 0);
        bodyRows.push(`
          <div class="leaderboard-row inactive-summary-row" style="grid-template-columns:${mcols};">
            <div>${buildViewRepCountCell(inactiveRows.length)}</div>
            <div>${buildInactiveNameCell()}</div>
            <div class="cs-cell"><span class="cs-main">${sraSum}</span></div>
            <div class="cs-cell"><span class="cs-main">${capSum}</span></div>
          </div>`);
      }

      document.querySelector(".leaderboard-grid").innerHTML = `
        <div class="leaderboard-column tableau-on">
          ${buildLeaderboardTitleHtml(title)}
          ${headerHtml}
          <div class="leaderboard-body">${bodyRows.join("")}</div>
        </div>`;
      finishLeaderboardRender();
      return;
    }

    if (activeView === "selfgen") {
      const cols = gridCols(comparisonActive ? 2 : 1);

      headerHtml = `
        <div class="leaderboard-header-row" style="grid-template-columns:${cols};">
          <div>${buildRankHeaderCell()}</div>
          <div>${buildRepHeaderCell()}</div>
          <div>
    <button
    class="sort-header-button ${activeSortMode === "selfGen" ? "active-sort" : ""}"
    onclick="setSelfGenSort()">
    ${comparisonActive ? getCurrentComparisonLabel("SG") : "SG"}
  </button>
  </div>
          ${comparisonActive ? `
    <div>
      <button class="sort-header-button ${activeSortMode === "previousYearSelfGen" ? "active-sort" : ""}" onclick="setPreviousYearSelfGenSort()">
    ${getPreviousComparisonLabel("SG")}
  </button>
    </div>
  ` : ""}
        </div>
      `;

      const totalPreviousSelfGen = rows.reduce((sum, row) => sum + getRowPreviousSelfGen(row), 0);
      const selfGenTotalComparisonPct = comparisonActive
        ? getComparisonPercent(totalSelfGen, totalPreviousSelfGen)
        : null;

      bodyRows.push(`
        <div class="leaderboard-row total-row" style="grid-template-columns:${cols};">
          <div>${buildViewRepCountCell(displayRows.length)}</div>
          <div>${getTotalRowLabel()}</div>
          <div>${buildUniqueTotalCell(totalSelfGen, selfGenTotalComparisonPct)}</div>
          ${comparisonActive ? `
    <div class="cs-cell">
      <span class="cs-main">${totalPreviousSelfGen}</span>
    </div>
  ` : ""}
        </div>
      `);

      displayRows.forEach((row, index) => {
        const rowClass = index % 2 === 0 ? "odd-row" : "even-row";
        bodyRows.push(`
          <div class="leaderboard-row ${rowClass}${bagelRowClass(row)}" style="grid-template-columns:${cols};">
            <div>${index + 1}</div>
            <div>${buildRepNameCell(row.name, row)}</div>
            <div class="cs-cell">
    <span class="cs-main">${row.selfGen}</span>
  </div>
            ${comparisonActive ? buildPreviousYearSelfGenCell(row) : ""}
          </div>
        `);
      });
      if (!showInactive && inactiveRows.length) {
        const inSg = inactiveRows.reduce((s, r) => s + (r.selfGen || 0), 0);
        const inPrevSg = inactiveRows.reduce((s, r) => s + getRowPreviousSelfGen(r), 0);
        bodyRows.push(`
          <div class="leaderboard-row inactive-summary-row" style="grid-template-columns:${cols};">
            <div>${buildViewRepCountCell(inactiveRows.length)}</div>
            <div>${buildInactiveNameCell()}</div>
            <div class="cs-cell"><span class="cs-main">${inSg}</span></div>
            ${comparisonActive ? `<div class="cs-cell"><span class="cs-main">${inPrevSg}</span></div>` : ""}
          </div>
        `);
      }
    } else {
      const cols = gridCols(useTableauColumn && comparisonActive ? 3 : useTableauColumn ? 2 : comparisonActive ? 2 : 1);

      headerHtml = `
        <div class="leaderboard-header-row" style="grid-template-columns:${cols};">
          <div>${buildRankHeaderCell()}</div>
          <div>${buildRepHeaderCell()}</div>
          <div style="display:flex;gap:4px;justify-content:center;">
    ${comparisonActive ? `
      <button class="sort-header-button ${activeSortMode === "yoyPercent" ? "active-sort" : ""}" onclick="setYoyPercentSort()">
        %
      </button>
    ` : ""}
    <button
      class="sort-header-button ${activeSortMode === "currentContribution" ? "active-sort" : ""}"
      onclick="setCurrentContributionSort()">
      ${comparisonActive ? getCurrentComparisonLabel("CS") : "CS"}
    </button>

  </div>
          ${comparisonActive ? `
    <div>
      <button class="sort-header-button ${activeSortMode === "previousContribution" ? "active-sort" : ""}" onclick="setPreviousContributionSort()">
        ${getPreviousComparisonLabel("CS")}
      </button>
    </div>
  ` : ""}

  ${useTableauColumn ? buildTableauHeader() : ""}
        </div>
      `;

      const currentTotalValue = (currentCreditTotals.sets + currentCreditTotals.cs) / 2;
      const previousTotalValue = comparisonActive
        ? (previousYearCreditTotals.sets + previousYearCreditTotals.cs) / 2
        : 0;
      const totalComparisonPct = comparisonActive
        ? getComparisonPercent(currentTotalValue, previousTotalValue)
        : null;
      const useUniqueCsTotals = activeView === "setters" || activeView === "experts";
      const currentUniqueDeals = useMomColumn() ? getMomCurrentDeals() : filteredDeals;
      const totalUniqueCs = activeView === "experts"
        ? getUniqueRoleDealTotal(currentUniqueDeals, rows, "expert")
        : activeView === "setters"
        ? getUniqueRoleDealTotal(currentUniqueDeals, rows, "setter")
        : sumVisibleUniqueCs(rows, row => row.cs);
      const totalPreviousUniqueCs = activeView === "experts"
        ? getUniqueRoleDealTotal(previousComparisonDeals, rows, "expert", "previous")
        : activeView === "setters"
        ? getUniqueRoleDealTotal(previousComparisonDeals, rows, "setter", "previous")
        : sumVisibleUniqueCs(rows, row => getRowPreviousCs(row), true);
      const expertTotalNotes = buildCurrentTotalNotesForView(rows);
      const expertPreviousTotalNotes = buildPreviousTotalNotesForView(rows);
      const uniqueTotalComparisonPct = comparisonActive
        ? getComparisonPercent(totalUniqueCs, totalPreviousUniqueCs)
        : null;
      // Only Plata selected -> the internal total is just 0s; show nothing (no number,
      // no "Excl. Plata" note). Otherwise show "Excl. Plata" when Plata SRAs are on the
      // board (Plata rows present with an SRA) — they're left out of this total.
      const onlyPlataTotal = isOnlyPlataOfficeSelected();
      const showExclPlata = !onlyPlataTotal && rows.some(r => r.isPlataOnly && getRowDisplayCs(r) > 0);

      bodyRows.push(`
        <div class="leaderboard-row total-row" style="grid-template-columns:${cols};">
          <div>${buildViewRepCountCell(displayRows.length)}</div>
          <div>${getTotalRowLabel()}</div>
         <div>${useUniqueCsTotals
          ? buildUniqueTotalCell(
            onlyPlataTotal ? "" : totalUniqueCs,
            uniqueTotalComparisonPct,
            expertTotalNotes,
            showExclPlata
          )
          : buildUniqueTotalCell(
            onlyPlataTotal ? "" : currentTotalValue,
            totalComparisonPct,
            buildCurrentTotalNotesForView(rows, currentCreditTotals),
            showExclPlata
          )}</div>
         ${comparisonActive ? `<div>${useUniqueCsTotals
          ? buildUniqueTotalCell(
            totalPreviousUniqueCs,
            null,
            expertPreviousTotalNotes
          )
          : buildUniqueTotalCell(
            previousTotalValue,
            null,
            buildPreviousTotalNotesForView(rows, previousYearCreditTotals)
          )}</div>` : ""}
          ${useTableauColumn ? `<div>${totalTableauValue}</div>` : ""}
        </div>
      `);

      displayRows.forEach((row, index) => {
        const rowClass = index % 2 === 0 ? "odd-row" : "even-row";
        bodyRows.push(`
          <div class="leaderboard-row ${rowClass}${bagelRowClass(row)}" style="grid-template-columns:${cols};">
            <div>${index + 1}</div>
            <div>${buildRepNameCell(row.name, row)}</div>
            ${buildCsCell(row, true)}
            ${comparisonActive ? buildPreviousYearCell(row) : ""}
            ${useTableauColumn ? buildTableauCell(row, activeTableauMetric) : ""}
          </div>
        `);
      });
      if (!showInactive && inactiveRows.length) {
        const inCredit = getCreditTotalsFromDeals(currentUniqueDeals, inactiveRows, "current");
        const inPrevCredit = getCreditTotalsFromDeals(previousComparisonDeals, inactiveRows, "previous");
        const inUniqueCs = activeView === "experts"
          ? getUniqueRoleDealTotal(currentUniqueDeals, inactiveRows, "expert")
          : activeView === "setters"
          ? getUniqueRoleDealTotal(currentUniqueDeals, inactiveRows, "setter")
          : sumVisibleUniqueCs(inactiveRows, row => row.cs);
        const inPrevUniqueCs = activeView === "experts"
          ? getUniqueRoleDealTotal(previousComparisonDeals, inactiveRows, "expert", "previous")
          : activeView === "setters"
          ? getUniqueRoleDealTotal(previousComparisonDeals, inactiveRows, "setter", "previous")
          : sumVisibleUniqueCs(inactiveRows, row => getRowPreviousCs(row), true);
        const inValueCell = useUniqueCsTotals
          ? buildUniqueTotalCell(inUniqueCs, null, buildCurrentTotalNotesForView(inactiveRows))
          : buildUniqueTotalCell((inCredit.sets + inCredit.cs) / 2, null, buildCurrentTotalNotesForView(inactiveRows, inCredit));
        const inPrevCell = comparisonActive
          ? (useUniqueCsTotals
            ? buildUniqueTotalCell(inPrevUniqueCs, null, buildPreviousTotalNotesForView(inactiveRows))
            : buildUniqueTotalCell((inPrevCredit.sets + inPrevCredit.cs) / 2, null, buildPreviousTotalNotesForView(inactiveRows, inPrevCredit)))
          : "";
        bodyRows.push(`
          <div class="leaderboard-row inactive-summary-row" style="grid-template-columns:${cols};">
            <div>${buildViewRepCountCell(inactiveRows.length)}</div>
            <div>${buildInactiveNameCell()}</div>
            <div>${inValueCell}</div>
            ${comparisonActive ? `<div>${inPrevCell}</div>` : ""}
            ${useTableauColumn ? `<div></div>` : ""}
          </div>
        `);
      }
    }
  
    document.querySelector(".leaderboard-grid").innerHTML = `
      <div class="leaderboard-column ${useTableauColumn ? "tableau-on" : ""}">
        ${buildLeaderboardTitleHtml(title)}
        ${headerHtml}
        <div class="leaderboard-body">
          ${bodyRows.join("")}
        </div>
      </div>
    `;

    finishLeaderboardRender();
  }
  
  function showLoadingOverlay() {
    if (document.getElementById("pv-loading")) return;
    var o = document.createElement("div");
    o.id = "pv-loading";
    o.innerHTML =
      '<div class="pv-load-logo">PROVEN<span>LEADERBOARD</span></div>' +
      '<div class="pv-spinner"></div>';
    document.body.appendChild(o);
  }

  function hideLoadingOverlay() {
    var o = document.getElementById("pv-loading");
    if (!o) return;
    o.classList.add("pv-hide");
    setTimeout(function () { if (o && o.parentNode) o.parentNode.removeChild(o); }, 450);
  }

  // Load data + render, or show the login overlay if the session is missing/expired.
  async function bootLeaderboard() {
    showLoadingOverlay();
    // Fire the goal-status check up front, in parallel with the payload, so the
    // prompt can appear the moment the board renders instead of waiting on a
    // second serial round-trip after load.
    // Fetch goal-status in parallel with the payload so the board never waits on it.
    const goalStatusPromise = getSessionToken() ? fetchGoalStatus().catch(() => null) : null;
    try {
      await loadApiData();
      await loadDownlineIfNeeded();
      isLeaderboardReady = true;
      renderLeaderboard();
      hideLoginOverlay();
      startSessionHeartbeat();
      maybePromptGoals(goalStatusPromise);
      if (!window.__pvHelpPreloaded) { window.__pvHelpPreloaded = true; setTimeout(preloadHelpModal, 1500); }
    } catch (error) {
      if (error && error.authRequired) {
        showLoginOverlay();
      } else {
        console.error(error);
        document.querySelector(".leaderboard-grid").innerHTML =
          `<div style="text-align:center;color:red;">Error loading Leaderboard V2. Check console.</div>`;
      }
    } finally {
      hideLoadingOverlay();
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    createButtons();
    setupRepCardEvents();
    await bootLeaderboard();
    window.addEventListener("resize", updateLeaderboardStickyOffsets);
  });
  
