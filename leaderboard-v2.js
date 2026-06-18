  const API_URL = "https://script.google.com/macros/s/AKfycbwAum0sv4KhswD0Svr2QWEdBw4cP2K-_wg_bBzkA4lNAgWDX58JX4ODT9xRXxljqR5T/exec";
  
  const INCLUDE_RECRUITER_SELF = true;
  
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

  function getCurrentComparisonLabel(suffix) {
    if (useMomColumn()) return `${(momDateRanges || getMomDateRanges()).current.label} ${suffix}`;
    if (showYoy) return `2026 ${suffix}`;
    return suffix;
  }

  function getPreviousComparisonLabel(suffix) {
    if (useMomColumn()) return `${(momDateRanges || getMomDateRanges()).previous.label} ${suffix}`;
    if (showYoy) return `2025 ${suffix}`;
    return suffix;
  }

  function getRowPreviousCs(row) {
    return getRepContribution(getRowPreviousSets(row), getRowPreviousCloses(row));
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

  function isTableauViewRelevant() {
    return activeView !== "groups" &&
      activeView !== "selfgen" &&
      ["ytd", "mtd", "wtd", "lastWeek"].includes(activeDateMode);
  }

  function canShowTableauButton() {
    const key = getTableauKeyForDateMode();
    const dataset = key ? tableauData[key] : null;
    return isTableauViewRelevant() &&
      dataset &&
      Array.isArray(dataset.rows) &&
      dataset.rows.length > 0;
  }

  function setShowTableau(value) {
    showTableau = value;
    if (!value) includePlata = false;
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

  function rowHasNoCurrentInternal(row) {
    return row.sets + row.closes === 0;
  }

  function rowHasNoPreviousInternal(row) {
    return getRowPreviousSets(row) + getRowPreviousCloses(row) === 0;
  }

  function rowShowsCurrentNa(row) {
    if (row.isPlataOnly) return false;
    const norm = normalizeName(row.name);
    return isRecruitingRep(norm) && hasTableauDataForNorm(norm) && rowHasNoCurrentInternal(row);
  }

  function rowShowsPreviousNa(row) {
    if (row.isPlataOnly) return false;
    const norm = normalizeName(row.name);
    return isRecruitingRep(norm) && hasTableauDataForNorm(norm) && rowHasNoPreviousInternal(row);
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
  
  function getGroupRows() {
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
    const excludedGroupLeaders = new Set([
      "kelton higgins",
      "adam lloyd",
      "ruan meyer",
      "luke sanders"
    ]);

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

    const groupRows = [];

    recruitingRows.forEach(leader => {
      const leaderName = String(leader.name || "").trim();
      const leaderNorm = normalizeName(leaderName);

      if (!leaderName || HIDDEN_REPS.has(leaderNorm) || excludedGroupLeaders.has(leaderNorm)) return;
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

  function getGroupYoyPercent(row) {
    if (!row.previousTotal) return null;
    if (!row.total) return null;

    return ((row.total - row.previousTotal) / row.previousTotal) * 100;
  }

  function buildGroupTotalCell(row, showComparison) {
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

    return `
      <div class="cs-cell">
        <div class="cs-notes-stack">
          <span class="cs-note-left">Sets: ${row.sets}</span>
          <span class="cs-note-left">CS: ${row.cs}</span>
        </div>
        ${rightHtml}
        <span class="cs-main">${row.total}</span>
      </div>
    `;
  }

  function buildGroupPreviousTotalCell(row) {
    return `
      <div class="cs-cell">
        <div class="cs-notes-stack">
          <span class="cs-note-left">Sets: ${row.previousSets}</span>
          <span class="cs-note-left">CS: ${row.previousCs}</span>
        </div>
        <span class="cs-main">${row.previousTotal}</span>
      </div>
    `;
  }

  function getUrlMode() {
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
          sets: 0,
          closes: 0,
          setOnly: 0,
          selfGen: 0
        });
      }

      return previousYearDetailsMap.get(norm);
    }

    previousYearDeals.forEach(deal => {
      const setterNorm = normalizeName(deal.setter);
      const expertNorm = normalizeName(deal.expert);
      const isSelfGen = setterNorm && expertNorm && setterNorm === expertNorm;

      if (setterNorm && repInOfficeUmbrella(setterNorm, "previous")) {
        const setterStats = ensureStats(deal.setter);
        if (setterStats) {
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
          sets: 0,
          closes: 0,
          setOnly: 0,
          selfGen: 0
        });
      }

      return previousMonthDetailsMap.get(norm);
    }

    getMomPreviousDeals().forEach(deal => {
      const setterNorm = normalizeName(deal.setter);
      const expertNorm = normalizeName(deal.expert);
      const isSelfGen = setterNorm && expertNorm && setterNorm === expertNorm;

      if (setterNorm && repInOfficeUmbrella(setterNorm, "previous")) {
        const setterStats = ensureStats(deal.setter);
        if (setterStats) {
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

      officeTabs.appendChild(btn);
    });
  
    [
      { key: "general", label: "General" },
      { key: "setters", label: "Setters" },
      { key: "experts", label: "Experts" },
      { key: "selfgen", label: "SelfGen" },
      { key: "groups", label: "Groups" }
    ].forEach(view => {
      const btn = document.createElement("button");
      btn.textContent = view.label;
      btn.classList.toggle("active", activeView === view.key);
  
      btn.addEventListener("click", () => {
        activeView = view.key;
  
        if (activeView === "selfgen") {
            activeSortMode = "selfGen";
        }
  
        if (activeView === "groups") {
            activeSortMode = "currentContribution";
        }
        
        if (activeView === "selfgen" || activeView === "groups") {
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
      if (showTableau) activeSortMode = "tableau";
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
  }
  
  function updateTableauToggle() {
    const wrapper = document.getElementById("tableau-tabs");
    const btn = document.getElementById("tableau-toggle");
    const yoyBtn = document.getElementById("yoy-toggle");
    const momBtn = document.getElementById("mom-toggle");
    const officeTabs = document.getElementById("office-tabs");

    if (!wrapper || !btn) return;

    if (officeTabs) {
      officeTabs.style.display = isSubsetMode ? "none" : "flex";
    }

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

    wrapper.style.display = shouldShowTableau || shouldShowYoy || shouldShowMom ? "flex" : "none";

    btn.style.display = shouldShowTableau ? "inline-block" : "none";

    if (plataBtn) {
      plataBtn.classList.toggle("active", includePlata && canSelectPlata);
      plataBtn.disabled = !canSelectPlata;
      plataBtn.classList.toggle("disabled", !canSelectPlata);
    }

    if (!shouldShowTableau) {
      setShowTableau(false);
    } else {
      const labelDate = formatShortDate(dataset.lastUpdated);
      btn.textContent = labelDate ? `Tableau ${labelDate}` : "Tableau";
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
          lifetimeSelfGen: 0
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
      const setterNorm = normalizeName(deal.setter);
      const expertNorm = normalizeName(deal.expert);
      const isSelfGen = setterNorm && expertNorm && setterNorm === expertNorm;

      const setter = ensureRep(deal.setter);
      if (setter) {
        setter.sets += 1;

        if (isSelfGen) {
          setter.selfGen += 1;
        } else {
          setter.setOnly += 1;
        }
      }

      const expert = ensureRep(deal.expert);
      if (expert) {
        expert.closes += 1;
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
      cs: getRepContribution(rep.sets, rep.closes),
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

  function buildCreditTotalCell(totals, comparisonPct = null) {
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

    return `
      <div class="cs-cell">
        <div class="cs-notes-stack">
          <span class="cs-note-left">Sets: ${totals.sets}</span>
          <span class="cs-note-left">CS: ${totals.cs}</span>
        </div>
        ${rightHtml}
        <span class="cs-main">${total}</span>
      </div>
    `;
  }

  function buildUniqueTotalCell(value, comparisonPct = null) {
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

    return `
      <div class="cs-cell">
        <div class="cs-notes-stack"></div>
        ${rightHtml}
        <span class="cs-main">${value}</span>
      </div>
    `;
  }
  
  function getTableauTotal(rows, metric) {
    return "";
  }
  
  function getTableauValue(row, metric) {
    return Number(row.tableau?.[metric]) || 0;
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
        <select class="tableau-select ${activeSortMode === "tableau" ? "active-sort" : ""}" onclick="setTableauSortAndRender()" onchange="setTableauMetric(this.value)">
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
  
    if (showNotes && row.lifetimeCloses > 0 && row.setOnly > 0) {
      leftNotes.push(`<span class="cs-note-left">Sets: ${row.setOnly}</span>`);
    }
  
    if (showNotes && row.lifetimeCloses > 0 && row.selfGen > 0) {
      leftNotes.push(`<span class="cs-note-left">SG: ${row.selfGen}</span>`);
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
        <span class="cs-main">${row.cs}</span>
      </div>
    `;
  }
  
  function buildPreviousYearCell(row) {
    if (row.isPlataOnly) return buildInternalPlaceholderCell();
    if (rowShowsPreviousNa(row)) return buildInternalNaCell();

    const notes = [];
    const previousSetOnly = getRowPreviousSetOnly(row);
    const previousSelfGen = getRowPreviousSelfGen(row);

    if (previousSetOnly > 0) {
      notes.push(`<span class="cs-note-left">Sets: ${previousSetOnly}</span>`);
    }

    if (previousSelfGen > 0) {
      notes.push(`<span class="cs-note-left">SG: ${previousSelfGen}</span>`);
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
    const current = row.sets + row.closes;
    const previous = row.previousYearSets + row.previousYearCloses;

    if (!previous) return null;
    if (current === 0) return null;

    return ((current - previous) / previous) * 100;
  }

  function getMomPercent(row) {
    const current = row.sets + row.closes;
    const previous = row.previousMonthSets + row.previousMonthCloses;

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
    const useTableauColumn = activeView !== "groups" && ["ytd","mtd","wtd","lastWeek"].includes(activeDateMode) && showTableau;
    const useTableauSort = useTableauColumn && activeSortMode === "tableau";
  
    if (activeView === "setters") {
      rows = rows.filter(row => {
    const norm = normalizeName(row.name);
    const had2025Close = previousYearHadClose(norm);
  
    return row.lifetimeSets > 0 &&
           row.lifetimeCloses === 0 &&
           !had2025Close;
  });
    } else if (activeView === "experts") {
      rows = rows.filter(row => row.lifetimeCloses > 0);
    } else if (activeView === "selfgen") {
      rows = rows.filter(row => row.lifetimeCloses > 0 && row.selfGen > 0);
    } else {
      rows = rows.filter(row => row.lifetimeSets > 0 || row.lifetimeCloses > 0);
    }
    if (activeView !== "setters") {
    rows = addOldRepsToRows(rows);
    }
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
    const aValue = (a.isPlataOnly || rowShowsCurrentNa(a)) ? -Infinity : a.sets + a.closes;
    const bValue = (b.isPlataOnly || rowShowsCurrentNa(b)) ? -Infinity : b.sets + b.closes;
  
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
        const diff = getTableauValue(b, activeTableauMetric) - getTableauValue(a, activeTableauMetric);
        if (diff !== 0) return diff;
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
      : `${activeTitle || "Proven Leaderboard V2"} - ${range.label} (${range.start} to ${range.end})`;
  
    const meta = document.getElementById("leaderboard-meta");
    meta.textContent = apiMeta
      ? `Deals loaded: ${apiMeta.recordCount} | Deals in view: ${filteredDeals.length} | Last updated: ${new Date(apiMeta.lastUpdated).toLocaleString()}`
      : "";
  
    let headerHtml = "";
    const bodyRows = [];
    if (activeView === "groups") {
    const useGroupsComparison = useMomColumn() || (activeDateMode === "ytd" && showYoy);
    const { groupRows, totalStats, range: groupRange } = getGroupRows();

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

    const cols = useGroupsComparison ? ".55fr 1.65fr 1.2fr 1.2fr" : ".55fr 1.65fr 1.8fr";

    const headerHtml = `
      <div class="leaderboard-header-row" style="grid-template-columns:${cols};">
        <div>Rank</div>
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
      ${useGroupsComparison ? getCurrentComparisonLabel("Total") : "Total"}
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
        <div></div>
        <div>TOTAL</div>
        <div>${useGroupsComparison
          ? buildGroupTotalCell({
            sets: totalStats.current.sets,
            cs: totalStats.current.cs,
            total: totalStats.current.total,
            previousTotal: totalStats.previous.total
          }, useGroupsComparison)
          : buildGroupTotalCell({
            sets: totalStats.current.sets,
            cs: totalStats.current.cs,
            total: totalStats.current.total
          }, false)}</div>
        ${useGroupsComparison ? `<div>${buildGroupPreviousTotalCell({
          previousSets: totalStats.previous.sets,
          previousCs: totalStats.previous.cs,
          previousTotal: totalStats.previous.total
        })}</div>` : ""}
      </div>
    `);

    groupRows.forEach((row, index) => {
      const rowClass = index % 2 === 0 ? "odd-row" : "even-row";
      bodyRows.push(`
        <div class="leaderboard-row ${rowClass}" style="grid-template-columns:${cols};">
          <div>${index + 1}</div>
          <div>${row.name}</div>
          <div>${buildGroupTotalCell(row, useGroupsComparison)}</div>
          ${useGroupsComparison ? `<div>${buildGroupPreviousTotalCell(row)}</div>` : ""}
        </div>
      `);
    });

    document.querySelector(".leaderboard-grid").innerHTML = `
      <div class="leaderboard-column">
        <div class="leaderboard-title">${useMomColumn()
          ? `Groups - ${getMomDateRanges().current.label} vs ${getMomDateRanges().previous.label}`
          : `Groups - ${groupRange.label} (${groupRange.start} to ${groupRange.end})`}</div>
        ${headerHtml}
        <div class="leaderboard-body">
          ${bodyRows.join("")}
        </div>
      </div>
    `;

    return;
  }
  
    if (activeView === "selfgen") {
      const cols = comparisonActive ? ".55fr 1.45fr 1.4fr 1.4fr" : ".55fr 1.65fr 1.8fr";

      headerHtml = `
        <div class="leaderboard-header-row" style="grid-template-columns:${cols};">
          <div>Rank</div>
          <div>
    <button
      class="sort-header-button ${activeSortMode === "name" ? "active-sort" : ""}"
      onclick="setNameSort()">
      Name
    </button>
  </div>
          <div>
    <button
    class="sort-header-button ${activeSortMode === "selfGen" ? "active-sort" : ""}"
    onclick="setSelfGenSort()">
    ${comparisonActive ? getCurrentComparisonLabel("SG") : "SelfGen"}
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
          <div></div>
          <div>TOTAL</div>
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
            <div>${row.name}</div>
            <div class="cs-cell">
    <span class="cs-main">${row.selfGen}</span>
  </div>
            ${comparisonActive ? buildPreviousYearSelfGenCell(row) : ""}
          </div>
        `);
      });
    } else {
      const cols = useTableauColumn && comparisonActive ? ".45fr 1.55fr 1.1fr 1.1fr .9fr" : useTableauColumn ? ".55fr 1.85fr 1.35fr .95fr" : comparisonActive ? ".55fr 1.65fr 1.2fr 1.2fr" : ".6fr 1.7fr 1.7fr";

      headerHtml = `
        <div class="leaderboard-header-row" style="grid-template-columns:${cols};">
          <div>Rank</div>
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

      bodyRows.push(`
        <div class="leaderboard-row total-row" style="grid-template-columns:${cols};">
          <div></div>
          <div>TOTAL</div>
         <div>${buildCreditTotalCell(currentCreditTotals, totalComparisonPct)}</div>
         ${comparisonActive ? `<div>${buildCreditTotalCell(previousYearCreditTotals)}</div>` : ""}
          ${useTableauColumn ? `<div>${totalTableauValue}</div>` : ""}
        </div>
      `);

      rows.forEach((row, index) => {
        const rowClass = index % 2 === 0 ? "odd-row" : "even-row";
        bodyRows.push(`
          <div class="leaderboard-row ${rowClass}" style="grid-template-columns:${cols};">
            <div>${index + 1}</div>
            <div>${row.name}</div>
            ${activeView === "setters" ? buildCsCell(row, false) : buildCsCell(row, true)}
            ${comparisonActive ? buildPreviousYearCell(row) : ""}
            ${useTableauColumn ? buildTableauCell(row, activeTableauMetric) : ""}
          </div>
        `);
      });
    }
  
    document.querySelector(".leaderboard-grid").innerHTML = `
      <div class="leaderboard-column ${useTableauColumn ? "tableau-on" : ""}">
        <div class="leaderboard-title">${title}</div>
        ${headerHtml}
        <div class="leaderboard-body">
          ${bodyRows.join("")}
        </div>
      </div>
    `;
  }
  
  document.addEventListener("DOMContentLoaded", async () => {
    try {
      createButtons();
      await loadApiData();
      await loadDownlineIfNeeded();
      renderLeaderboard();
    } catch (error) {
      console.error(error);
      document.querySelector(".leaderboard-grid").innerHTML =
        `<div style="text-align:center;color:red;">Error loading Leaderboard V2. Check console.</div>`;
    }
  });
  
