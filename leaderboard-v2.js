  const API_URL = "https://script.google.com/macros/s/AKfycbwAum0sv4KhswD0Svr2QWEdBw4cP2K-_wg_bBzkA4lNAgWDX58JX4ODT9xRXxljqR5T/exec";
  
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
    "Connor Fouts"
  ].map(normalizeName));
  
  let allDeals = [];
  let apiMeta = null;
  let previousYearDeals = [];
  let previousYearDetailsMap = new Map();
  let showYoy = false;
  let showMom = false;
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
  let tableauMap = new Map();
  let recruitingRows = [];
  let recruiting2025Rows = [];
  let repProfiles = {}; // approved rep card info keyed by normalized name
  let repGoals = {};    // per-rep goals (weekly CS / monthly / yearly) keyed by normalized name
  let activePreviousYearDownlineNames = null;
  let previousMonthDetailsMap = new Map();
  let momDateRanges = null;
  
  const TABLEAU_METRICS = {
    cs: "CS",
    sra: "SRA",
    cap: "CAP",
    ic: "IC"
  };
  
  let activeTableauMetric = "sra";
  
  let activeView = "general";
  let activeDateMode = "ytd";
  let showTableau = true;
  
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

  function getMomDateRanges() {
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
        label: `${monthLabel} ${year}`
      },
      previous: {
        start: formatDate(prevStart),
        end: formatDate(prevEnd),
        label: `${monthLabel} ${prevYear}`
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

  function useMomColumn() {
    return showMom && activeDateMode === "mtd";
  }

  function useComparisonColumn() {
    return useYoyColumn() || useMomColumn();
  }

  function isPeriodMetricSuffix(suffix) {
    return suffix === "Total" || suffix === "CS" || suffix === "SG";
  }

  function getCurrentComparisonLabel(suffix) {
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

    column.style.setProperty("--lb-title-height", `${title ? title.offsetHeight : 0}px`);
    column.style.setProperty("--lb-header-height", `${header.offsetHeight}px`);
  }

  function finishLeaderboardRender() {
    requestAnimationFrame(updateLeaderboardStickyOffsets);
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

  function getRowPreviousCs(row) {
    const norm = normalizeName(row.name);
    const stats = useMomColumn()
      ? previousMonthDetailsMap.get(norm)
      : previousYearDetailsMap.get(norm);
    if (!stats) return 0;
    if (activeView === "experts") return stats.expertDealIds?.size || 0;
    if (activeView === "setters") return stats.setterDealIds?.size || 0;
    return stats.dealIds?.size || 0;
  }

  function getRowDisplayCs(row) {
    if (activeView === "experts") return row.expertCs || 0;
    if (activeView === "setters") return row.setterCs || 0;
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

  function isGroupDrillDownView() {
    return activeView === "groups" && !!activeGroupDrillLeader;
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

  function canUsePlataToggle() {
    return activeView === "general" && canShowTableauButton();
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
    document.querySelectorAll("#view-tabs button").forEach(btn => {
      btn.classList.toggle("active", btn.textContent === labels[viewKey]);
    });
  }

  function navigateToGeneralFromOfficeGroup(office) {
    activeGroupDrillLeader = null;
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

    activeView = "general";
    if (activeSortMode === "selfGen") {
      activeSortMode = "currentContribution";
    }

    setActiveViewTab("general");
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
    else if (isPlata) role = "Plata";
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
    if (office && normalizeName(office) !== normalizeName(role)) return `${role} · ${office}`;
    return role;
  }

  function buildRepNameCell(name, row) {
    const displayName = String(name || "").trim();
    const sub = repRoleOffice(displayName);
    const btn = `<button type="button" class="rep-card-name-button" data-rep-card-name="${escapeAttr(displayName)}">${escapeHtml(displayName)}</button>`;

    // Outside the goal tabs: original simple name + role/office stack.
    if (["wtd", "mtd", "ytd"].indexOf(activeDateMode) === -1) {
      return `<div class="rep-name-cell">${btn}${sub ? `<div class="rep-row-sub">${escapeHtml(sub)}</div>` : ""}</div>`;
    }

    // Goal tabs: vertically-centered name, with bar + [office · goal] pinned to
    // the bottom of the row as one connected piece.
    const p = getRepGoalProgress(displayName, row);
    const pct = p ? p.pct : 0;
    const done = p && p.pct >= 100;
    const goalLabel = p
      ? `${p.current}<span>/${p.target} ${escapeHtml(p.label)}</span>`
      : `<span class="rep-goal-none">No Goal</span>`;
    return `<div class="rep-name-cell has-goal">` +
      `<div class="rep-name-top">${btn}</div>` +
      `<div class="rep-goal-wrap">` +
        `<div class="rep-goal-track"><div class="rep-goal-fill${done ? " done" : ""}" style="width:${pct}%"></div></div>` +
        `<div class="rep-goal-meta">` +
          (sub ? `<span class="rep-row-sub">${escapeHtml(sub)} ·</span>` : "") +
          `<span class="rep-goal-label">${goalLabel}</span>` +
        `</div>` +
      `</div>` +
    `</div>`;
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
      label = "CS";
      current = Number(row && row.cs) || 0; // internal CS for the active (WTD) range
    } else if (activeDateMode === "mtd" || activeDateMode === "ytd") {
      target = activeDateMode === "mtd" ? goal.monthly : goal.yearly;
      const metric = (goal.metric || "SRA").toLowerCase(); // sra | cap
      label = (goal.metric || "SRA").toUpperCase();
      const trow = getTableauRowForDateMode(norm, activeDateMode);
      current = trow ? (Number(trow[metric]) || 0) : 0;
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
      role = "Plata";
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
          tableau: getRepTableauStatsForPeriod(repName, "ytd")
        },
        mtd: {
          label: "MTD CS",
          discordCs: getRepDiscordCsForRange(repName, "mtd"),
          tableau: getRepTableauStatsForPeriod(repName, "mtd")
        },
        wtd: {
          label: "WTD CS",
          discordCs: getRepDiscordCsForRange(repName, "wtd"),
          tableau: getRepTableauStatsForPeriod(repName, "wtd")
        }
      },
      bestMonth: getRepBestMonthCs(repName),
      bestWeek: getRepBestWeekCs(repName),
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

    if (profile.isPlata) {
      return `
        <div class="rep-card-meta rep-card-meta-row">
          ${officeHtml}
        </div>
        ${groupHtml}
      `;
    }

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
    return `<div class="rc-metrics"><span>CS ${n(t.cs)}</span><span>SRA ${n(t.sra)}</span><span>CAP ${n(t.cap)}</span><span>IC ${n(t.ic)}</span></div>`;
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

  function repCardPeriodTile(p, isPlata) {
    const val = isPlata ? (p.tableau && p.tableau.cs != null ? p.tableau.cs : "—") : (p.discordCs != null ? p.discordCs : "—");
    return `<div class="rep-card-stat is-period"><div class="rep-card-stat-label">${escapeHtml(p.label)}</div><div class="rep-card-stat-value">${escapeHtml(String(val))}</div>${repCardMetrics(p.tableau)}</div>`;
  }

  function repCardSimpleTile(label, value) {
    return `<div class="rep-card-stat"><div class="rep-card-stat-label">${escapeHtml(label)}</div><div class="rep-card-stat-value">${escapeHtml(String(value == null ? "—" : value))}</div></div>`;
  }

  function repCardRankTile(label, rank, metricLabel, metricVal) {
    const sub = metricVal != null ? `<div class="rep-card-stat-sub">${escapeHtml(metricLabel)} ${escapeHtml(String(metricVal))}</div>` : "";
    return `<div class="rep-card-stat"><div class="rep-card-stat-label">${escapeHtml(label)}</div><div class="rep-card-stat-value">#${escapeHtml(String(rank == null ? "—" : rank))}</div>${sub}</div>`;
  }

  function renderRepCard(data) {
    const { profile, periods } = data;
    const isPlata = profile.isPlata;

    // YTD CS Rank: internal rank + internal CS, then Tableau rank · CS on one line.
    const ytdCsRankHtml = isPlata
      ? repCardRankTile("YTD CS Rank", data.ytdTableauCsRank, "CS", data.ytdTableauCsValue)
      : `<div class="rep-card-stat"><div class="rep-card-stat-label">YTD CS Rank</div>
          <div class="rc-valrow"><span class="rep-card-stat-value">#${escapeHtml(String(data.ytdDiscordRank == null ? "—" : data.ytdDiscordRank))}</span>${data.ytdDiscordCs != null ? `<span class="rc-iv">${escapeHtml(String(data.ytdDiscordCs))}</span>` : ""}</div>
          <div class="rc-trk">Tab Rk #${escapeHtml(String(data.ytdTableauCsRank == null ? "—" : data.ytdTableauCsRank))}${data.ytdTableauCsValue != null ? ` · CS ${escapeHtml(String(data.ytdTableauCsValue))}` : ""}</div>
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
          <div class="rep-card-name" id="rep-card-title">${escapeHtml(profile.name)}</div>
          ${isPlata ? "" : `<div class="rep-card-role">${escapeHtml(profile.role)}</div>`}
          ${repCardChips(profile)}
          ${(profile.phone || profile.instagram) ? contact : ""}
        </div>
      </div>
      <div class="rep-card-stat-grid">
        ${repCardPeriodTile(periods.ytd, isPlata)}
        ${repCardPeriodTile(periods.mtd, isPlata)}
        ${repCardPeriodTile(periods.wtd, isPlata)}
        ${repCardSimpleTile("Best Month CS", isPlata ? "na" : data.bestMonth)}
        ${repCardSimpleTile("Best Week CS", isPlata ? "na" : data.bestWeek)}
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
      showYoy,
      showMom,
      includeOldReps,
      includeNewReps,
      includeIceCollective,
      includeRiot,
      includePlata,
      activeSortMode,
      activeTableauMetric,
      activeGroupDrillLeader,
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
    showYoy = state.showYoy;
    showMom = state.showMom;
    includeOldReps = state.includeOldReps;
    includeNewReps = state.includeNewReps;
    includeIceCollective = state.includeIceCollective;
    includeRiot = state.includeRiot;
    includePlata = state.includePlata;
    activeSortMode = state.activeSortMode;
    activeTableauMetric = state.activeTableauMetric;
    activeGroupDrillLeader = state.activeGroupDrillLeader;
    isSubsetMode = state.isSubsetMode;
    activeDownlineNames = state.activeDownlineNames;
    activePreviousYearDownlineNames = state.activePreviousYearDownlineNames;
    activeTitle = state.activeTitle;

    rebuildComparisonMapsForOffice();
    setActiveViewTab(activeView);
    renderLeaderboard();
  }

  function handleRepCardGroupClick(groupLeader) {
    // Remember the rep card we came from AND the full view state behind it, so
    // the group's Back button can restore that exact view and reopen the card.
    groupDrillReturn = { rep: currentRepCardName, state: captureViewState() };
    closeRepCard();

    activeView = "groups";
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

  function buildDownlineSetFromRows(rows, activeRepName) {
    const recruiterNorm = normalizeName(activeRepName);
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
  
    return downline;
  }
  
  function buildGroupContext() {
    const range = getDateRange(activeDateMode);
    const periodDeals = allDeals.filter(deal => dealInDateRange(deal, range));
    const ytdDeals = allDeals.filter(deal => dealInDateRange(deal, getDateRange("ytd")));
    const momRanges = getMomDateRanges();
    const momCurrentDeals = allDeals.filter(deal => dealInDateRange(deal, momRanges.current));
    const momPreviousDeals = previousYearDeals.filter(deal => dealInDateRange(deal, momRanges.previous));
    const useMom = showMom && activeDateMode === "mtd";
    const useYoy = activeDateMode === "ytd" && showYoy && !showMom;
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
      if (year === "2025" && includeOldReps) return downlineNames;

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

    function computeGroupStats(downlineNames, deals, year = "current") {
      let sets = 0;
      let cs = 0;

      deals.forEach(deal => {
        const setterNorm = normalizeName(deal.setter);
        const expertNorm = normalizeName(deal.expert);
        const setterInGroup = downlineNames.has(setterNorm) && repInOfficeUmbrella(setterNorm, year);
        const expertInGroup = downlineNames.has(expertNorm) && repInOfficeUmbrella(expertNorm, year);

        if (setterInGroup) sets += 1;
        if (expertInGroup) cs += 1;
      });

      return { sets, cs, total: (sets + cs) / 2 };
    }

    function qualifiesByYtd(ytdCurrent, ytdPrevious) {
      if (showYoy || showMom) return ytdCurrent.total >= 25 || ytdPrevious.total >= 25;
      return ytdCurrent.total >= 25;
    }

    function buildGroupRow(name, current, previous) {
      return {
        name,
        sets: current.sets,
        cs: current.cs,
        total: current.total,
        previousSets: previous.sets,
        previousCs: previous.cs,
        previousTotal: previous.total
      };
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
        groupRows.push(buildGroupRow(leaderName, current, previous));
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
        groupRows.push(buildGroupRow(label, current, previous));
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
    if (isComparisonMode() && !includeOldReps) return true;
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

  function getGroupYoyPercent(row) {
    if (!row.previousTotal) return null;
    if (!row.total) return null;

    return ((row.total - row.previousTotal) / row.previousTotal) * 100;
  }

  function buildGroupTotalCell(row, showComparison, showNotes = true) {
    const rightNotes = [];

    if (showComparison) {
      const yoy = getGroupYoyPercent(row);
      if (yoy !== null) {
        const sign = yoy > 0 ? "+" : "";
        rightNotes.push(
          `<span class="cs-note-left">${sign}${yoy.toFixed(0)}%</span>`
        );
      }
    }

    const rightHtml = rightNotes.length
      ? `<div class="cs-notes-right">${rightNotes.join("")}</div>`
      : "";

    const leftHtml = showNotes
      ? buildSetsCsNotesStack(row.sets, row.cs)
      : `<div class="cs-notes-stack"></div>`;

    return `
      <div class="cs-cell">
        ${leftHtml}
        ${rightHtml}
        <span class="cs-main">${row.total}</span>
      </div>
    `;
  }

  function buildGroupPreviousTotalCell(row, showNotes = true) {
    const leftHtml = showNotes
      ? buildSetsCsNotesStack(row.previousSets, row.previousCs)
      : `<div class="cs-notes-stack"></div>`;

    return `
      <div class="cs-cell">
        ${leftHtml}
        <span class="cs-main">${row.previousTotal}</span>
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
  
  
  
  async function loadApiData() {
    const res = await fetch(API_URL);
    const payload = await res.json();
  
    apiMeta = {
      lastUpdated: payload.lastUpdated,
      recordCount: payload.recordCount
    };
  
    allDeals = Array.isArray(payload.deals) ? payload.deals : [];
    previousYearDeals = payload.previousYear && Array.isArray(payload.previousYear.deals) ? payload.previousYear.deals : [];

    tableauData = payload.tableau || {};
    recruitingRows =
    payload.recruiting && Array.isArray(payload.recruiting.rows) ? payload.recruiting.rows : [];

  recruiting2025Rows = payload.recruiting2025 && Array.isArray(payload.recruiting2025.rows) ? payload.recruiting2025.rows : [];

    repProfiles = payload.repProfiles && typeof payload.repProfiles === "object" ? payload.repProfiles : {};
    repGoals = payload.repGoals && typeof payload.repGoals === "object" ? payload.repGoals : {};

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
          activeSortMode = "tableau";
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
        if (activeView !== view.key) {
          activeGroupDrillLeader = null;
          groupDrillReturn = null;
        }

        activeView = view.key;
  
        if (activeView === "selfgen") {
            activeSortMode = "selfGen";
        }
  
        if (activeView === "groups") {
            activeSortMode = "currentContribution";
        }
        
        if (activeView === "selfgen" || (activeView === "groups" && !isGroupDrillDownView())) {
          setShowTableau(false);

          if (activeSortMode === "tableau") {
            activeSortMode = "currentContribution";
          }
        }

        document.querySelectorAll("#view-tabs button").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
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
  
    rebuildTableauMap();
  
    if (!["ytd","mtd","wtd","lastWeek"].includes(activeDateMode)) {
      setShowTableau(false);
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
      if (showTableau) {
        activeSortMode = "tableau";
        if (isPortraitMobile() && showYoy) {
          showYoy = false;
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

    if (showYoy) {
      showMom = false;
      activeSortMode = "currentContribution";
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

    if (showMom) {
      showYoy = false;
      activeSortMode = "currentContribution";
      includeOldReps = true;
      includeNewReps = true;
    }

    renderLeaderboard();
  });
  tableauTabs.appendChild(momBtn);
  
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
  
  document.getElementById("apply-custom").addEventListener("click", renderLeaderboard);

  const leaderboardApp = document.getElementById("leaderboard-app");
  if (leaderboardApp) {
    leaderboardApp.addEventListener("click", event => {
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
      var spacer = document.createElement("div");
      spacer.className = "pv-topspacer";
      bar.appendChild(logo);
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
      if (yoyB) cmp.appendChild(yoyB);
      if (momB) cmp.appendChild(momB);
      brow.appendChild(sp); brow.appendChild(bpill); brow.appendChild(cmp);
      island.appendChild(tpill); island.appendChild(brow);
      dateTabs.appendChild(island);
    }

    setupControlScrollFade();
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

    const showDrillNav = activeView === "groups" && activeGroupDrillLeader;

    officeTabs.style.display = "flex";
    if (toggleButtons) toggleButtons.style.display = showDrillNav ? "none" : "flex";
    if (drillNav) drillNav.style.display = showDrillNav ? "flex" : "none";
    if (showDrillNav && drillTitle) {
      drillTitle.textContent = `${activeGroupDrillLeader} Group`;
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

    const oldRepsBtn = document.getElementById("old-reps-toggle");
  const newRepsBtn = document.getElementById("new-reps-toggle");

  if (oldRepsBtn) {
    oldRepsBtn.style.display = isComparisonMode() ? "inline-block" : "none";
    oldRepsBtn.classList.toggle("active", includeOldReps);
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

    if (activeView === "setters") {
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

    if (activeView === "experts") {
      const isCurrentExpert = row.lifetimeCloses > 0;
      const isOldExpert =
        isComparisonMode() &&
        getRowPreviousCloses(row) > 0;

      return isCurrentExpert || isOldExpert;
    }

    if (activeView === "selfgen") {
      return row.selfGen > 0 || (isComparisonMode() && getRowPreviousSelfGen(row) > 0);
    }

    return true;
  }

  function addOldRepsToRows(rows) {
    if (!isComparisonMode() || !includeOldReps) return rows;

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

  function addPlataRepsToRows(rows) {
    const existing = new Set(rows.map(row => normalizeName(row.name)));

    tableauMap.forEach((tableauRow, norm) => {
      if (HIDDEN_REPS.has(norm) || existing.has(norm) || !isPlataRep(norm)) return;
      if (!hasTableauRowData(tableauRow)) return;
      if (!plataRepMeetsActiveTableauCsGate(norm)) return;

      existing.add(norm);
      rows.push({
        ...buildEmptyInternalRow(tableauRow.name, tableauRow),
        isPlataOnly: true
      });
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

  function getComparisonPercent(current, previous) {
    if (!previous) return null;
    if (current === 0) return null;

    return ((current - previous) / previous) * 100;
  }

  function buildCreditTotalCell(totals, comparisonPct = null, showNotes = true) {
    const total = (totals.sets + totals.cs) / 2;
    const rightNotes = [];

    if (comparisonPct !== null) {
      const sign = comparisonPct > 0 ? "+" : "";
      rightNotes.push(
        `<span class="cs-note-left">${sign}${comparisonPct.toFixed(0)}%</span>`
      );
    }

    const rightHtml = rightNotes.length
      ? `<div class="cs-notes-right">${rightNotes.join("")}</div>`
      : "";

    const leftHtml = showNotes
      ? buildSetsCsNotesStack(totals.sets, totals.cs)
      : `<div class="cs-notes-stack"></div>`;

    return `
      <div class="cs-cell">
        ${leftHtml}
        ${rightHtml}
        <span class="cs-main">${total}</span>
      </div>
    `;
  }

  function buildUniqueTotalCell(value, comparisonPct = null, leftNotes = null) {
    const rightNotes = [];

    if (comparisonPct !== null) {
      const sign = comparisonPct > 0 ? "+" : "";
      rightNotes.push(
        `<span class="cs-note-left">${sign}${comparisonPct.toFixed(0)}%</span>`
      );
    }

    const leftHtml = leftNotes && leftNotes.length
      ? `<div class="cs-notes-stack">${leftNotes.join("")}</div>`
      : `<div class="cs-notes-stack"></div>`;

    const rightHtml = rightNotes.length
      ? `<div class="cs-notes-right">${rightNotes.join("")}</div>`
      : "";

    return `
      <div class="cs-cell">
        ${leftHtml}
        ${rightHtml}
        <span class="cs-main">${value}</span>
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
    return "";
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
        <option value="${key}" ${activeTableauMetric === key ? "selected" : ""}>Tableau ${label}</option>
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
    if (row.isPlataOnly) return buildInternalPlaceholderCell();
    if (rowShowsCurrentNa(row)) return buildInternalNaCell();

    const leftNotes = [];
    const rightNotes = [];

    const comparisonPct = useMomColumn() ? getMomPercent(row) : getYoyPercent(row);

    if (isComparisonMode() && comparisonPct !== null) {
      const sign = comparisonPct > 0 ? "+" : "";
      rightNotes.push(
        `<span class="cs-note-left">${sign}${comparisonPct.toFixed(0)}%</span>`
      );
    }
  
    if (showNotes) {
      if (activeView === "setters") {
        // Setter rows do not show Sets/SG subscripts.
      } else if (activeView === "experts") {
        if (row.selfGen > 0) {
          leftNotes.push(`<span class="cs-note-left">SG: ${row.selfGen}</span>`);
        }
        if (row.setOnly > 0) {
          leftNotes.push(`<span class="cs-note-left">Sets: ${row.setOnly}</span>`);
        }
      } else if (activeView === "general") {
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
  
    const leftHtml = leftNotes.length
      ? `<div class="cs-notes-stack">${leftNotes.join("")}</div>`
      : `<div class="cs-notes-stack"></div>`;
  
    const rightHtml = rightNotes.length
      ? `<div class="cs-notes-right">${rightNotes.join("")}</div>`
      : "";
  
    return `
      <div class="cs-cell">
        ${leftHtml}
        ${rightHtml}
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

    if (activeView === "setters") {
      // Setter rows do not show Sets/SG subscripts.
    } else if (activeView === "experts") {
      if (previousSelfGen > 0) {
        notes.push(`<span class="cs-note-left">SG: ${previousSelfGen}</span>`);
      }
      if (previousSetOnly > 0) {
        notes.push(`<span class="cs-note-left">Sets: ${previousSetOnly}</span>`);
      }
    } else if (activeView === "general") {
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

    if (isComparisonMode() && !includeOldReps) {
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
  
    rows.sort((a, b) => {
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
    const aValue = (a.isPlataOnly || rowShowsCurrentNa(a)) ? -Infinity : getRowDisplayCs(a);
    const bValue = (b.isPlataOnly || rowShowsCurrentNa(b)) ? -Infinity : getRowDisplayCs(b);
  
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
      } else if (!a.isPlataOnly || !b.isPlataOnly) {
        if (b.isPlataOnly && !a.isPlataOnly) return -1;
        if (a.isPlataOnly && !b.isPlataOnly) return 1;
        if (rowShowsCurrentNa(b) && !rowShowsCurrentNa(a)) return -1;
        if (rowShowsCurrentNa(a) && !rowShowsCurrentNa(b)) return 1;
        if (b.cs !== a.cs) return b.cs - a.cs;
      }
  
      return a.name.localeCompare(b.name);
    });
  
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
    const cols = useGroupsComparison ? ".55fr 1.65fr 1.2fr 1.2fr" : ".55fr 1.65fr 1.8fr";
    const groupTitle = useMomColumn()
      ? `Groups - ${getMomDateRanges().current.label} vs ${getMomDateRanges().previous.label}`
      : formatTitleWithOptionalDateRange(`Groups - ${groupRange.label}`, groupRange);
    const showCurrentGroupTotalNotes = shouldShowCurrentTotalNotes();
    const showPreviousGroupTotalNotes = shouldShowPreviousTotalNotes();

    if (activeGroupDrillLeader) {
      const leaderDownline = buildDownlineSetFromRows(recruitingRows, activeGroupDrillLeader);
      if (!leaderDownline.size) {
        activeGroupDrillLeader = null;
        updateGroupDrillNav();
      } else {
        const visibleNames = getGroupDrillVisibleNames(activeGroupDrillLeader, groupContext);
        let drillRows = rows.filter(row => visibleNames.has(normalizeName(row.name)));
        const drillUseTableau = useTableauColumn;
        const drillCols = drillUseTableau && useGroupsComparison
          ? ".45fr 1.55fr 1.1fr 1.1fr .9fr"
          : drillUseTableau
          ? ".55fr 1.85fr 1.35fr .95fr"
          : useGroupsComparison
          ? ".55fr 1.65fr 1.2fr 1.2fr"
          : ".6fr 1.7fr 1.7fr";

        const leaderNorm = normalizeName(activeGroupDrillLeader);
        if (!drillRows.some(row => normalizeName(row.name) === leaderNorm)) {
          drillRows.push(buildEmptyInternalRow(activeGroupDrillLeader, tableauMap.get(leaderNorm)));
          drillRows.sort((a, b) => {
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
        <div>
    <button
      class="sort-header-button ${activeSortMode === "name" ? "active-sort" : ""}"
      onclick="setNameSort()">
      Name
    </button>
  </div>
        <div style="display:flex;gap:4px;justify-content:center;">
    <button
      class="sort-header-button ${activeSortMode === "currentContribution" ? "active-sort" : ""}"
      onclick="setCurrentContributionSort()">
      ${getCurrentComparisonLabel("CS")}
    </button>
    ${useGroupsComparison ? `
      <button class="sort-header-button ${activeSortMode === "yoyPercent" ? "active-sort" : ""}" onclick="setYoyPercentSort()">
        %
      </button>
    ` : ""}
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

        bodyRows.push(`
      <div class="leaderboard-row total-row" style="grid-template-columns:${drillCols};">
        <div>${buildViewRepCountCell(drillRows.length)}</div>
        <div>${getTotalRowLabel()}</div>
        <div>${useGroupsComparison
          ? buildGroupTotalCell({
            sets: drillCurrent.sets,
            cs: drillCurrent.cs,
            total: drillCurrent.total,
            previousTotal: drillPrevious.total
          }, useGroupsComparison, showCurrentGroupTotalNotes)
          : buildGroupTotalCell(drillCurrent, false, showCurrentGroupTotalNotes)}</div>
        ${useGroupsComparison ? `<div>${buildGroupPreviousTotalCell({
          previousSets: drillPrevious.sets,
          previousCs: drillPrevious.cs,
          previousTotal: drillPrevious.total
        }, showPreviousGroupTotalNotes)}</div>` : ""}
        ${drillUseTableau ? `<div>${getTableauTotal(drillRows, activeTableauMetric)}</div>` : ""}
      </div>
    `);

        drillRows.forEach((row, index) => {
          const rowClass = index % 2 === 0 ? "odd-row" : "even-row";
          bodyRows.push(`
        <div class="leaderboard-row ${rowClass}" style="grid-template-columns:${drillCols};">
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
        if (b.previousTotal !== a.previousTotal) return b.previousTotal - a.previousTotal;
        if (b.previousSets !== a.previousSets) return b.previousSets - a.previousSets;
        return a.name.localeCompare(b.name);
      }

      if (useGroupsComparison && activeSortMode === "yoyPercent") {
        const aPct = getGroupYoyPercent(a);
        const bPct = getGroupYoyPercent(b);
        const aValue = aPct === null ? -Infinity : aPct;
        const bValue = bPct === null ? -Infinity : bPct;

        if (bValue !== aValue) return bValue - aValue;
        if (b.total !== a.total) return b.total - a.total;
        if (b.sets !== a.sets) return b.sets - a.sets;
        return a.name.localeCompare(b.name);
      }

      if (b.total !== a.total) return b.total - a.total;
      if (b.sets !== a.sets) return b.sets - a.sets;
      return a.name.localeCompare(b.name);
    });

    const headerHtml = `
      <div class="leaderboard-header-row" style="grid-template-columns:${cols};">
        <div>${buildRankHeaderCell()}</div>
        <div>
    <button
      class="sort-header-button ${activeSortMode === "name" ? "active-sort" : ""}"
      onclick="setNameSort()">
      Group
    </button>
  </div>
        <div style="display:flex;gap:4px;justify-content:center;">
    <button
      class="sort-header-button ${activeSortMode === "currentContribution" ? "active-sort" : ""}"
      onclick="setCurrentContributionSort()">
      ${useGroupsComparison ? getCurrentComparisonLabel("Total") : "CS"}
    </button>
    ${useGroupsComparison ? `
      <button class="sort-header-button ${activeSortMode === "yoyPercent" ? "active-sort" : ""}" onclick="setYoyPercentSort()">
        %
      </button>
    ` : ""}
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

    bodyRows.push(`
      <div class="leaderboard-row total-row" style="grid-template-columns:${cols};">
        <div>${buildViewRepCountCell(groupRows.length, "Groups")}</div>
        <div>${getTotalRowLabel()}</div>
        <div>${useGroupsComparison
          ? buildGroupTotalCell({
            sets: totalStats.current.sets,
            cs: totalStats.current.cs,
            total: totalStats.current.total,
            previousTotal: totalStats.previous.total
          }, useGroupsComparison, showCurrentGroupTotalNotes)
          : buildGroupTotalCell({
            sets: totalStats.current.sets,
            cs: totalStats.current.cs,
            total: totalStats.current.total
          }, false, showCurrentGroupTotalNotes)}</div>
        ${useGroupsComparison ? `<div>${buildGroupPreviousTotalCell({
          previousSets: totalStats.previous.sets,
          previousCs: totalStats.previous.cs,
          previousTotal: totalStats.previous.total
        }, showPreviousGroupTotalNotes)}</div>` : ""}
      </div>
    `);

    groupRows.forEach((row, index) => {
      const rowClass = index % 2 === 0 ? "odd-row" : "even-row";
      const nameCell = buildGroupNameCell(row.name);
      bodyRows.push(`
        <div class="leaderboard-row ${rowClass}" style="grid-template-columns:${cols};">
          <div>${index + 1}</div>
          <div>${nameCell}</div>
          <div>${buildGroupTotalCell(row, useGroupsComparison)}</div>
          ${useGroupsComparison ? `<div>${buildGroupPreviousTotalCell(row)}</div>` : ""}
        </div>
      `);
    });

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
  
    if (activeView === "selfgen") {
      const cols = comparisonActive ? ".55fr 1.65fr 1.2fr 1.2fr" : ".55fr 1.65fr 1.8fr";

      headerHtml = `
        <div class="leaderboard-header-row" style="grid-template-columns:${cols};">
          <div>${buildRankHeaderCell()}</div>
          <div>
    <button
      class="sort-header-button ${activeSortMode === "name" ? "active-sort" : ""}"
      onclick="setNameSort()">
      Rep
    </button>
  </div>
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
          <div>${buildViewRepCountCell(rows.length)}</div>
          <div>${getTotalRowLabel()}</div>
          <div>${buildUniqueTotalCell(totalSelfGen, selfGenTotalComparisonPct)}</div>
          ${comparisonActive ? `
    <div class="cs-cell">
      <span class="cs-main">${totalPreviousSelfGen}</span>
    </div>
  ` : ""}
        </div>
      `);

      rows.forEach((row, index) => {
        const rowClass = index % 2 === 0 ? "odd-row" : "even-row";
        bodyRows.push(`
          <div class="leaderboard-row ${rowClass}" style="grid-template-columns:${cols};">
            <div>${index + 1}</div>
            <div>${buildRepNameCell(row.name, row)}</div>
            <div class="cs-cell">
    <span class="cs-main">${row.selfGen}</span>
  </div>
            ${comparisonActive ? buildPreviousYearSelfGenCell(row) : ""}
          </div>
        `);
      });
    } else {
      const cols = useTableauColumn && comparisonActive ? ".45fr 1.55fr 1.1fr 1.1fr .9fr" : useTableauColumn ? ".55fr 1.85fr 1.35fr .95fr" : comparisonActive ? ".55fr 1.65fr 1.2fr 1.2fr" : ".55fr 1.65fr 1.8fr";

      headerHtml = `
        <div class="leaderboard-header-row" style="grid-template-columns:${cols};">
          <div>${buildRankHeaderCell()}</div>
          <div>
    <button
      class="sort-header-button ${activeSortMode === "name" ? "active-sort" : ""}"
      onclick="setNameSort()">
      Rep
    </button>
  </div>
          <div style="display:flex;gap:4px;justify-content:center;">
    <button
      class="sort-header-button ${activeSortMode === "currentContribution" ? "active-sort" : ""}"
      onclick="setCurrentContributionSort()">
      ${comparisonActive ? getCurrentComparisonLabel("CS") : "CS"}
    </button>

    ${comparisonActive ? `
      <button class="sort-header-button ${activeSortMode === "yoyPercent" ? "active-sort" : ""}" onclick="setYoyPercentSort()">
        %
      </button>
    ` : ""}
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

      bodyRows.push(`
        <div class="leaderboard-row total-row" style="grid-template-columns:${cols};">
          <div>${buildViewRepCountCell(rows.length)}</div>
          <div>${getTotalRowLabel()}</div>
         <div>${useUniqueCsTotals
          ? buildUniqueTotalCell(
            totalUniqueCs,
            uniqueTotalComparisonPct,
            expertTotalNotes
          )
          : buildUniqueTotalCell(
            currentTotalValue,
            totalComparisonPct,
            buildCurrentTotalNotesForView(rows, currentCreditTotals)
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

      rows.forEach((row, index) => {
        const rowClass = index % 2 === 0 ? "odd-row" : "even-row";
        bodyRows.push(`
          <div class="leaderboard-row ${rowClass}" style="grid-template-columns:${cols};">
            <div>${index + 1}</div>
            <div>${buildRepNameCell(row.name, row)}</div>
            ${buildCsCell(row, true)}
            ${comparisonActive ? buildPreviousYearCell(row) : ""}
            ${useTableauColumn ? buildTableauCell(row, activeTableauMetric) : ""}
          </div>
        `);
      });
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

  document.addEventListener("DOMContentLoaded", async () => {
    showLoadingOverlay();
    try {
      createButtons();
      setupRepCardEvents();
      await loadApiData();
      await loadDownlineIfNeeded();
      isLeaderboardReady = true;
      renderLeaderboard();
    } catch (error) {
      console.error(error);
      document.querySelector(".leaderboard-grid").innerHTML =
        `<div style="text-align:center;color:red;">Error loading Leaderboard V2. Check console.</div>`;
    } finally {
      hideLoadingOverlay();
    }

    window.addEventListener("resize", updateLeaderboardStickyOffsets);
  });
  
