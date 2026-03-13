// Default API key (OpenWeatherMap — for snow/rain/current weather)
const DEFAULT_API_KEY = 'c422f870ff560166ebbf6f45dcef157b';

// Ski station coordinates
const STATIONS = {
    auron: {
        name: 'Auron',
        top:    { lat: 44.2167, lon: 6.9167, elevation: 2450 },
        bottom: { lat: 44.2333, lon: 6.9000, elevation: 1600 }
    },
    isola: {
        name: 'Isola 2000',
        top:    { lat: 44.1833, lon: 7.1500, elevation: 2600 },
        bottom: { lat: 44.1667, lon: 7.1333, elevation: 2000 }   // ← fixed (was same as top)
    }
};

// DOM elements
const apiKeyInput       = document.getElementById('apiKeyInput');
const saveApiKeyBtn     = document.getElementById('saveApiKey');
const refreshBtn        = document.getElementById('refreshBtn');
const loadingEl         = document.getElementById('loading');
const errorEl           = document.getElementById('error');
const resultsEl         = document.getElementById('results');
const apiKeySectionEl   = document.getElementById('apiKeySection');
const lastUpdatedEl     = document.getElementById('lastUpdated');

// Initialize — guard against stale / corrupted localStorage values
let apiKey = localStorage.getItem('skiApiKey') || DEFAULT_API_KEY;
if (!apiKey || apiKey === 'undefined' || apiKey === 'null' || apiKey.trim() === '') {
    apiKey = DEFAULT_API_KEY;
    localStorage.removeItem('skiApiKey');
}

// Register service worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js')
        .then(() => console.log('Service Worker registered'))
        .catch(err => console.log('Service Worker registration failed:', err));
}

// Event listeners
saveApiKeyBtn.addEventListener('click', handleSaveApiKey);
refreshBtn.addEventListener('click', fetchAllData);

// Initialize app
init();

function init() {
    // Always show the active key in the input so the user can inspect / override it
    apiKeyInput.value = (apiKey && apiKey !== DEFAULT_API_KEY) ? apiKey : '';
    apiKeyInput.placeholder = `Default key pre-configured (…${DEFAULT_API_KEY.slice(-6)})`;
    fetchAllData();
}

// ─────────────────────────────────────────────
//  Date / time helpers
// ─────────────────────────────────────────────

function formatDateTimeCET(date) {
    return new Intl.DateTimeFormat('en-GB', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        timeZone: 'Europe/Paris', timeZoneName: 'short'
    }).format(date);
}

function formatForecastTimeCET(date) {
    return new Intl.DateTimeFormat('en-GB', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
        timeZone: 'Europe/Paris', timeZoneName: 'short'
    }).format(date);
}

// ─────────────────────────────────────────────
//  Main data fetch
// ─────────────────────────────────────────────

function handleSaveApiKey() {
    const inputKey = apiKeyInput.value.trim();
    if (inputKey) {
        apiKey = inputKey;
        localStorage.setItem('skiApiKey', apiKey);
    } else {
        // Empty input → revert to built-in default and clear any stored value
        apiKey = DEFAULT_API_KEY;
        localStorage.removeItem('skiApiKey');
    }
    fetchAllData();
}

async function fetchAllData() {
    showLoading();
    hideError();

    try {
        const [auronData, isolaData] = await Promise.all([
            fetchStationData('auron'),
            fetchStationData('isola')
        ]);

        displayResults(auronData, isolaData);
        updateLastUpdated();
        apiKeySectionEl.style.display = 'none';

    } catch (error) {
        showError(error.message);
    } finally {
        hideLoading();
    }
}

async function fetchStationData(stationKey) {
    const station = STATIONS[stationKey];

    // ── OWM: current weather at top & bottom ──
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
        precipEvents:     [],
        freezingLevels:   [],
        freezingSource:   ''
    };

    // ── OWM: precipitation forecast ──
    const { hasPrecip, precipTimes } = checkPrecipitationForecast(forecast);
    data.hasPrecipitation = hasPrecip;
    data.precipEvents     = precipTimes;

    // ── Open-Meteo: freezing level (primary source) ──
    const omLevels = await fetchFreezingLevelsOpenMeteo(station.top.lat, station.top.lon);

    if (omLevels.length > 0) {
        data.freezingLevels = omLevels;
        data.freezingSource = 'Open-Meteo (direct measurement)';
    } else {
        // ── Fallback: lapse-rate estimate from bottom-station temperature ──
        data.freezingSource = 'Estimated (lapse rate from bottom station)';
        const specificTimes = getSpecificTimesForecast(forecast);

        specificTimes.forEach(st => {
            // Convert top-station forecast temp to an estimated bottom-station temp
            const elevDiff = station.top.elevation - station.bottom.elevation;
            const estBottomTemp = st.temp + (6.5 / 1000) * elevDiff;
            data.freezingLevels.push({
                time:  st.time,
                level: fallbackFreezingLevel(estBottomTemp, station.bottom.elevation)
            });
        });

        // If no forecast data either, use current bottom temperature
        if (data.freezingLevels.length === 0) {
            data.freezingLevels.push({
                time:  new Date(),
                level: fallbackFreezingLevel(data.bottom.temp, station.bottom.elevation)
            });
        }
    }

    return data;
}

// ─────────────────────────────────────────────
//  Open-Meteo API — freezing level
// ─────────────────────────────────────────────

/**
 * Fetch hourly freezing-level altitude (metres) from Open-Meteo.
 *
 * Open-Meteo is free, requires no API key, uses a ~1-2 km resolution
 * numerical weather model, and provides freezing_level_height directly —
 * no lapse-rate approximation required.
 *
 * Returns slots at 06h, 12h and 18h UTC for the next 5 days.
 */
async function fetchFreezingLevelsOpenMeteo(lat, lon) {
    const url = `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${lat}&longitude=${lon}` +
        `&hourly=freezing_level_height` +
        `&timezone=UTC` +
        `&forecast_days=5`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data    = await response.json();
        const times   = data.hourly.time;                    // "2026-03-12T06:00"
        const levels  = data.hourly.freezing_level_height;   // metres

        const TARGET_HOURS = new Set([6, 12, 18]);
        const result = [];

        times.forEach((t, i) => {
            const dt   = new Date(t + ':00Z');               // parse as UTC
            const hour = dt.getUTCHours();
            if (TARGET_HOURS.has(hour) && levels[i] != null) {
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
 * Fallback: estimate freezing level from bottom-station temperature.
 *
 * IMPORTANT — use the BOTTOM station (not top) as reference:
 * - The bottom is often above 0 °C in winter, so lapse-rate extrapolation
 *   actually produces a meaningful height above the reference point.
 * - Using the top station (old bug): top is ≤ 0 °C in winter → the formula
 *   always returned the fixed top elevation, never varying.
 */
function fallbackFreezingLevel(tempBottom, elevBottom) {
    const lapseRate = 6.5 / 1000;    // °C per metre
    if (tempBottom <= 0) return elevBottom;
    return Math.round(elevBottom + tempBottom / lapseRate);
}

// ─────────────────────────────────────────────
//  OpenWeatherMap helpers
// ─────────────────────────────────────────────

async function fetchCurrentWeather(lat, lon) {
    const url = `https://api.openweathermap.org/data/2.5/weather` +
        `?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;
    const response = await fetch(url);

    if (!response.ok) {
        if (response.status === 401)
            throw new Error('Invalid API key. Please check your API key and try again.');
        throw new Error(`Failed to fetch weather data: ${response.statusText}`);
    }

    return response.json();
}

async function fetchForecast(lat, lon) {
    const url = `https://api.openweathermap.org/data/2.5/forecast` +
        `?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;
    const response = await fetch(url);

    if (!response.ok)
        throw new Error(`Failed to fetch forecast data: ${response.statusText}`);

    return response.json();
}

function getSnowDepth(weatherData) {
    if (weatherData.snow) {
        return weatherData.snow['1h'] || weatherData.snow['3h'] || 0;
    }
    return 0;
}

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
                    rainMm: hasRain ? (item.rain['3h'] || 0) : 0,
                    snowMm: hasSnow ? (item.snow['3h'] || 0) : 0
                });
            }
        });
    }

    return { hasPrecip: precipTimes.length > 0, precipTimes };
}

/**
 * Get forecast at target hours (8, 12, 16, 20) across ALL 5 days.
 * (Old bug: deduplication by hour kept only day-1 data.)
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

// ─────────────────────────────────────────────
//  Timeline builder — merges precip + freezing level
// ─────────────────────────────────────────────

/**
 * Merge precipitation events (OWM) and freezing-level slots (Open-Meteo)
 * into a single list sorted by timestamp.
 *
 * Each entry: { time, flLevel, rainMm, snowMm, temp }
 * Entries sharing the same hour are merged into one row.
 */
function buildTimeline(data) {
    const merged = new Map();

    const key = dt => {
        const d = new Date(dt);
        d.setMinutes(0, 0, 0);
        return d.getTime();
    };

    // Add freezing-level slots
    data.freezingLevels.forEach(fl => {
        const k = key(fl.time);
        if (!merged.has(k)) {
            merged.set(k, { time: new Date(fl.time), flLevel: null, rainMm: null, snowMm: null, temp: null });
        }
        merged.get(k).flLevel = fl.level;
        // normalise time to the truncated hour
        merged.get(k).time = new Date(k);
    });

    // Add precipitation events
    data.precipEvents.forEach(p => {
        const k = key(p.time);
        if (!merged.has(k)) {
            merged.set(k, { time: new Date(k), flLevel: null, rainMm: null, snowMm: null, temp: null });
        }
        const entry = merged.get(k);
        if (p.rainMm > 0) entry.rainMm = p.rainMm;
        if (p.snowMm > 0) entry.snowMm = p.snowMm;
        entry.temp = p.temp;
    });

    return [...merged.values()].sort((a, b) => a.time - b.time);
}

// ─────────────────────────────────────────────
//  Display helpers
// ─────────────────────────────────────────────

function displayResults(auronData, isolaData) {
    displayStationData('auron', auronData);
    displayStationData('isola', isolaData);
    resultsEl.style.display = 'block';
}

function displayStationData(stationKey, data) {
    // Measurement time
    const measurementEl = document.getElementById(`${stationKey}-measurement-time`);
    if (measurementEl && data.measurementTime) {
        measurementEl.textContent = `🕐 Last OWM Measurement: ${formatDateTimeCET(data.measurementTime)}`;
    }

    // Top weather
    document.getElementById(`${stationKey}-top-snow`).textContent =
        data.top.snow > 0 ? `${data.top.snow.toFixed(1)} mm` : 'No data';
    document.getElementById(`${stationKey}-top-temp`).textContent =
        `${data.top.temp.toFixed(1)}°C`;

    // Bottom weather
    document.getElementById(`${stationKey}-bottom-snow`).textContent =
        data.bottom.snow > 0 ? `${data.bottom.snow.toFixed(1)} mm` : 'No data';
    document.getElementById(`${stationKey}-bottom-temp`).textContent =
        `${data.bottom.temp.toFixed(1)}°C`;

    // ── Unified timeline (freezing level + precipitation) ──
    const timelineEl = document.getElementById(`${stationKey}-timeline`);
    timelineEl.innerHTML = '';

    // Source label
    const sourceEl = document.createElement('p');
    sourceEl.className = 'freezing-source';
