const STORAGE_KEY = "ggc-handicap-tracker-v1";

const defaultState = {
  course: {
    name: "GGC",
    teeName: "Member Tees",
    rating: 71.2,
    slope: 129,
    par: 72,
  },
  players: [],
  rounds: [],
};

const state = loadState();

const elements = {
  courseForm: document.querySelector("#courseForm"),
  playerForm: document.querySelector("#playerForm"),
  roundForm: document.querySelector("#roundForm"),
  bulkImportForm: document.querySelector("#bulkImportForm"),
  roundPlayerSelect: document.querySelector("#roundPlayerSelect"),
  bulkImportPlayerSelect: document.querySelector("#bulkImportPlayerSelect"),
  playerCards: document.querySelector("#playerCards"),
  roundTableBody: document.querySelector("#roundTableBody"),
  trendChart: document.querySelector("#trendChart"),
  metricSelect: document.querySelector("#metricSelect"),
  exportButton: document.querySelector("#exportButton"),
  importInput: document.querySelector("#importInput"),
  seedDataButton: document.querySelector("#seedDataButton"),
  emptyStateTemplate: document.querySelector("#emptyStateTemplate"),
  heroPlayers: document.querySelector("#heroPlayers"),
  heroRounds: document.querySelector("#heroRounds"),
  heroCourse: document.querySelector("#heroCourse"),
  bulkImportStatus: document.querySelector("#bulkImportStatus"),
};

hydrateForms();
bindEvents();
render();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return structuredClone(defaultState);
    }
    const parsed = JSON.parse(raw);
    return {
      course: { ...defaultState.course, ...parsed.course },
      players: Array.isArray(parsed.players) ? parsed.players : [],
      rounds: Array.isArray(parsed.rounds) ? parsed.rounds : [],
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function bindEvents() {
  elements.courseForm.addEventListener("submit", handleCourseSubmit);
  elements.playerForm.addEventListener("submit", handlePlayerSubmit);
  elements.roundForm.addEventListener("submit", handleRoundSubmit);
  elements.bulkImportForm.addEventListener("submit", handleBulkImportSubmit);
  elements.metricSelect.addEventListener("change", renderTrendChart);
  elements.exportButton.addEventListener("click", exportData);
  elements.importInput.addEventListener("change", importData);
  elements.seedDataButton.addEventListener("click", seedSampleData);
}

function hydrateForms() {
  getField(elements.courseForm, "name").value = state.course.name;
  getField(elements.courseForm, "teeName").value = state.course.teeName;
  getField(elements.courseForm, "rating").value = state.course.rating;
  getField(elements.courseForm, "slope").value = state.course.slope;
  getField(elements.courseForm, "par").value = state.course.par;
  getField(elements.roundForm, "date").value = new Date().toISOString().slice(0, 10);
  syncRoundDefaults();
}

function syncRoundDefaults() {
  getField(elements.roundForm, "rating").value = state.course.rating;
  getField(elements.roundForm, "slope").value = state.course.slope;
  getField(elements.roundForm, "par").value = state.course.par;
  getField(elements.bulkImportForm, "rating").value = state.course.rating;
  getField(elements.bulkImportForm, "slope").value = state.course.slope;
  getField(elements.bulkImportForm, "par").value = state.course.par;
  getField(elements.bulkImportForm, "pcc").value = 0;
}

function handleCourseSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  state.course = {
    name: formData.get("name").toString().trim(),
    teeName: formData.get("teeName").toString().trim(),
    rating: Number(formData.get("rating")),
    slope: Number(formData.get("slope")),
    par: Number(formData.get("par")),
  };
  saveState();
  syncRoundDefaults();
  render();
}

function handlePlayerSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const name = formData.get("name").toString().trim();
  if (!name) {
    return;
  }
  state.players.push({
    id: crypto.randomUUID(),
    name,
    color: formData.get("color").toString(),
    createdAt: new Date().toISOString(),
  });
  saveState();
  event.currentTarget.reset();
  getField(event.currentTarget, "color").value = "#0f766e";
  render();
}

function handleRoundSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  state.rounds.push(
    createRoundRecord({
      playerId: formData.get("playerId").toString(),
      date: formData.get("date").toString(),
      score: Number(formData.get("score")),
      rating: Number(formData.get("rating")),
      slope: Number(formData.get("slope")),
      par: Number(formData.get("par")),
      pcc: Number(formData.get("pcc") || 0),
      notes: formData.get("notes").toString().trim(),
    }),
  );
  persistRounds();
  event.currentTarget.reset();
  getField(event.currentTarget, "date").value = new Date().toISOString().slice(0, 10);
  syncRoundDefaults();
  render();
}

function handleBulkImportSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const defaults = {
    playerId: formData.get("playerId").toString(),
    rating: Number(formData.get("rating")),
    slope: Number(formData.get("slope")),
    par: Number(formData.get("par")),
    pcc: Number(formData.get("pcc") || 0),
  };
  const rawRounds = formData.get("rawRounds").toString();

  try {
    const importedRounds = parseBulkRounds(rawRounds, defaults);
    state.rounds.push(...importedRounds);
    persistRounds();
    getField(event.currentTarget, "rawRounds").value = "";
    elements.bulkImportStatus.textContent = `${importedRounds.length} rounds imported successfully.`;
    render();
  } catch (error) {
    elements.bulkImportStatus.textContent = error.message;
  }
}

function render() {
  renderHero();
  renderPlayerOptions();
  renderPlayerCards();
  renderRoundsTable();
  renderTrendChart();
}

function renderHero() {
  elements.heroPlayers.textContent = state.players.length;
  elements.heroRounds.textContent = state.rounds.length;
  elements.heroCourse.textContent = state.course.name || "GGC";
}

function renderPlayerOptions() {
  if (!state.players.length) {
    elements.roundPlayerSelect.innerHTML = '<option value="">Add a player first</option>';
    elements.bulkImportPlayerSelect.innerHTML = '<option value="">Add a player first</option>';
    return;
  }

  const options = state.players
    .map((player) => `<option value="${player.id}">${player.name}</option>`)
    .join("");
  elements.roundPlayerSelect.innerHTML = options;
  elements.bulkImportPlayerSelect.innerHTML = options;
}

function renderPlayerCards() {
  if (!state.players.length) {
    elements.playerCards.innerHTML = "";
    elements.playerCards.appendChild(elements.emptyStateTemplate.content.cloneNode(true));
    return;
  }

  elements.playerCards.innerHTML = state.players
    .map((player) => {
      const rounds = getRoundsForPlayer(player.id);
      const latestRound = rounds.at(-1);
      const index = calculateHandicapIndex(rounds);
      const courseHandicap = calculateCourseHandicap(index, state.course);
      const scoringAverage = rounds.length
        ? average(rounds.map((round) => round.score)).toFixed(1)
        : "--";
      const bestDifferential = rounds.length
        ? Math.min(...rounds.map((round) => calculateDifferential(round))).toFixed(1)
        : "--";

      return `
        <article class="player-card" style="--player-color: ${player.color}">
          <h3>${player.name}</h3>
          <div class="metric-row">
            <span class="metric-label">Handicap Index</span>
            <span class="metric-value">${formatNumber(index)}</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Course Handicap</span>
            <span class="metric-value">${formatNumber(courseHandicap, 0)}</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Scoring Average</span>
            <span class="metric-value">${scoringAverage}</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Best Differential</span>
            <span class="metric-value">${bestDifferential}</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Last Round</span>
            <span class="metric-value">${latestRound ? `${latestRound.score} on ${formatDate(latestRound.date)}` : "No rounds"}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderRoundsTable() {
  const enrichedRounds = [...state.rounds]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 18)
    .map((round) => {
      const player = state.players.find((entry) => entry.id === round.playerId);
      return {
        ...round,
        playerName: player ? player.name : "Unknown",
        differential: calculateDifferential(round),
      };
    });

  if (!enrichedRounds.length) {
    elements.roundTableBody.innerHTML = `
      <tr>
        <td colspan="6">
          <div class="empty-state">
            <h3>No rounds yet</h3>
            <p>Use the score form above to start building your history.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  elements.roundTableBody.innerHTML = enrichedRounds
    .map(
      (round) => `
        <tr>
          <td>${formatDate(round.date)}</td>
          <td>${round.playerName}</td>
          <td>${round.score}</td>
          <td>${formatToPar(round.score - round.par)}</td>
          <td>${formatNumber(round.differential)}</td>
          <td>${round.notes || "—"}</td>
        </tr>
      `,
    )
    .join("");
}

function renderTrendChart() {
  const metric = elements.metricSelect.value;
  const series = state.players
    .map((player) => ({
      player,
      values: buildSeriesForMetric(player.id, metric),
    }))
    .filter((entry) => entry.values.length >= 2);

  if (!series.length) {
    elements.trendChart.innerHTML = "";
    elements.trendChart.appendChild(elements.emptyStateTemplate.content.cloneNode(true));
    return;
  }

  const allValues = series.flatMap((entry) => entry.values.map((point) => point.value));
  const minValue = Math.min(...allValues);
  const maxValue = Math.max(...allValues);
  const padding = minValue === maxValue ? 1 : (maxValue - minValue) * 0.15;
  const chartMin = minValue - padding;
  const chartMax = maxValue + padding;
  const width = 980;
  const height = 360;
  const inner = { left: 48, right: 16, top: 18, bottom: 38 };
  const plotWidth = width - inner.left - inner.right;
  const plotHeight = height - inner.top - inner.bottom;

  const svgLines = [];

  for (const entry of series) {
    const points = entry.values.map((point, index) => {
      const x = inner.left + (index / Math.max(entry.values.length - 1, 1)) * plotWidth;
      const y = inner.top + (1 - (point.value - chartMin) / (chartMax - chartMin || 1)) * plotHeight;
      return { x, y, label: point.label, value: point.value };
    });

    svgLines.push(`
      <polyline
        fill="none"
        stroke="${entry.player.color}"
        stroke-width="3"
        points="${points.map((point) => `${point.x},${point.y}`).join(" ")}"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    `);

    svgLines.push(
      ...points.map(
        (point) => `
          <circle cx="${point.x}" cy="${point.y}" r="4.5" fill="${entry.player.color}">
            <title>${entry.player.name}: ${formatNumber(point.value)} on ${point.label}</title>
          </circle>
        `,
      ),
    );
  }

  const yTicks = Array.from({ length: 5 }, (_, index) => {
    const value = chartMin + ((chartMax - chartMin) / 4) * index;
    const y = inner.top + (1 - index / 4) * plotHeight;
    return `
      <g>
        <line x1="${inner.left}" x2="${width - inner.right}" y1="${y}" y2="${y}" stroke="rgba(31, 41, 55, 0.12)" />
        <text x="8" y="${y + 4}" font-size="12" fill="#6b7280">${formatNumber(value)}</text>
      </g>
    `;
  });

  elements.trendChart.innerHTML = `
    <div class="chart-shell">
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${metric} trend chart">
        ${yTicks.join("")}
        ${svgLines.join("")}
      </svg>
      <div class="chart-legend">
        ${series
          .map(
            (entry) => `
              <div class="legend-item">
                <span class="legend-chip" style="background:${entry.player.color}"></span>
                <span>${entry.player.name}</span>
              </div>
            `,
          )
          .join("")}
      </div>
    </div>
  `;
}

function buildSeriesForMetric(playerId, metric) {
  const rounds = getRoundsForPlayer(playerId);
  if (!rounds.length) {
    return [];
  }

  if (metric === "score") {
    return rounds.map((round) => ({
      label: formatDate(round.date),
      value: round.score,
    }));
  }

  if (metric === "differential") {
    return rounds.map((round) => ({
      label: formatDate(round.date),
      value: calculateDifferential(round),
    }));
  }

  return rounds.map((round, index) => {
    const indexValue = calculateHandicapIndex(rounds.slice(0, index + 1));
    return {
      label: formatDate(round.date),
      value: Number.isFinite(indexValue) ? indexValue : 0,
    };
  });
}

function getRoundsForPlayer(playerId) {
  return state.rounds
    .filter((round) => round.playerId === playerId)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

function calculateDifferential(round) {
  const value = (113 / round.slope) * (round.score - round.rating - round.pcc);
  return Number(value.toFixed(1));
}

function calculateHandicapIndex(rounds) {
  if (!rounds.length) {
    return NaN;
  }
  const recentRounds = [...rounds].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 20);
  const differentials = recentRounds.map(calculateDifferential).sort((a, b) => a - b);
  const count = Math.min(8, differentials.length);
  return Number(average(differentials.slice(0, count)).toFixed(1));
}

function calculateCourseHandicap(index, course) {
  if (!Number.isFinite(index)) {
    return NaN;
  }
  return Math.round(index * (course.slope / 113) + (course.rating - course.par));
}

function createRoundRecord(round) {
  return {
    id: crypto.randomUUID(),
    playerId: round.playerId,
    date: round.date,
    score: round.score,
    rating: round.rating,
    slope: round.slope,
    par: round.par,
    pcc: round.pcc,
    notes: round.notes || "",
    courseName: state.course.name,
    teeName: state.course.teeName,
    createdAt: new Date().toISOString(),
  };
}

function persistRounds() {
  state.rounds.sort((a, b) => new Date(a.date) - new Date(b.date));
  saveState();
}

function parseBulkRounds(rawText, defaults) {
  const lines = rawText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    throw new Error("Paste at least one round to import.");
  }

  return lines.map((line, index) => {
    const parts = line
      .split(/\s*[\t|,]\s*/)
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length < 2) {
      throw new Error(`Line ${index + 1} needs at least a date and score.`);
    }

    const date = normalizeDate(parts[0]);
    const score = Number(parts[1]);
    const rating = parts[2] ? Number(parts[2]) : defaults.rating;
    const slope = parts[3] ? Number(parts[3]) : defaults.slope;
    const par = parts[4] ? Number(parts[4]) : defaults.par;
    const pcc = parts[5] ? Number(parts[5]) : defaults.pcc;
    const notes = parts.slice(6).join(", ");

    if (!date) {
      throw new Error(`Line ${index + 1} has an invalid date. Use YYYY-MM-DD or MM/DD/YYYY.`);
    }

    if (![score, rating, slope, par, pcc].every(Number.isFinite)) {
      throw new Error(`Line ${index + 1} has an invalid numeric value.`);
    }

    return createRoundRecord({
      playerId: defaults.playerId,
      date,
      score,
      rating,
      slope,
      par,
      pcc,
      notes,
    });
  });
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getField(form, name) {
  return form.elements.namedItem(name);
}

function formatDate(dateString) {
  return new Date(`${dateString}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatNumber(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : "--";
}

function formatToPar(delta) {
  if (delta === 0) {
    return "E";
  }
  return delta > 0 ? `+${delta}` : `${delta}`;
}

function normalizeDate(value) {
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return value;
  }

  const slashMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!slashMatch) {
    return "";
  }

  const month = slashMatch[1].padStart(2, "0");
  const day = slashMatch[2].padStart(2, "0");
  const rawYear = slashMatch[3];
  const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
  return `${year}-${month}-${day}`;
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "ggc-handicap-data.json";
  link.click();
  URL.revokeObjectURL(url);
}

function importData(event) {
  const [file] = event.target.files;
  if (!file) {
    return;
  }

  file
    .text()
    .then((text) => JSON.parse(text))
    .then((payload) => {
      state.course = { ...defaultState.course, ...payload.course };
      state.players = Array.isArray(payload.players) ? payload.players : [];
      state.rounds = Array.isArray(payload.rounds) ? payload.rounds : [];
      saveState();
      hydrateForms();
      render();
    })
    .catch(() => {
      window.alert("That file could not be imported. Please choose a valid JSON export.");
    })
    .finally(() => {
      event.target.value = "";
    });
}

function seedSampleData() {
  if (state.players.length || state.rounds.length) {
    const shouldReplace = window.confirm(
      "Sample data will replace the current local data in this browser. Continue?",
    );
    if (!shouldReplace) {
      return;
    }
  }

  state.course = {
    name: "GGC",
    teeName: "Blue Tees",
    rating: 71.8,
    slope: 131,
    par: 72,
  };

  const players = [
    { id: crypto.randomUUID(), name: "Jeremy", color: "#0f766e" },
    { id: crypto.randomUUID(), name: "Matt", color: "#b45309" },
    { id: crypto.randomUUID(), name: "Chris", color: "#2563eb" },
  ];

  state.players = players.map((player) => ({
    ...player,
    createdAt: new Date().toISOString(),
  }));

  state.rounds = [
    ["2026-03-01", 88, 0, "Scrappy front, solid finish"],
    ["2026-03-08", 85, 0, "Best driving day of the month"],
    ["2026-03-15", 84, 1, "Rain and soft greens"],
    ["2026-03-22", 82, 0, "Three birdies"],
    ["2026-03-29", 81, 0, "New personal best at GGC"],
  ].flatMap((template, index) => {
    return players.map((player, playerIndex) => {
      const offsets = [0, 6, 10];
      const base = template[1];
      return {
        id: crypto.randomUUID(),
        playerId: player.id,
        date: template[0],
        score: base + offsets[playerIndex] - (index > 2 && playerIndex === 2 ? 2 : 0),
        rating: 71.8,
        slope: 131,
        par: 72,
        pcc: template[2],
        notes: typeof template[3] === "string" ? template[3] : "",
        courseName: "GGC",
        teeName: "Blue Tees",
        createdAt: new Date().toISOString(),
      };
    });
  });

  saveState();
  hydrateForms();
  render();
  elements.bulkImportStatus.textContent = "Sample data loaded.";
}
