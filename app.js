const LOGIN_URL = "https://api2.ghin.com/api/v1/golfer_login.json";
const API_BASE = "https://api.ghin.com/api/v1";
const API2_BASE = "https://api2.ghin.com/api/v1";
const REQUEST_TIMEOUT_MS = 15000;
const BACKEND_BASE_URL =
  (window.GHIN_TRACKER_CONFIG && window.GHIN_TRACKER_CONFIG.backendBaseUrl
    ? String(window.GHIN_TRACKER_CONFIG.backendBaseUrl).trim()
    : "") || "";

const session = {
  token: "",
  golferId: "",
  golferName: "",
  associationId: "",
  backendSessionId: "",
  scores: [],
  directoryGolfers: [],
  golfers: [],
  comparisonGolfers: [],
  lastRoundByGolferId: {},
};

const elements = {
  loginScreen: document.querySelector("#loginScreen"),
  appShell: document.querySelector("#appShell"),
  loginForm: document.querySelector("#loginForm"),
  loginButton: document.querySelector("#loginButton"),
  loginStatus: document.querySelector("#loginStatus"),
  appStatus: document.querySelector("#appStatus"),
  accountChip: document.querySelector("#accountChip"),
  refreshButton: document.querySelector("#refreshButton"),
  logoutButton: document.querySelector("#logoutButton"),
  statGrid: document.querySelector("#statGrid"),
  trendChart: document.querySelector("#trendChart"),
  scoresTableBody: document.querySelector("#scoresTableBody"),
  membersTableBody: document.querySelector("#membersTableBody"),
  comparisonTableBody: document.querySelector("#comparisonTableBody"),
  memberSearch: document.querySelector("#memberSearch"),
  memberSearchButton: document.querySelector("#memberSearchButton"),
  memberSearchStatus: document.querySelector("#memberSearchStatus"),
  emptyStateTemplate: document.querySelector("#emptyStateTemplate"),
};

bindEvents();

function bindEvents() {
  elements.loginForm.addEventListener("submit", handleLogin);
  elements.refreshButton.addEventListener("click", refreshAllData);
  elements.logoutButton.addEventListener("click", logout);
  elements.memberSearch.addEventListener("keydown", handleMemberSearchKeydown);
  elements.memberSearchButton.addEventListener("click", handleMemberSearch);
  elements.membersTableBody.addEventListener("click", handleMembersTableClick);
  elements.comparisonTableBody.addEventListener("click", handleComparisonTableClick);
}

async function handleLogin(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const username = formData.get("username").toString().trim();
  const password = formData.get("password").toString();

  if (!username || !password) {
    elements.loginStatus.textContent = "Enter your GHIN number or email and password.";
    return;
  }

  setLoginBusy(true, "Connecting...");
  elements.loginStatus.textContent = "Signing in...";

  try {
    const payload = {
      user: {
        email_or_ghin: username,
        password,
        remember_me: "true",
      },
      token: "browser",
    };

    const data = await fetchJson(LOGIN_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(payload),
    });

    const golferUser = data.golfer_user;
    if (!golferUser || !golferUser.golfer_user_token) {
      throw new Error("GHIN login did not return a session token.");
    }

    session.token = golferUser.golfer_user_token;
    session.golferId =
      golferUser.ghin_number ||
      golferUser.golfer_id ||
      golferUser.id ||
      (golferUser.golfers && golferUser.golfers[0] && golferUser.golfers[0].ghin_number) ||
      "";
    session.golferName =
      [golferUser.first_name, golferUser.last_name].filter(Boolean).join(" ") ||
      (golferUser.golfers && golferUser.golfers[0] && golferUser.golfers[0].player_name) ||
      username;
    session.associationId =
      golferUser.association_id ||
      golferUser.golf_association_id ||
      (golferUser.golfers && golferUser.golfers[0] && golferUser.golfers[0].association_id) ||
      "";

    if (!session.golferId) {
      throw new Error("Could not determine your GHIN player id from the login response.");
    }

    elements.accountChip.textContent = session.golferName;
    document.body.classList.add("session-active");
    elements.loginScreen.classList.add("hidden");
    elements.appShell.classList.remove("hidden");
    setStatus("");
    setLoginBusy(false, "Connect GHIN");
    void connectLookupBackend(username, password);
    refreshAllData();
    return;
  } catch (error) {
    elements.loginStatus.textContent = error.message;
    if (!session.token) {
      logout(false);
    }
  } finally {
    if (!session.token) {
      setLoginBusy(false, "Connect GHIN");
    }
  }
}

async function refreshAllData() {
  if (!session.token || !session.golferId) {
    return;
  }

  elements.refreshButton.disabled = true;
  elements.refreshButton.textContent = "Refreshing...";
  setStatus("Loading GHIN data...");

  try {
    setStatus("Loading your GHIN profile...");
    const [scoresResult, golferResult] = await Promise.allSettled([
      fetchScores(session.golferId),
      ghinFetch(
        `${API_BASE}/golfers/search.json?per_page=1&page=1&golfer_id=${encodeURIComponent(session.golferId)}`,
        "profile lookup",
      ),
    ]);

    if (golferResult.status !== "fulfilled") {
      throw golferResult.reason;
    }

    if (scoresResult.status !== "fulfilled") {
      throw scoresResult.reason;
    }

    const scoresPayload = scoresResult.value;
    const golferPayload = golferResult.value;

    session.scores = extractScores(scoresPayload);
    session.directoryGolfers = [];
    session.golfers = [];
    const selfGolfer =
      (Array.isArray(golferPayload.golfers) && golferPayload.golfers[0]) ||
      scoresPayload.golfer ||
      null;

    renderStats(selfGolfer, session.scores);
    renderTrendChart(session.scores);
    renderScoresTable(session.scores);
    renderMembersTable();
    renderComparisonTable();
    setStatus("Loading member list...");
    void refreshMemberList();
  } catch (error) {
    elements.statGrid.innerHTML = `
      <article class="stat-card">
        <div class="stat-label">Load Error</div>
        <div class="stat-value">--</div>
        <div class="stat-sub">${escapeHtml(error.message)}</div>
      </article>
    `;
    elements.scoresTableBody.innerHTML = "";
    elements.scoresTableBody.appendChild(elements.emptyStateTemplate.content.cloneNode(true));
    elements.membersTableBody.innerHTML = "";
    elements.membersTableBody.appendChild(elements.emptyStateTemplate.content.cloneNode(true));
    renderComparisonTable();
    elements.trendChart.innerHTML = `
      <div class="empty-state">
        <h3>GHIN request failed</h3>
        <p>${escapeHtml(error.message)}</p>
      </div>
    `;
    setStatus(error.message);
  } finally {
    elements.refreshButton.disabled = false;
    elements.refreshButton.textContent = "Refresh";
  }
}

function logout(resetForm = true) {
  session.token = "";
  session.golferId = "";
  session.golferName = "";
  session.associationId = "";
  session.backendSessionId = "";
  session.scores = [];
  session.directoryGolfers = [];
  session.golfers = [];
  session.comparisonGolfers = [];
  session.lastRoundByGolferId = {};
  document.body.classList.remove("session-active");
  elements.appShell.classList.add("hidden");
  elements.loginScreen.classList.remove("hidden");
  elements.accountChip.textContent = "Not connected";
  if (elements.appStatus) {
    elements.appStatus.textContent = "";
  }
  if (elements.memberSearchStatus) {
    elements.memberSearchStatus.textContent = "";
  }
  if (resetForm) {
    elements.loginForm.reset();
  }
}

function setLoginBusy(isBusy, label) {
  elements.loginButton.disabled = isBusy;
  elements.loginButton.textContent = label;
}

function renderStats(golfer, scores) {
  const handicap = golfer?.handicap_index ?? golfer?.display ?? "--";
  const trend = Number(golfer?.trend ?? 0);
  const lowIndex = golfer?.low_handicap_index ?? golfer?.low_hi_display ?? "--";
  const scoringAverage = scores.length
    ? average(
        scores
          .map((score) => Number(score.adjusted_gross_score ?? score.gross_score))
          .filter(Number.isFinite),
      ).toFixed(1)
    : "--";

  elements.statGrid.innerHTML = `
    <article class="stat-card">
      <div class="stat-label">Handicap Index</div>
      <div class="stat-value">${escapeHtml(String(handicap))}</div>
      <div class="stat-sub">${formatTrend(trend)}</div>
    </article>
    <article class="stat-card">
      <div class="stat-label">Low Index</div>
      <div class="stat-value">${escapeHtml(String(lowIndex))}</div>
      <div class="stat-sub">GHIN profile low</div>
    </article>
    <article class="stat-card">
      <div class="stat-label">Rounds Loaded</div>
      <div class="stat-value">${scores.length}</div>
      <div class="stat-sub">Latest 100 rounds request</div>
    </article>
    <article class="stat-card">
      <div class="stat-label">Average Score</div>
      <div class="stat-value">${scoringAverage}</div>
      <div class="stat-sub">Adjusted gross average</div>
    </article>
  `;
}

function renderScoresTable(scores) {
  if (!scores.length) {
    elements.scoresTableBody.innerHTML = "";
    elements.scoresTableBody.appendChild(elements.emptyStateTemplate.content.cloneNode(true));
    return;
  }

  elements.scoresTableBody.innerHTML = scores
    .map((score) => {
      const playedAt = score.played_at || score.score_day_1 || score.date_played || "";
      const courseName = score.course_name || score.facility_name || "Unknown";
      const teeName = score.tee_name || "—";
      const gross = score.adjusted_gross_score || score.gross_score || "—";
      const differential =
        score.differential !== null && score.differential !== undefined
          ? Number(score.differential).toFixed(1)
          : "—";
      const type = score.score_type || score.type || "—";
      return `
        <tr>
          <td>${escapeHtml(formatDate(playedAt))}</td>
          <td>${escapeHtml(courseName)}</td>
          <td>${escapeHtml(teeName)}</td>
          <td>${escapeHtml(String(gross))}</td>
          <td><span class="pill">${escapeHtml(String(differential))}</span></td>
          <td>${escapeHtml(type)}</td>
        </tr>
      `;
    })
    .join("");
}

function renderMembersTable() {
  if (!session.golfers.length) {
    elements.membersTableBody.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="empty-state">
            <h3>No golfers loaded</h3>
            <p>Search by name or GHIN number to find golfers you want to compare.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  elements.membersTableBody.innerHTML = session.golfers
    .map((golfer) => {
      const name = `${golfer.first_name || ""} ${golfer.last_name || ""}`.trim() || golfer.player_name || "Unknown";
      const index = golfer.handicap_index ?? golfer.display ?? "—";
      const golferId = String(golfer.ghin_number || golfer.id || "");
      const lastRoundPosted = getLastRoundPosted(golfer);
      const alreadyAdded = session.comparisonGolfers.some(
        (savedGolfer) => String(savedGolfer.ghin_number || savedGolfer.id || "") === golferId,
      );
      return `
        <tr>
          <td>${escapeHtml(name)}</td>
          <td>${escapeHtml(golferId || "—")}</td>
          <td><span class="pill">${escapeHtml(String(index))}</span></td>
          <td>${formatTrend(Number(golfer.trend ?? 0))}</td>
          <td>${escapeHtml(lastRoundPosted)}</td>
          <td>${escapeHtml(golfer.club_name || golfer.golf_association_name || "—")}</td>
          <td>
            <button class="button ghost compare-button" type="button" data-action="add-compare" data-ghin="${escapeHtml(golferId)}" ${alreadyAdded ? "disabled" : ""}>
              ${alreadyAdded ? "Added" : "Add"}
            </button>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderComparisonTable() {
  if (!session.comparisonGolfers.length) {
    elements.comparisonTableBody.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="empty-state">
            <h3>No comparison golfers yet</h3>
            <p>Search for a golfer above and add them here to compare handicap and trend.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  elements.comparisonTableBody.innerHTML = session.comparisonGolfers
    .map((golfer) => {
      const name = `${golfer.first_name || ""} ${golfer.last_name || ""}`.trim() || golfer.player_name || "Unknown";
      const golferId = String(golfer.ghin_number || golfer.id || "");
      const index = golfer.handicap_index ?? golfer.display ?? "—";
      const lastRoundPosted = getLastRoundPosted(golfer);
      return `
        <tr>
          <td>${escapeHtml(name)}</td>
          <td>${escapeHtml(golferId || "—")}</td>
          <td><span class="pill">${escapeHtml(String(index))}</span></td>
          <td>${formatTrend(Number(golfer.trend ?? 0))}</td>
          <td>${escapeHtml(lastRoundPosted)}</td>
          <td>${escapeHtml(golfer.club_name || golfer.golf_association_name || "—")}</td>
          <td>
            <button class="button ghost compare-button" type="button" data-action="remove-compare" data-ghin="${escapeHtml(golferId)}">
              Remove
            </button>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderTrendChart(scores) {
  const differentials = scores
    .slice()
    .reverse()
    .map((score) => ({
      label: formatDate(score.played_at || score.score_day_1 || score.date_played || ""),
      value: Number(score.differential),
    }))
    .filter((entry) => Number.isFinite(entry.value));

  if (!differentials.length) {
    elements.trendChart.innerHTML = `
      <div class="empty-state">
        <h3>No differential history</h3>
        <p>GHIN did not return differential values for this session.</p>
      </div>
    `;
    return;
  }

  const indexSeries = differentials.map((_, index) => {
    const window = differentials.slice(Math.max(0, index - 19), index + 1).map((entry) => entry.value);
    const best = window.slice().sort((a, b) => a - b).slice(0, Math.min(8, window.length));
    return {
      label: differentials[index].label,
      value: Number((average(best) * 0.96).toFixed(1)),
    };
  });

  const combined = [...differentials.map((item) => item.value), ...indexSeries.map((item) => item.value)];
  const min = Math.min(...combined);
  const max = Math.max(...combined);
  const padding = min === max ? 1 : (max - min) * 0.15;
  const chartMin = min - padding;
  const chartMax = max + padding;
  const width = 980;
  const height = 340;
  const inner = { left: 48, right: 16, top: 18, bottom: 36 };
  const plotWidth = width - inner.left - inner.right;
  const plotHeight = height - inner.top - inner.bottom;

  const lines = [
    buildPolyline(differentials, "#c9a84c", inner, plotWidth, plotHeight, chartMin, chartMax),
    buildPolyline(indexSeries, "#2d6a4f", inner, plotWidth, plotHeight, chartMin, chartMax),
  ];

  const ticks = Array.from({ length: 5 }, (_, index) => {
    const value = chartMin + ((chartMax - chartMin) / 4) * index;
    const y = inner.top + (1 - index / 4) * plotHeight;
    return `
      <g>
        <line x1="${inner.left}" x2="${width - inner.right}" y1="${y}" y2="${y}" stroke="rgba(26,58,42,0.12)" />
        <text x="8" y="${y + 4}" font-size="12" fill="#677162">${value.toFixed(1)}</text>
      </g>
    `;
  }).join("");

  elements.trendChart.innerHTML = `
    <div class="chart-shell">
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="GHIN trend chart">
        ${ticks}
        ${lines.join("")}
      </svg>
      <div class="form-row">
        <span class="pill">Gold: score differential</span>
        <span class="pill">Green: estimated handicap trend</span>
      </div>
    </div>
  `;
}

function buildPolyline(series, color, inner, plotWidth, plotHeight, min, max) {
  const points = series.map((item, index) => {
    const x = inner.left + (index / Math.max(series.length - 1, 1)) * plotWidth;
    const y = inner.top + (1 - (item.value - min) / (max - min || 1)) * plotHeight;
    return { ...item, x, y };
  });

  return `
    <polyline
      fill="none"
      stroke="${color}"
      stroke-width="3"
      stroke-linecap="round"
      stroke-linejoin="round"
      points="${points.map((point) => `${point.x},${point.y}`).join(" ")}"
    />
    ${points
      .map(
        (point) => `
          <circle cx="${point.x}" cy="${point.y}" r="4" fill="${color}">
            <title>${point.label}: ${point.value.toFixed(1)}</title>
          </circle>
        `,
      )
      .join("")}
  `;
}

async function ghinFetch(url, label = "GHIN request") {
  if (!session.token) {
    throw new Error("No GHIN token is available.");
  }

  return ghinFetchWithFallback(url, label);
}

async function fetchScores(golferId, options = {}) {
  if (!options.silent) {
    setStatus("Loading score history...");
  }
  const today = new Date();
  const from = new Date(today);
  from.setFullYear(today.getFullYear() - 3);
  const perPage = options.perPage || 100;
  const searchUrl =
    `${API_BASE}/scores/search.json?per_page=${perPage}&page=1` +
    `&golfer_id=${encodeURIComponent(golferId)}` +
    `&from_date_played=${formatApiDate(from)}` +
    `&to_date_played=${formatApiDate(today)}`;
  try {
    return await ghinFetch(searchUrl, "score history");
  } catch (error) {
    const fallbackUrl = `${API_BASE}/golfers/${encodeURIComponent(golferId)}/scores.json?per_page=${perPage}&page=1`;
    return ghinFetch(fallbackUrl, "score history fallback");
  }
}

async function fetchGolfers() {
  const primaryUrl = `${API_BASE}/golfers.json?per_page=200&page=1`;
  try {
    return await ghinFetch(primaryUrl, "member list");
  } catch (error) {
    return { golfers: [] };
  }
}

async function refreshMemberList() {
  try {
    const golfersPayload = await withTimeout(fetchGolfers(), 8000, "member list");
    session.directoryGolfers = Array.isArray(golfersPayload.golfers) ? golfersPayload.golfers : [];
    session.golfers = session.directoryGolfers;
    renderMembersTable();
    renderComparisonTable();
    elements.memberSearchStatus.textContent = session.directoryGolfers.length
      ? `Loaded ${session.directoryGolfers.length} club golfers for last-name search.`
      : "Club member list was empty, so last-name search may not work right now.";
    if (!elements.memberSearch.value.trim()) {
      setStatus("");
    }
  } catch (error) {
    session.directoryGolfers = [];
    session.golfers = [];
    renderMembersTable();
    renderComparisonTable();
    elements.memberSearchStatus.textContent =
      "Club member list was unavailable from GHIN, so last-name search may not work in this browser session.";
    setStatus("Member list unavailable right now");
  }
}

function handleMemberSearchKeydown(event) {
  if (event.key === "Enter") {
    event.preventDefault();
    handleMemberSearch();
  }
}

async function handleMemberSearch() {
  const query = elements.memberSearch.value.trim();
  if (!query) {
    elements.memberSearchStatus.textContent = "Enter a golfer name or GHIN number.";
    return;
  }

  elements.memberSearchButton.disabled = true;
  elements.memberSearchButton.textContent = "Searching...";
  elements.memberSearchStatus.textContent = `Searching for "${query}"...`;

  try {
    const golfers = await searchGolfers(query);
    session.golfers = await enrichGolfersWithLastRoundPosted(dedupeGolfers(golfers));
    renderMembersTable();
    renderComparisonTable();
    elements.memberSearchStatus.textContent = session.golfers.length
      ? `Found ${session.golfers.length} golfer${session.golfers.length === 1 ? "" : "s"}.`
      : "No golfers found for that search.";
  } catch (error) {
    session.golfers = [];
    renderMembersTable();
    elements.memberSearchStatus.textContent = error.message;
  } finally {
    elements.memberSearchButton.disabled = false;
    elements.memberSearchButton.textContent = "Search";
  }
}

async function searchGolfers(query) {
  const trimmed = query.trim();
  if (session.backendSessionId && BACKEND_BASE_URL) {
    return searchGolfersViaBackend(trimmed);
  }

  const localMatches = findLocalLastNameMatches(trimmed);
  if (localMatches.length) {
    return localMatches;
  }

  const attempts = [];
  const associationSuffix = session.associationId
    ? `&association_id=${encodeURIComponent(session.associationId)}`
    : "";

  if (/^\d+$/.test(trimmed)) {
    attempts.push(
      `${API_BASE}/golfers/search.json?per_page=25&page=1&golfer_id=${encodeURIComponent(trimmed)}&sorting_criteria=id&order=ASC&status=Active${associationSuffix}`,
    );
    attempts.push(
      `${API_BASE}/golfers/search.json?per_page=25&page=1&ghin_number=${encodeURIComponent(trimmed)}&sorting_criteria=id&order=ASC&status=Active${associationSuffix}`,
    );
    attempts.push(
      `${API2_BASE}/golfers/search.json?per_page=25&page=1&golfer_id=${encodeURIComponent(trimmed)}${associationSuffix}`,
    );
    attempts.push(
      `${API2_BASE}/golfers/search.json?per_page=25&page=1&ghin_number=${encodeURIComponent(trimmed)}${associationSuffix}`,
    );
  } else {
    attempts.push(
      `${API_BASE}/golfers/search.json?per_page=25&page=1&last_name=${encodeURIComponent(trimmed)}&sorting_criteria=id&order=ASC&status=Active${associationSuffix}`,
    );
    attempts.push(
      `${API_BASE}/golfers/search.json?per_page=25&page=1&search=${encodeURIComponent(trimmed)}${associationSuffix}`,
    );
    attempts.push(
      `${API_BASE}/golfers/search.json?per_page=25&page=1&golfer_name=${encodeURIComponent(trimmed)}${associationSuffix}`,
    );
    attempts.push(
      `${API_BASE}/golfers/search.json?per_page=25&page=1&last_name=${encodeURIComponent(trimmed)}${associationSuffix}`,
    );
    attempts.push(
      `${API_BASE}/golfers/search.json?per_page=25&page=1&q=${encodeURIComponent(trimmed)}${associationSuffix}`,
    );
    attempts.push(
      `${API2_BASE}/golfers/search.json?per_page=25&page=1&last_name=${encodeURIComponent(trimmed)}${associationSuffix}`,
    );
    attempts.push(
      `${API2_BASE}/golfers/search.json?per_page=25&page=1&search=${encodeURIComponent(trimmed)}${associationSuffix}`,
    );
    attempts.push(
      `${API2_BASE}/golfers/search.json?per_page=25&page=1&golfer_name=${encodeURIComponent(trimmed)}${associationSuffix}`,
    );
    attempts.push(
      `${API2_BASE}/golfers/search.json?per_page=25&page=1&q=${encodeURIComponent(trimmed)}${associationSuffix}`,
    );
  }

  let lastError = null;
  for (const url of attempts) {
    try {
      const payload = await withTimeout(ghinFetch(url, "golfer search"), 8000, "golfer search");
      const golfers = normalizeGolfers(payload);
      if (golfers.length) {
        return golfers;
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    if (lastError.message.includes("Invalid token")) {
      throw new Error("Last-name search is still failing in GHIN. Exact GHIN number search works best right now.");
    }
    throw new Error(`Golfer search failed: ${lastError.message}`);
  }
  return [];
}

function findLocalLastNameMatches(query) {
  if (!query || /^\d+$/.test(query) || !session.directoryGolfers.length) {
    return [];
  }

  const normalizedQuery = normalizeName(query);
  return session.directoryGolfers.filter((golfer) => {
    const lastName = normalizeName(golfer.last_name || "");
    const fullName = normalizeName(
      `${golfer.first_name || ""} ${golfer.last_name || ""}`.trim() || golfer.player_name || "",
    );
    return lastName.startsWith(normalizedQuery) || fullName.includes(normalizedQuery);
  });
}

function normalizeGolfers(payload) {
  if (Array.isArray(payload?.golfers)) {
    return payload.golfers;
  }
  if (Array.isArray(payload?.Golfers)) {
    return payload.Golfers;
  }
  if (payload?.golfer) {
    return [payload.golfer];
  }
  return [];
}

function getLastRoundPosted(golfer) {
  if (golfer.backend_last_round_posted) {
    return formatDate(golfer.backend_last_round_posted);
  }
  const golferId = String(golfer.ghin_number || golfer.id || "");
  if (golferId && session.lastRoundByGolferId[golferId]) {
    return session.lastRoundByGolferId[golferId];
  }

  const value =
    golfer.last_round_posted_at ||
    golfer.last_round_posted_date ||
    golfer.latest_score_date ||
    golfer.last_score_date ||
    golfer.most_recent_round_date ||
    golfer.recent_score_date ||
    golfer.updated_at ||
    "";
  return value ? formatDate(value) : "—";
}

async function enrichGolfersWithLastRoundPosted(golfers) {
  return Promise.all(
    golfers.map(async (golfer) => {
      const golferId = String(golfer.ghin_number || golfer.id || "");
      if (!golferId || session.lastRoundByGolferId[golferId]) {
        return golfer;
      }

      try {
        const payload = await withTimeout(fetchScores(golferId, { silent: true, perPage: 10 }), 8000, "last round");
        const scores = extractScores(payload);
        const latestRound = getLatestRoundDate(scores);
        if (latestRound) {
          session.lastRoundByGolferId[golferId] = formatDate(latestRound);
        } else {
          session.lastRoundByGolferId[golferId] = "No rounds returned";
        }
      } catch (error) {
        session.lastRoundByGolferId[golferId] = "GHIN blocked";
      }

      return golfer;
    }),
  );
}

function getLatestRoundDate(scores) {
  const dates = scores
    .map((score) => score.played_at || score.score_day_1 || score.date_played || "")
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((value) => !Number.isNaN(value.getTime()));

  if (!dates.length) {
    return "";
  }

  return new Date(Math.max(...dates.map((date) => date.getTime()))).toISOString();
}

function normalizeName(value) {
  return String(value).trim().toLowerCase();
}

function dedupeGolfers(golfers) {
  const seen = new Set();
  return golfers.filter((golfer) => {
    const key = String(golfer.ghin_number || golfer.id || `${golfer.first_name}-${golfer.last_name}`);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function handleMembersTableClick(event) {
  const button = event.target.closest("button[data-action='add-compare']");
  if (!button) {
    return;
  }

  const golferId = button.dataset.ghin;
  const golfer = session.golfers.find(
    (candidate) => String(candidate.ghin_number || candidate.id || "") === golferId,
  );

  if (!golfer) {
    return;
  }

  session.comparisonGolfers = dedupeGolfers([...session.comparisonGolfers, golfer]);
  renderMembersTable();
  renderComparisonTable();
}

function handleComparisonTableClick(event) {
  const button = event.target.closest("button[data-action='remove-compare']");
  if (!button) {
    return;
  }

  const golferId = button.dataset.ghin;
  session.comparisonGolfers = session.comparisonGolfers.filter(
    (golfer) => String(golfer.ghin_number || golfer.id || "") !== golferId,
  );
  renderMembersTable();
  renderComparisonTable();
}

async function ghinFetchWithFallback(url, label = "GHIN request") {
  const attempts = [
    {
      name: "Bearer",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${session.token}`,
      },
    },
    {
      name: "Token",
      headers: {
        Accept: "application/json",
        Authorization: `Token token="${session.token}"`,
      },
    },
  ];

  let lastError = null;

  for (const attempt of attempts) {
    try {
      return await fetchJson(url, { headers: attempt.headers });
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`${label}: ${lastError?.message || "Request failed"}`);
}

function extractScores(payload) {
  if (Array.isArray(payload.scores)) {
    return payload.scores;
  }
  if (Array.isArray(payload.Scores)) {
    return payload.Scores;
  }
  return [];
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const isJson = response.headers.get("content-type")?.includes("application/json");
    const payload = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      const message =
        typeof payload === "object" && payload
          ? payload.message || payload.error || `Request to ${url} failed with ${response.status}`
          : `Request to ${url} failed with ${response.status}`;
      throw new Error(message);
    }

    return payload;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Request to ${url} timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds`);
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function withTimeout(promise, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs / 1000} seconds`));
    }, timeoutMs);

    promise
      .then((value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      });
  });
}

function setStatus(message) {
  elements.loginStatus.textContent = message;
  if (elements.appStatus) {
    elements.appStatus.textContent = session.token ? message : "";
  }
}

function formatDate(value) {
  if (!value) {
    return "—";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatApiDate(value) {
  return value.toISOString().slice(0, 10);
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatTrend(value) {
  if (!Number.isFinite(value) || value === 0) {
    return '<span>Flat</span>';
  }
  if (value > 0) {
    return `<span class="trend-up">Up ${value.toFixed(1)}</span>`;
  }
  return `<span class="trend-down">Down ${Math.abs(value).toFixed(1)}</span>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function connectLookupBackend(username, password) {
  if (!BACKEND_BASE_URL) {
    elements.memberSearchStatus.textContent =
      "Lookup backend not configured yet. Exact GHIN number browser lookup remains available.";
    return;
  }

  try {
    const payload = await fetchJson(`${BACKEND_BASE_URL}/api/ghin/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({ username, password }),
    });

    session.backendSessionId = String(payload.session_id || "");
    if (!session.backendSessionId) {
      throw new Error("Backend did not return a session id.");
    }

    if (Number(payload.directory_count) > 0) {
      elements.memberSearchStatus.textContent = `Lookup backend connected. Loaded ${payload.directory_count} club golfers for last-name search.`;
      return;
    }

    elements.memberSearchStatus.textContent =
      "Lookup backend connected, but GHIN returned an empty club directory for this account.";
  } catch (error) {
    session.backendSessionId = "";
    elements.memberSearchStatus.textContent = `Lookup backend unavailable: ${error.message}`;
  }
}

async function searchGolfersViaBackend(query) {
  const payload = await fetchJson(`${BACKEND_BASE_URL}/api/ghin/search-golfers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      session_id: session.backendSessionId,
      query,
    }),
  });

  const golfers = normalizeGolfers(payload);
  const diagnostics = payload.diagnostics || {};
  if (!golfers.length && diagnostics.search_error) {
    if (
      diagnostics.search_error.includes("golfer_id, last_name and state") ||
      diagnostics.search_error.includes("last_name and association_id") ||
      diagnostics.search_error.includes("last_name and country")
    ) {
      throw new Error(
        "GHIN needs more-specific last-name search filters for this account. Exact GHIN number search still works best right now.",
      );
    }
    throw new Error(`Lookup backend: ${diagnostics.search_error}`);
  }
  return golfers;
}
