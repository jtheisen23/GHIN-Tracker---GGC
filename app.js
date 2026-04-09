const LOGIN_URL = "https://api2.ghin.com/api/v1/golfer_login.json";
const API_BASE = "https://api.ghin.com/api/v1";

const session = {
  token: "",
  golferId: "",
  golferName: "",
  scores: [],
  golfers: [],
};

const elements = {
  loginScreen: document.querySelector("#loginScreen"),
  appShell: document.querySelector("#appShell"),
  loginForm: document.querySelector("#loginForm"),
  loginButton: document.querySelector("#loginButton"),
  loginStatus: document.querySelector("#loginStatus"),
  accountChip: document.querySelector("#accountChip"),
  refreshButton: document.querySelector("#refreshButton"),
  logoutButton: document.querySelector("#logoutButton"),
  statGrid: document.querySelector("#statGrid"),
  trendChart: document.querySelector("#trendChart"),
  scoresTableBody: document.querySelector("#scoresTableBody"),
  membersTableBody: document.querySelector("#membersTableBody"),
  memberSearch: document.querySelector("#memberSearch"),
  emptyStateTemplate: document.querySelector("#emptyStateTemplate"),
};

bindEvents();

function bindEvents() {
  elements.loginForm.addEventListener("submit", handleLogin);
  elements.refreshButton.addEventListener("click", refreshAllData);
  elements.logoutButton.addEventListener("click", logout);
  elements.memberSearch.addEventListener("input", renderMembersTable);
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

    if (!session.golferId) {
      throw new Error("Could not determine your GHIN player id from the login response.");
    }

    elements.accountChip.textContent = session.golferName;
    elements.loginScreen.classList.add("hidden");
    elements.appShell.classList.remove("hidden");
    await refreshAllData();
    elements.loginStatus.textContent = "";
  } catch (error) {
    elements.loginStatus.textContent = error.message;
    logout(false);
  } finally {
    setLoginBusy(false, "Connect GHIN");
  }
}

async function refreshAllData() {
  if (!session.token || !session.golferId) {
    return;
  }

  elements.refreshButton.disabled = true;
  elements.refreshButton.textContent = "Refreshing...";

  try {
    const [scoresPayload, golferPayload, golfersPayload] = await Promise.all([
      ghinFetch(`${API_BASE}/golfers/${encodeURIComponent(session.golferId)}/scores.json?per_page=100&page=1`),
      ghinFetch(
        `${API_BASE}/golfers/search.json?per_page=1&page=1&golfer_id=${encodeURIComponent(session.golferId)}`,
      ),
      ghinFetch(`${API_BASE}/golfers.json?per_page=200&page=1`),
    ]);

    session.scores = Array.isArray(scoresPayload.scores) ? scoresPayload.scores : [];
    session.golfers = Array.isArray(golfersPayload.golfers) ? golfersPayload.golfers : [];
    const selfGolfer =
      (Array.isArray(golferPayload.golfers) && golferPayload.golfers[0]) ||
      scoresPayload.golfer ||
      null;

    renderStats(selfGolfer, session.scores);
    renderTrendChart(session.scores);
    renderScoresTable(session.scores);
    renderMembersTable();
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
    elements.trendChart.innerHTML = `
      <div class="empty-state">
        <h3>GHIN request failed</h3>
        <p>${escapeHtml(error.message)}</p>
      </div>
    `;
  } finally {
    elements.refreshButton.disabled = false;
    elements.refreshButton.textContent = "Refresh";
  }
}

function logout(resetForm = true) {
  session.token = "";
  session.golferId = "";
  session.golferName = "";
  session.scores = [];
  session.golfers = [];
  elements.appShell.classList.add("hidden");
  elements.loginScreen.classList.remove("hidden");
  elements.accountChip.textContent = "Not connected";
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
  const query = elements.memberSearch.value.trim().toLowerCase();
  const filtered = session.golfers.filter((golfer) => {
    if (!query) {
      return true;
    }
    const name = `${golfer.first_name || ""} ${golfer.last_name || ""}`.trim().toLowerCase();
    const ghin = String(golfer.ghin_number || golfer.id || "").toLowerCase();
    return name.includes(query) || ghin.includes(query);
  });

  if (!filtered.length) {
    elements.membersTableBody.innerHTML = `
      <tr>
        <td colspan="5">
          <div class="empty-state">
            <h3>No matching golfers</h3>
            <p>Try a different search or refresh your GHIN session.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  elements.membersTableBody.innerHTML = filtered
    .map((golfer) => {
      const name = `${golfer.first_name || ""} ${golfer.last_name || ""}`.trim() || golfer.player_name || "Unknown";
      const index = golfer.handicap_index ?? golfer.display ?? "—";
      return `
        <tr>
          <td>${escapeHtml(name)}</td>
          <td>${escapeHtml(String(golfer.ghin_number || golfer.id || "—"))}</td>
          <td><span class="pill">${escapeHtml(String(index))}</span></td>
          <td>${formatTrend(Number(golfer.trend ?? 0))}</td>
          <td>${escapeHtml(golfer.club_name || golfer.golf_association_name || "—")}</td>
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

async function ghinFetch(url) {
  if (!session.token) {
    throw new Error("No GHIN token is available.");
  }

  return fetchJson(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${session.token}`,
    },
  });
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const message =
      typeof payload === "object" && payload
        ? payload.message || payload.error || `Request failed with ${response.status}`
        : `Request failed with ${response.status}`;
    throw new Error(message);
  }

  return payload;
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
