// ═══════════════════════════════════════════════════════════════════
//  Ski Stations Weather PWA
//  Mirrors: ski_stations_report.py  (March 2026)
// ═══════════════════════════════════════════════════════════════════

const DEFAULT_API_KEY = 'c422f870ff560166ebbf6f45dcef157b';

const STATIONS = {
    auron: {
        name: 'Auron',
        top:    { lat: 44.2167, lon: 6.9167, elevation: 2450 },
        bottom: { lat: 44.2333, lon: 6.9000, elevation: 1600 }
    },
    isola: {
        name: 'Isola 2000',
        top:    { lat: 44.1833, lon: 7.1500, elevation: 2600 },
        bottom: { lat: 44.1667, lon: 7.1333, elevation: 2000 }
    }
};

// ── DOM elements ──────────────────────────────────────────────────
const apiKeyInput     = document.getElementById('apiKeyInput');
const saveApiKeyBtn   = document.getElementById('saveApiKey');
const refreshBtn      = document.getElementById('refreshBtn');
const loadingEl       = document.getElementById('loading');
const errorEl         = document.getElementById('error');
const resultsEl       = document.getElementById('results');
const apiKeySectionEl = document.getElementById('apiKeySection');
const lastUpdatedEl   = document.getElementById('lastUpdated');

// ── Active API key (guard against corrupted localStorage) ─────────
let apiKey = localStorage.getItem('skiApiKey') || DEFAULT_API_KEY;
if (!apiKey || apiKey === 'undefined' || apiKey === 'null' || apiKey.trim() === '') {
    apiKey = DEFAULT_API_KEY;
    localStorage.removeItem('skiApiKey');
}

// ── Service worker ────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js')
        .then(() => console.log('Service Worker registered'))
        .catch(err => console.warn('Service Worker registration failed:', err));
}

// ── Event listeners ───────────────────────────────────────────────
if (saveApiKeyBtn) saveApiKeyBtn.addEventListener('click', handleSaveApiKey);
if (refreshBtn)    refreshBtn.addEventListener('click', fetchAllData);

// ── Start (deferred to ensure DOM is fully ready) ─────────────────
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

function init() {
    apiKeyInput.value = (apiKey && apiKey !== DEFAULT_API_KEY) ? apiKey : '';
    apiKeyInput.placeholder = `Default key pre-configured (…${DEFAULT_API_KEY.slice(-6)})`;
    fetchAllData();
}

function handleSaveApiKey() {
    const inputKey = apiKeyInput.value.trim();
    if (inputKey) {
        apiKey = inputKey;
        localStorage.setItem('skiApiKey', apiKey);
    } else {
        apiKey = DEFAULT_API_KEY;
        localStorage.removeItem('skiApiKey');
    }
    fetchAllData();
}

// ═══════════════════════════════════════════════════════════════════
//  Date / time helpers
// ═══════════════════════════════════════════════════════════════════

/** Full CET date-time string, e.g. "13/03/2026, 11:20:01 CET" */
function formatDateTimeCET(date) {
    return new Intl.DateTimeFormat('en-GB', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        timeZone: 'Europe/Paris', timeZoneName: 'short'
    }).format(date);
}

/** Short CET date-time for timeline rows, e.g. "03-13 07:00 CET" */
function formatTimelineCET(date) {
    return new Intl.DateTimeFormat('en-GB', {
        month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
        timeZone: 'Europe/Paris', timeZoneName: 'short'
    }).format(date);
}

// ═══════════════════════════════════════════════════════════════════
//  OpenWeatherMap helpers
// ═══════════════════════════════════════════════════════════════════

async function testApiKey(key) {
    try {
        const url = `https://api.openweathermap.org/data/2.5/weather` +
            `?lat=44.2167&lon=6.9167&appid=${key}&units=metric`;
        const r = await fetch(url);
        return r.status === 200;
    } catch { return false; }
}

async function fetchCurrentWeather(lat, lon) {
    const url = `https://api.openweathermap.org/data/2.5/weather` +
        `?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;
    const r = await fetch(url);
    if (!r.ok) {
        if (r.status === 401)
            throw new Error('Invalid API key. Please check your key and try again.');
        throw new Error(`OWM current weather failed (HTTP ${r.status})`);
    }
    return r.json();
}

async function fetchForecast(lat, lon) {
    const url = `https://api.openweathermap.org/data/2.5/forecast` +
        `?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;
    const r = await fetch(url);
    if (!r.ok)
        throw new Error(`OWM forecast failed (HTTP ${r.status})`);
    return r.json();
}

/** Extract snow precipitation (mm) from an OWM weather object. */
function getSnowDepth(weatherData) {
    if (weatherData && weatherData.snow) {
        return weatherData.snow['1h'] || weatherData.snow['3h'] || 0;
    }
    return 0;
}

/**
 * Return ALL forecast slots that contain rain or snow.
 * Mirrors: check_precipitation_forecast() in ski_stations_report.py
 */
function checkPrecipitationForecast(forecastData) {
    const precipTimes = [];
    if (forecastData && forecastData.list) {
        forecastData.list.forEach(item => {
            const hasRain = item.rain && Object.keys(item.rain).length > 0;
            const hasSnow = item.snow && Object.keys(item.snow).length > 0;
            if (hasRain || hasSnow) {
                precipTimes.push({
                    time:   new Date(item.dt * 1000),
                    temp:   item.main.temp,
                    rain:   hasRain,
                    snow:   hasSnow,
                    rainMm: hasRain ? (item.rain['3h'] || 0) : 0,
                    snowMm: hasSnow ? (item.snow['3h'] || 0) : 0
                });
            }
        });
    }
    return { hasPrecip: precipTimes.length > 0, precipTimes };
}

/**
 * Return forecast at target hours (8, 12, 16, 20) across ALL 5 days.
 * Mirrors: get_specific_times_forecast() in ski_stations_report.py
 */
function getSpecificTimesForecast(forecastData) {
    const TARGET_HOURS = new Set([8, 12, 16, 20]);
    const results = [];
    if (forecastData && forecastData.list) {
        forecastData.list.forEach(item => {
            const dt   = new Date(item.dt * 1000);
            const hour = dt.getUTCHours();
            if (TARGET_HOURS.has(hour)) {
                results.push({
                    time:   dt,
                    temp:   item.main.temp,
                    hour,
                    rainMm: (item.rain && item.rain['3h']) ? item.rain['3h'] : 0,
                    snowMm: (item.snow && item.snow['3h']) ? item.snow['3h'] : 0
                });
            }
        });
    }
    return results.sort((a, b) => a.time - b.time);
}

// ═══════════════════════════════════════════════════════════════════
//  Open-Meteo — freezing level (primary source)
// ═══════════════════════════════════════════════════════════════════

/**
 * Fetch hourly freezing-level altitude (m) from Open-Meteo.
 * Free, no API key, ~1-2 km NWP model.
 * Returns slots at 06h, 12h, 18h UTC for the next 5 days.
 *
 * Mirrors: get_freezing_levels_openmeteo() in ski_stations_report.py
 */
async function fetchFreezingLevelsOpenMeteo(lat, lon) {
    const url = `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${lat}&longitude=${lon}` +
        `&hourly=freezing_level_height` +
        `&wind_speed_unit=ms` +
        `&timezone=UTC` +
        `&forecast_days=5`;
    try {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data   = await r.json();
        const times  = data.hourly.time;
        const levels = data.hourly.freezing_level_height;

        const TARGET = new Set([6, 12, 18]);
        const result = [];
        times.forEach((t, i) => {
            const dt   = new Date(t + ':00Z');
            const hour = dt.getUTCHours();
            if (TARGET.has(hour) && levels[i] != null) {
                result.push({ time: dt, level: Math.round(levels[i]) });
            }
        });
        return result;
    } catch (e) {
        console.warn('Open-Meteo unavailable:', e.message);
        return [];
    }
}

/**
 * Fallback: estimate freezing level from BOTTOM station temperature.
 * Standard lapse rate: 6.5 °C / 1000 m.
 *
 * Mirrors: fallback_freezing_level() in ski_stations_report.py
 */
function fallbackFreezingLevel(tempBottom, elevBottom) {
    const lapseRate = 6.5 / 1000;
    if (tempBottom <= 0) return elevBottom;
    return Math.round(elevBottom + tempBottom / lapseRate);
}

// ═══════════════════════════════════════════════════════════════════
//  Station data assembly
// ═══════════════════════════════════════════════════════════════════

/**
 * Fetch and assemble all weather & forecast data for one station.
 * Mirrors: format_station_data() in ski_stations_report.py
 */
async function fetchStationData(stationKey) {
    const station = STATIONS[stationKey];

    const [topWeather, bottomWeather, forecast] = await Promise.all([
        fetchCurrentWeather(station.top.lat,    station.top.lon),
        fetchCurrentWeather(station.bottom.lat, station.bottom.lon),
        fetchForecast(station.top.lat, station.top.lon)
    ]);

    const data = {
        name:            station.name,
        measurementTime: topWeather.dt ? new Date(topWeather.dt * 1000) : null,
        top: {
            elevation: station.top.elevation,
            snow:      getSnowDepth(topWeather),
            temp:      topWeather.main.temp
        },
        bottom: {
            elevation: station.bottom.elevation,
            snow:      getSnowDepth(bottomWeather),
            temp:      bottomWeather.main.temp
        },
        hasPrecipitation: false,
        precipTimes:      [],
        freezingLevels:   [],
        source:           ''
    };

    // ── Precipitation forecast (OWM) ──
    const { hasPrecip, precipTimes } = checkPrecipitationForecast(forecast);
    data.hasPrecipitation = hasPrecip;
    data.precipTimes      = precipTimes;

    // ── Freezing level (Open-Meteo — primary) ──
    const omLevels = await fetchFreezingLevelsOpenMeteo(station.top.lat, station.top.lon);

    if (omLevels.length > 0) {
        data.freezingLevels = omLevels;
        data.source         = 'Open-Meteo (direct)';
    } else {
        // ── Fallback: lapse-rate estimate from bottom temperature ──
        data.source = 'Estimated (lapse rate from bottom station)';

        // Current snapshot
        if (data.bottom.temp != null) {
            data.freezingLevels.push({
                time:  new Date(),
                level: fallbackFreezingLevel(data.bottom.temp, station.bottom.elevation)
            });
        }

        // Forecast slots at target hours
        const specific = getSpecificTimesForecast(forecast);
        const elevDiff = station.top.elevation - station.bottom.elevation;
        specific.forEach(st => {
            const estBottomTemp = st.temp + (6.5 / 1000) * elevDiff;
            data.freezingLevels.push({
                time:  st.time,
                level: fallbackFreezingLevel(estBottomTemp, station.bottom.elevation)
            });
        });
    }

    return data;
}

// ═══════════════════════════════════════════════════════════════════
//  Timeline builder
// ═══════════════════════════════════════════════════════════════════

/**
 * Merge precipitation events (OWM) and freezing-level slots (Open-Meteo)
 * into a single chronological list.  Entries sharing the same hour are
 * merged into one row.
 *
 * Each entry: { time, flLevel, rainMm, snowMm, temp }
 * Mirrors: build_timeline() in ski_stations_report.py
 */
function buildTimeline(data) {
    const merged = new Map();

    const hourKey = dt => {
        const d = new Date(dt);
        d.setMinutes(0, 0, 0);
        return d.getTime();
    };

    // Freezing-level slots
    data.freezingLevels.forEach(fl => {
        const k = hourKey(fl.time);
        if (!merged.has(k))
            merged.set(k, { time: new Date(k), flLevel: null, rainMm: null, snowMm: null, temp: null });
        merged.get(k).flLevel = fl.level;
    });

    // Precipitation events
    data.precipTimes.forEach(p => {
        const k = hourKey(p.time);
        if (!merged.has(k))
            merged.set(k, { time: new Date(k), flLevel: null, rainMm: null, snowMm: null, temp: null });
        const entry = merged.get(k);
        if (p.rainMm > 0) entry.rainMm = p.rainMm;
        if (p.snowMm > 0) entry.snowMm = p.snowMm;
        entry.temp = p.temp;
    });

    return [...merged.values()].sort((a, b) => a.time - b.time);
}

// ═══════════════════════════════════════════════════════════════════
//  Main data fetch
// ═══════════════════════════════════════════════════════════════════

async function fetchAllData() {
    try {
        showLoading();
        hideError();

        const [auronData, isolaData] = await Promise.all([
            fetchStationData('auron'),
            fetchStationData('isola')
        ]);

        displayResults(auronData, isolaData);
        if (lastUpdatedEl)   lastUpdatedEl.textContent = `📅 Report Execution: ${formatDateTimeCET(new Date())}`;
        if (apiKeySectionEl) apiKeySectionEl.style.display = 'none';

    } catch (err) {
        console.error('fetchAllData error:', err);
        showError(err.message || String(err));
    } finally {
        hideLoading();
    }
}

// ═══════════════════════════════════════════════════════════════════
//  Display
// ═══════════════════════════════════════════════════════════════════

function displayResults(auronData, isolaData) {
    displayStationData('auron', auronData);
    displayStationData('isola', isolaData);
    resultsEl.style.display = 'block';
}

function displayStationData(stationKey, data) {
    // Measurement time
    const measEl = document.getElementById(`${stationKey}-measurement-time`);
    if (measEl) {
        measEl.textContent = data.measurementTime
            ? `🕐 Last OWM Measurement: ${formatDateTimeCET(data.measurementTime)}`
            : '🕐 Last OWM Measurement: No data';
    }

    // Section 1 — Top station
    const topSnowEl = document.getElementById(`${stationKey}-top-snow`);
    const topTempEl = document.getElementById(`${stationKey}-top-temp`);
    if (topSnowEl) topSnowEl.textContent = `${data.top.snow.toFixed(1)} mm`;
    if (topTempEl) topTempEl.textContent = `${data.top.temp.toFixed(1)} °C`;

    // Section 2 — Bottom station
    const botSnowEl = document.getElementById(`${stationKey}-bottom-snow`);
    const botTempEl = document.getElementById(`${stationKey}-bottom-temp`);
    if (botSnowEl) botSnowEl.textContent = `${data.bottom.snow.toFixed(1)} mm`;
    if (botTempEl) botTempEl.textContent = `${data.bottom.temp.toFixed(1)} °C`;

    // Section 3 — Unified forecast timeline
    const tlEl = document.getElementById(`${stationKey}-timeline`);
    if (!tlEl) return;
    tlEl.innerHTML = '';

    // Source label
    const sourceEl = document.createElement('p');
    sourceEl.className = 'fl-source';
    sourceEl.innerHTML = `<em>FL source: ${data.source}</em>`;
    tlEl.appendChild(sourceEl);

    // Column header
    const hdr = document.createElement('div');
    hdr.className = 'tl-header';
    hdr.innerHTML =
        `<span class="tl-c-time">Date / Time (CET)</span>` +
        `<span class="tl-c-fl">FL (m)</span>` +
        `<span class="tl-c-precip">Precip</span>` +
        `<span class="tl-c-temp">Temp</span>`;
    tlEl.appendChild(hdr);

    const timeline = buildTimeline(data);
    if (timeline.length === 0) {
        const emp = document.createElement('p');
        emp.className = 'tl-empty';
        emp.textContent = 'No forecast data available.';
        tlEl.appendChild(emp);
        return;
    }

    timeline.forEach(entry => {
        const row = document.createElement('div');
        row.className = 'tl-row';
        if (entry.rainMm > 0 || entry.snowMm > 0) row.classList.add('has-precip');

        const timeStr  = formatTimelineCET(entry.time);
        const flStr    = entry.flLevel != null ? `${entry.flLevel} m` : '—';

        let precipStr = '—';
        if (entry.rainMm > 0)       precipStr = `🌧 Rain ${entry.rainMm.toFixed(1)} mm`;
        else if (entry.snowMm > 0)  precipStr = `❄️ Snow ${(entry.snowMm / 10).toFixed(1)} cm`;

        const tempStr = entry.temp != null
            ? `${entry.temp > 0 ? '+' : ''}${entry.temp.toFixed(1)}°C`
            : '—';

        row.innerHTML =
            `<span class="tl-c-time">${timeStr}</span>` +
            `<span class="tl-c-fl">${flStr}</span>` +
            `<span class="tl-c-precip">${precipStr}</span>` +
            `<span class="tl-c-temp">${tempStr}</span>`;
        tlEl.appendChild(row);
    });
}

// ── UI helpers ────────────────────────────────────────────────────
function showLoading() {
    if (loadingEl) loadingEl.style.display = 'block';
    if (resultsEl) resultsEl.style.display = 'none';
}
function hideLoading() {
    if (loadingEl) loadingEl.style.display = 'none';
}
function showError(msg) {
    if (errorEl) {
        errorEl.innerHTML = `<strong>❌ Error:</strong> ${msg}<br><br>
            <small>Open browser console (F12 → Console tab) for details.<br>
            The default API key is <code>${DEFAULT_API_KEY.slice(0,6)}…</code></small>`;
        errorEl.style.display = 'block';
    }
    if (resultsEl) resultsEl.style.display = 'none';
}
function hideError() {
    if (errorEl) errorEl.style.display = 'none';
}
