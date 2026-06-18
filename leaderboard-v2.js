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
  let previousYearMap = new Map();
  let previousYearDetailsMap = new Map();
  let showYoy = false;
  let includeOldReps = true;
  let includeNewReps = true;
  let activeSortMode = "tableau"; // "tableau", "internal", or "previousYear"
  let tableauData = {};
  let tableauMap = new Map();
  let recruitingRows = [];
  let recruiting2025Rows = [];
  let activePreviousYearDownlineNames = null;
  
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
    const useYoy = activeDateMode === "ytd" && showYoy;
    const excludedGroupLeaders = new Set([
      "kelton higgins",
      "adam lloyd",
      "ruan meyer",
      "luke sanders"
    ]);

    const repContrib2026 = new Map();
    const repContribDeals = showYoy ? ytdDeals : periodDeals;
    repContribDeals.forEach(deal => {
      const setterNorm = normalizeName(deal.setter);
      const expertNorm = normalizeName(deal.expert);
      if (setterNorm) repContrib2026.set(setterNorm, (repContrib2026.get(setterNorm) || 0) + 1);
      if (expertNorm) repContrib2026.set(expertNorm, (repContrib2026.get(expertNorm) || 0) + 1);
    });

    function getRepContributions2025(normName) {
      const stats = previousYearDetailsMap.get(normName);
      return stats ? stats.sets + stats.closes : 0;
    }

    function filterDownlineForYear(downlineNames, year, applyYoyFilters = useYoy) {
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

    function computeGroupStats(downlineNames, deals) {
      let sets = 0;
      let cs = 0;
      const dealIds = new Set();

      deals.forEach(deal => {
        const dealId = String(deal.messageId || "").trim();
        const setterInGroup = downlineNames.has(normalizeName(deal.setter));
        const expertInGroup = downlineNames.has(normalizeName(deal.expert));

        if (setterInGroup) sets += 1;
        if (expertInGroup) cs += 1;
        if (dealId && (setterInGroup || expertInGroup)) dealIds.add(dealId);
      });

      return { sets, cs, total: (sets + cs) / 2, dealIds };
    }

    function qualifiesByYtd(ytdCurrent, ytdPrevious) {
      if (showYoy) return ytdCurrent.total >= 25 || ytdPrevious.total >= 25;
      return ytdCurrent.total >= 25;
    }

    function buildGroupRow(name, current, previous) {
      return {
        name,
        sets: current.sets,
        cs: current.cs,
        total: current.total,
        dealIds: current.dealIds,
        previousSets: previous.sets,
        previousCs: previous.cs,
        previousTotal: previous.total,
        previousDealIds: previous.dealIds
      };
    }

    const groupRows = [];

    recruitingRows.forEach(leader => {
      const leaderName = String(leader.name || "").trim();
      const leaderNorm = normalizeName(leaderName);

      if (!leaderName || HIDDEN_REPS.has(leaderNorm) || excludedGroupLeaders.has(leaderNorm)) return;

      const downlineNames = buildDownlineSetFromRows(recruitingRows, leaderName);
      if (!downlineNames.size) return;

      const previousDownlineNames = buildDownlineSetFromRows(recruiting2025Rows, leaderName);
      const ytdCurrent = computeGroupStats(filterDownlineForYear(downlineNames, "2026", showYoy), ytdDeals);
      const ytdPrevious = computeGroupStats(filterDownlineForYear(previousDownlineNames, "2025", showYoy), previousYearDeals);
      const current = computeGroupStats(filterDownlineForYear(downlineNames, "2026"), periodDeals);
      const previous = computeGroupStats(filterDownlineForYear(previousDownlineNames, "2025"), previousYearDeals);

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
      const ytdCurrent = computeGroupStats(filterDownlineForYear(currentNames, "2026", showYoy), ytdDeals);
      const ytdPrevious = computeGroupStats(filterDownlineForYear(previousNames, "2025", showYoy), previousYearDeals);
      const current = computeGroupStats(filterDownlineForYear(currentNames, "2026"), periodDeals);
      const previous = computeGroupStats(filterDownlineForYear(previousNames, "2025"), previousYearDeals);

      if (qualifiesByYtd(ytdCurrent, ytdPrevious)) {
        groupRows.push(buildGroupRow(label, current, previous));
      }
    }

    addOfficeGroup("Ice Collective", "justin-wall", false);
    addOfficeGroup("Riot", "justin-wall", true);

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
      current: computeGroupStats(filterDownlineForYear(allCurrentNames, "2026"), periodDeals),
      previous: computeGroupStats(filterDownlineForYear(allPreviousNames, "2025"), previousYearDeals)
    };

    return { groupRows, totalStats, range };
  }

  function getGroupYoyPercent(row) {
    if (!row.previousTotal) return null;
    if (!row.total) return null;

    return ((row.total - row.previousTotal) / row.previousTotal) * 100;
  }

  function buildGroupTotalCell(row, showYoy) {
    const rightNotes = [];

    if (showYoy) {
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
  
    rebuildPreviousYearMap();
    tableauData = payload.tableau || {};
    recruitingRows =
    payload.recruiting && Array.isArray(payload.recruiting.rows) ? payload.recruiting.rows : [];
  
  recruiting2025Rows = payload.recruiting2025 && Array.isArray(payload.recruiting2025.rows) ? payload.recruiting2025.rows : [];
  
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
    previousYearMap = new Map();
    previousYearDetailsMap = new Map();
  
    function ensureStats(name) {
    const norm = normalizeName(name);
    if (!norm || HIDDEN_REPS.has(norm)) return null;
  
    if (!previousYearDetailsMap.has(norm)) {
      previousYearDetailsMap.set(norm, {
        dealIds: new Set(),
        sets: 0,
        closes: 0,
        setOnly: 0,
        selfGen: 0
      });
    }
  
    return previousYearDetailsMap.get(norm);
  }
  
    previousYearDeals.forEach(deal => {
      const dealId = String(deal.messageId || "").trim();
      if (!dealId) return;
  
      const setterNorm = normalizeName(deal.setter);
      const expertNorm = normalizeName(deal.expert);
      const isSelfGen = setterNorm && expertNorm && setterNorm === expertNorm;
  
      const setterStats = ensureStats(deal.setter);
      if (setterStats) {
        setterStats.dealIds.add(dealId);
        setterStats.sets += 1;
        if (isSelfGen) {
          setterStats.selfGen += 1;
        } else {
          setterStats.setOnly += 1;
        }
      }
  
      const expertStats = ensureStats(deal.expert);
      if (expertStats) {
    expertStats.dealIds.add(dealId);
    expertStats.closes += 1;
  }
    });
  
    previousYearDetailsMap.forEach((stats, norm) => {
      previousYearMap.set(norm, stats.dealIds);
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
  
    viewTabs.innerHTML = "";
    dateTabs.innerHTML = "";
    tableauTabs.innerHTML = "";
  
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
    showTableau = false;
  
    if (activeSortMode === "tableau") {
      activeSortMode = "currentContribution";
    }
  } else if (
    ["ytd","mtd","wtd","lastWeek"].includes(activeDateMode)
  ) {
    showTableau = true;
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
      showTableau = false;
    }
  
    renderLeaderboard();
  });
  
      dateTabs.appendChild(btn);
    });
  
    const tableauBtn = document.createElement("button");
    tableauBtn.id = "tableau-toggle";
    tableauBtn.textContent = "Tableau";
    tableauBtn.addEventListener("click", () => {
      showTableau = !showTableau;
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
      activeSortMode = activeView === "groups" ? "currentContribution" : "previousContribution";
      includeOldReps = true;
      includeNewReps = true;
    }
  
    renderLeaderboard();
  });
  tableauTabs.appendChild(yoyBtn);
  
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
  
    if (!wrapper || !btn) return;
  
    const key = getTableauKeyForDateMode();
    const dataset = key ? tableauData[key] : null;
  
    const shouldShowTableau =
    activeView !== "groups" &&
    activeView !== "selfgen" &&
    dataset &&
    Array.isArray(dataset.rows) &&
    dataset.rows.length;
  
    const shouldShowYoy =
      activeDateMode === "ytd" &&
      previousYearDeals.length;
  
    wrapper.style.display = shouldShowTableau || shouldShowYoy ? "flex" : "none";
  
    btn.style.display = shouldShowTableau ? "inline-block" : "none";
  
    if (!shouldShowTableau) {
      showTableau = false;
    } else {
      const labelDate = formatShortDate(dataset.lastUpdated);
      btn.textContent = labelDate ? `Tableau ${labelDate}` : "Tableau";
      btn.classList.toggle("active", showTableau);
    }
  
    if (yoyBtn) {
      yoyBtn.style.display = shouldShowYoy ? "inline-block" : "none";
      if (!shouldShowYoy) showYoy = false;
      yoyBtn.classList.toggle("active", showYoy);
    }
    const oldRepsBtn = document.getElementById("old-reps-toggle");
  const newRepsBtn = document.getElementById("new-reps-toggle");
  
  if (oldRepsBtn) {
    oldRepsBtn.style.display = showYoy ? "inline-block" : "none";
    oldRepsBtn.classList.toggle("active", includeOldReps);
  }
  
  if (newRepsBtn) {
    newRepsBtn.style.display = showYoy ? "inline-block" : "none";
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
    const includeZeroRows = !["today", "ytd"].includes(activeDateMode);
    const baseDeals = includeZeroRows ? allDeals.filter(deal => dealInScope(deal)) : filteredDeals;
  
    const repMap = new Map();
  
    function ensureRep(name) {
      const norm = normalizeName(name);
      if (!name || HIDDEN_REPS.has(norm)) return null;
  
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
          dealIds: new Set()
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
      const dealId = String(deal.messageId || "").trim();
      if (!dealId) return;
  
      const setterNorm = normalizeName(deal.setter);
      const expertNorm = normalizeName(deal.expert);
      const isSelfGen = setterNorm && expertNorm && setterNorm === expertNorm;
  
      const setter = ensureRep(deal.setter);
      if (setter) {
        setter.sets += 1;
        setter.dealIds.add(dealId);
  
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
      dealIds: rep.dealIds,
      tableau: tableauMap.get(normalizeName(rep.name)) || {},
      previousYearCs: previousYearMap.has(normalizeName(rep.name)) ? previousYearMap.get(normalizeName(rep.name)).size : 0,
      previousYearSetOnly: previousYearDetailsMap.get(normalizeName(rep.name))?.setOnly || 0,
      previousYearSelfGen: previousYearDetailsMap.get(normalizeName(rep.name))?.selfGen || 0,
      previousYearSets: previousYearDetailsMap.get(normalizeName(rep.name))?.sets || 0,
      previousYearCloses: previousYearDetailsMap.get(normalizeName(rep.name))?.closes || 0
    }));
  }
  
  function addOldRepsToRows(rows) {
    if (!showYoy || !includeOldReps) return rows;
  
    const existing = new Set(rows.map(row => normalizeName(row.name)));
  
    previousYearDeals.forEach(deal => {
      [deal.setter, deal.expert].forEach(name => {
        const norm = normalizeName(name);
        if (!norm || HIDDEN_REPS.has(norm) || existing.has(norm)) return;
  
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
          dealIds: new Set(),
          tableau: {},
          previousYearCs: previousYearMap.has(norm) ? previousYearMap.get(norm).size : 0,
          previousYearSetOnly: previousYearDetailsMap.get(norm)?.setOnly || 0,
          previousYearSelfGen: previousYearDetailsMap.get(norm)?.selfGen || 0,
          previousYearSets: previousYearDetailsMap.get(norm)?.sets || 0,
          previousYearCloses: previousYearDetailsMap.get(norm)?.closes || 0
        });
      });
    });
  
    return rows;
  }
  
  function getUniqueDealCountFromRows(rows) {
    const ids = new Set();
    rows.forEach(row => row.dealIds.forEach(id => ids.add(id)));
    return ids.size;
  }
  
  function getPreviousYearUniqueDealCountFromRows(rows) {
    const ids = new Set();
  
    rows.forEach(row => {
      const norm = normalizeName(row.name);
      const repDeals = previousYearMap.get(norm);
      if (!repDeals) return;
  
      repDeals.forEach(id => ids.add(id));
    });
  
    return ids.size;
  }
  
  function previousYearHadClose(normName) {
    return previousYearDeals.some(deal =>
      normalizeName(deal.expert) === normName
    );
  }
    
  function shouldUseCurrentUniqueTotal() {
    return !isSubsetMode && (!showYoy || includeNewReps);
  }
  
  function shouldUsePreviousYearUniqueTotal() {
    return !isSubsetMode && (!showYoy || includeOldReps);
  }
  
  function getCreditTotalsFromDeals(deals, rows) {
    const visibleNames = new Set(rows.map(row => normalizeName(row.name)));
  
    let sets = 0;
    let cs = 0;
  
    deals.forEach(deal => {
      if (visibleNames.has(normalizeName(deal.setter))) sets += 1;
      if (visibleNames.has(normalizeName(deal.expert))) cs += 1;
    });
  
    return { sets, cs };
  }
  
  function buildCreditTotalCell(totals) {
    const total = (totals.sets + totals.cs) / 2;
  
    return `
      <div class="cs-cell">
        <div class="cs-notes-stack">
          <span class="cs-note-left">Sets: ${totals.sets}</span>
          <span class="cs-note-left">CS: ${totals.cs}</span>
        </div>
        <span class="cs-main">${total}</span>
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
    const leftNotes = [];
    const rightNotes = [];
  
    const yoy = getYoyPercent(row);
  
    if (showYoy && yoy !== null) {
      const sign = yoy > 0 ? "+" : "";
      rightNotes.push(
        `<span class="cs-note-left">${sign}${yoy.toFixed(0)}%</span>`
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
    const notes = [];
  
    if (row.previousYearCs > row.previousYearSetOnly && row.previousYearSetOnly > 0) {
      notes.push(`<span class="cs-note-left">Sets: ${row.previousYearSetOnly}</span>`);
    }
  
    if (row.previousYearSelfGen > 0) {
      notes.push(`<span class="cs-note-left">SG: ${row.previousYearSelfGen}</span>`);
    }
  
    const noteHtml = notes.length
      ? `<div class="cs-notes-stack">${notes.join("")}</div>`
      : `<div class="cs-notes-stack"></div>`;
  
    return `
      <div class="cs-cell">
        ${noteHtml}
        <span class="cs-main">${row.previousYearCs}</span>
      </div>
    `;
  }
  
  function buildPreviousYearSelfGenCell(row) {
    if (!row.previousYearSelfGen) {
      return `<div></div>`;
    }
  
    return `
      <div class="cs-cell">
        <span class="cs-main">${row.previousYearSelfGen}</span>
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
    
  function renderLeaderboard() {
    updateTableauToggle();
  
    const range = getDateRange(activeDateMode);
  
    const filteredDeals = allDeals.filter(deal =>
      dealInScope(deal) && dealInDateRange(deal, range)
    );
  
    let rows = getRepMap(filteredDeals);
    const useTableauColumn = activeView !== "groups" && ["ytd","mtd","wtd","lastWeek"].includes(activeDateMode) && showTableau;
    const useYoyColumn = activeDateMode === "ytd" && showYoy;
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
    if (activeView === "selfgen" && showYoy) {
    rows = rows.filter(row => row.selfGen > 0 || row.previousYearSelfGen > 0);
    }
    if (showYoy && !includeNewReps) {
    rows = rows.filter(row =>
      row.previousYearCs > 0 ||
      row.previousYearSetOnly > 0 ||
      row.previousYearSelfGen > 0
    );
  }
  
    rows.sort((a, b) => {
    if (activeSortMode === "name") {
    return a.name.localeCompare(b.name);
    }
  
    if (activeSortMode === "selfGen") {
    if (b.selfGen !== a.selfGen) return b.selfGen - a.selfGen;
    if (b.cs !== a.cs) return b.cs - a.cs;
  }
  
  if (activeSortMode === "previousYearSelfGen") {
    if (b.previousYearSelfGen !== a.previousYearSelfGen) {
      return b.previousYearSelfGen - a.previousYearSelfGen;
    }
  
    if (b.previousYearCs !== a.previousYearCs) {
      return b.previousYearCs - a.previousYearCs;
    }
  }
  
    if (activeSortMode === "currentContribution") {
    const aValue = a.sets + a.closes;
    const bValue = b.sets + b.closes;
  
    if (bValue !== aValue) return bValue - aValue;
    if (b.cs !== a.cs) return b.cs - a.cs;
  }
  
    if (activeSortMode === "previousContribution") {
    const aValue = a.previousYearSets + a.previousYearCloses;
    const bValue = b.previousYearSets + b.previousYearCloses;
  
    if (bValue !== aValue) return bValue - aValue;
    if (b.previousYearCs !== a.previousYearCs) return b.previousYearCs - a.previousYearCs;
  }
  
    if (useYoyColumn && activeSortMode === "yoyPercent") {
    const aPct = getYoyPercent(a);
    const bPct = getYoyPercent(b);
  
    const aValue = aPct === null ? -Infinity : aPct;
    const bValue = bPct === null ? -Infinity : bPct;
  
    if (bValue !== aValue) return bValue - aValue;
  }
    if (useYoyColumn && activeSortMode === "previousYear") {
    const aPrev = activeView === "selfgen"
      ? a.previousYearSelfGen
      : a.previousYearCs;
  
    const bPrev = activeView === "selfgen"
      ? b.previousYearSelfGen
      : b.previousYearCs;
  
    const diff = bPrev - aPrev;
    if (diff !== 0) return diff;
  }
  
    if (useTableauSort) {
        const diff = getTableauValue(b, activeTableauMetric) - getTableauValue(a, activeTableauMetric);
        if (diff !== 0) return diff;
      }
  
      if (activeView === "selfgen") {
        if (b.selfGen !== a.selfGen) return b.selfGen - a.selfGen;
      } else {
        if (b.cs !== a.cs) return b.cs - a.cs;
      }
  
      return a.name.localeCompare(b.name);
    });
  
    const visibleUniqueDeals = getUniqueDealCountFromRows(rows);
    const totalSelfGen = rows.reduce((sum, row) => sum + row.selfGen, 0);
    const totalTableauValue = getTableauTotal(rows, activeTableauMetric);
  
    const useCurrentUniqueTotal = shouldUseCurrentUniqueTotal();
    const usePreviousYearUniqueTotal = shouldUsePreviousYearUniqueTotal();
    const currentCreditTotals = getCreditTotalsFromDeals(filteredDeals, rows);
    const previousYearCreditTotals = getCreditTotalsFromDeals(previousYearDeals, rows);
   
    const title =
      `${activeTitle || "Proven Leaderboard V2"} - ${range.label} (${range.start} to ${range.end})`;
  
    const meta = document.getElementById("leaderboard-meta");
    meta.textContent = apiMeta
      ? `Deals loaded: ${apiMeta.recordCount} | Deals in view: ${filteredDeals.length} | Last updated: ${new Date(apiMeta.lastUpdated).toLocaleString()}`
      : "";
  
    let headerHtml = "";
    const bodyRows = [];
    if (activeView === "groups") {
    const useGroupsYoy = activeDateMode === "ytd" && showYoy;
    const { groupRows, totalStats, range: groupRange } = getGroupRows();

    groupRows.sort((a, b) => {
      if (activeSortMode === "name") {
        return a.name.localeCompare(b.name);
      }

      if (activeSortMode === "previousContribution") {
        if (b.previousTotal !== a.previousTotal) return b.previousTotal - a.previousTotal;
        if (b.previousDealIds.size !== a.previousDealIds.size) return b.previousDealIds.size - a.previousDealIds.size;
        return a.name.localeCompare(b.name);
      }

      if (useGroupsYoy && activeSortMode === "yoyPercent") {
        const aPct = getGroupYoyPercent(a);
        const bPct = getGroupYoyPercent(b);
        const aValue = aPct === null ? -Infinity : aPct;
        const bValue = bPct === null ? -Infinity : bPct;

        if (bValue !== aValue) return bValue - aValue;
        if (b.total !== a.total) return b.total - a.total;
        if (b.dealIds.size !== a.dealIds.size) return b.dealIds.size - a.dealIds.size;
        return a.name.localeCompare(b.name);
      }

      if (b.total !== a.total) return b.total - a.total;
      if (b.dealIds.size !== a.dealIds.size) return b.dealIds.size - a.dealIds.size;
      return a.name.localeCompare(b.name);
    });

    const cols = useGroupsYoy ? ".55fr 1.65fr 1.2fr 1.2fr" : ".55fr 1.65fr 1.8fr";

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
      ${useGroupsYoy ? "2026 Total" : "Total"}
    </button>
    ${useGroupsYoy ? `
      <button class="sort-header-button ${activeSortMode === "yoyPercent" ? "active-sort" : ""}" onclick="setYoyPercentSort()">
        %
      </button>
    ` : ""}
  </div>
        ${useGroupsYoy ? `
    <div>
      <button class="sort-header-button ${activeSortMode === "previousContribution" ? "active-sort" : ""}" onclick="setPreviousContributionSort()">
        2025 Total
      </button>
    </div>
  ` : ""}
      </div>
    `;

    const useGroupsUnique2026 = !useGroupsYoy || includeNewReps;
    const useGroupsUnique2025 = !useGroupsYoy || includeOldReps;

    const total2026 = useGroupsUnique2026
      ? totalStats.current.dealIds.size
      : totalStats.current.total;
    const total2025 = useGroupsUnique2025
      ? totalStats.previous.dealIds.size
      : totalStats.previous.total;

    bodyRows.push(`
      <div class="leaderboard-row total-row" style="grid-template-columns:${cols};">
        <div></div>
        <div>TOTAL</div>
        <div>${useGroupsYoy
          ? buildGroupTotalCell({
            sets: totalStats.current.sets,
            cs: totalStats.current.cs,
            total: total2026
          }, false)
          : totalStats.current.dealIds.size}</div>
        ${useGroupsYoy ? `<div>${buildGroupPreviousTotalCell({
          previousSets: totalStats.previous.sets,
          previousCs: totalStats.previous.cs,
          previousTotal: total2025
        })}</div>` : ""}
      </div>
    `);

    groupRows.forEach((row, index) => {
      const rowClass = index % 2 === 0 ? "odd-row" : "even-row";
      bodyRows.push(`
        <div class="leaderboard-row ${rowClass}" style="grid-template-columns:${cols};">
          <div>${index + 1}</div>
          <div>${row.name}</div>
          <div>${buildGroupTotalCell(row, useGroupsYoy)}</div>
          ${useGroupsYoy ? `<div>${buildGroupPreviousTotalCell(row)}</div>` : ""}
        </div>
      `);
    });

    document.querySelector(".leaderboard-grid").innerHTML = `
      <div class="leaderboard-column">
        <div class="leaderboard-title">Groups - ${groupRange.label} (${groupRange.start} to ${groupRange.end})</div>
        ${headerHtml}
        <div class="leaderboard-body">
          ${bodyRows.join("")}
        </div>
      </div>
    `;

    return;
  }
  
    if (activeView === "selfgen") {
      const cols = useYoyColumn ? ".55fr 1.45fr 1.4fr 1.4fr" : ".55fr 1.65fr 1.8fr";
  
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
    ${useYoyColumn ? "2026 SG" : "SelfGen"}
  </button>
  </div>
          ${useYoyColumn ? `
    <div>
      <button class="sort-header-button ${activeSortMode === "previousYearSelfGen" ? "active-sort" : ""}" onclick="setPreviousYearSelfGenSort()">
    2025 SG
  </button>
    </div>
  ` : ""}
        </div>
      `;
  
      bodyRows.push(`
        <div class="leaderboard-row total-row" style="grid-template-columns:${cols};">
          <div></div>
          <div>TOTAL</div>
          <div class="cs-cell">
    <span class="cs-main">${totalSelfGen}</span>
  </div>
          ${useYoyColumn ? `
    <div class="cs-cell">
      <span class="cs-main">${rows.reduce((sum, row) => sum + row.previousYearSelfGen, 0)}</span>
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
            ${useYoyColumn ? buildPreviousYearSelfGenCell(row) : ""}
          </div>
        `);
      });
    } else {
      const cols = useTableauColumn && useYoyColumn ? ".45fr 1.55fr 1.1fr 1.1fr .9fr" : useTableauColumn ? ".55fr 1.85fr 1.35fr .95fr" : useYoyColumn ? ".55fr 1.65fr 1.2fr 1.2fr" : ".6fr 1.7fr 1.7fr";
  
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
      ${useYoyColumn ? "2026 CS" : "CS"}
    </button>
  
    ${useYoyColumn ? `
      <button class="sort-header-button ${activeSortMode === "yoyPercent" ? "active-sort" : ""}" onclick="setYoyPercentSort()">
        %
      </button>
    ` : ""}
  </div>
          ${useYoyColumn ? `
    <div>
      <button class="sort-header-button ${activeSortMode === "previousContribution" ? "active-sort" : ""}" onclick="setPreviousContributionSort()">
        2025 CS
      </button>
    </div>
  ` : ""}
  
  ${useTableauColumn ? buildTableauHeader() : ""}
        </div>
      `;
  
      bodyRows.push(`
        <div class="leaderboard-row total-row" style="grid-template-columns:${cols};">
          <div></div>
          <div>TOTAL</div>
         <div>${useCurrentUniqueTotal ? visibleUniqueDeals : buildCreditTotalCell(currentCreditTotals)}</div>
         ${useYoyColumn ? `<div>${usePreviousYearUniqueTotal ? getPreviousYearUniqueDealCountFromRows(rows) : buildCreditTotalCell(previousYearCreditTotals)}</div>` : ""}
          ${useTableauColumn ? `<div>${totalTableauValue}</div>` : ""}
        </div>
      `);
  
      rows.forEach((row, index) => {
        const rowClass = index % 2 === 0 ? "odd-row" : "even-row";
        bodyRows.push(`
          <div class="leaderboard-row ${rowClass}" style="grid-template-columns:${cols};">
            <div>${index + 1}</div>
            <div>${row.name}</div>
            ${activeView === "setters" ? `
    <div class="cs-cell">
      <span class="cs-main">${row.cs}</span>
    </div>
  ` : buildCsCell(row, true)}
            ${useYoyColumn ? buildPreviousYearCell(row) : ""}
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
  
