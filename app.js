// Default API key
const DEFAULT_API_KEY = 'c422f870ff560166ebbf6f45dcef157b';

// Ski station coordinates
const STATIONS = {
    auron: {
        name: 'Auron',
        top: { lat: 44.2167, lon: 6.9167, elevation: 2450 },
        bottom: { lat: 44.2333, lon: 6.9000, elevation: 1600 }
    },
    isola: {
        name: 'Isola 2000',
        top: { lat: 44.1833, lon: 7.1500, elevation: 2600 },
        bottom: { lat: 44.1833, lon: 7.1500, elevation: 2000 }
    }
};

// DOM elements
const apiKeyInput = document.getElementById('apiKeyInput');
const saveApiKeyBtn = document.getElementById('saveApiKey');
const refreshBtn = document.getElementById('refreshBtn');
const loadingEl = document.getElementById('loading');
const errorEl = document.getElementById('error');
const resultsEl = document.getElementById('results');
const apiKeySectionEl = document.getElementById('apiKeySection');
const lastUpdatedEl = document.getElementById('lastUpdated');

// Initialize
let apiKey = localStorage.getItem('skiApiKey') || DEFAULT_API_KEY;

// Register service worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js')
        .then(reg => console.log('Service Worker registered'))
        .catch(err => console.log('Service Worker registration failed:', err));
}

// Event listeners
saveApiKeyBtn.addEventListener('click', handleSaveApiKey);
refreshBtn.addEventListener('click', fetchAllData);

// Initialize app
init();

function init() {
    if (apiKey && apiKey !== DEFAULT_API_KEY) {
        apiKeyInput.value = apiKey;
    }
    // Auto-fetch data on load if API key exists
    if (apiKey) {
        fetchAllData();
    }
}

function handleSaveApiKey() {
    const inputKey = apiKeyInput.value.trim();
    apiKey = inputKey || DEFAULT_API_KEY;
    localStorage.setItem('skiApiKey', apiKey);
    fetchAllData();
}

async function fetchAllData() {
    showLoading();
    hideError();
    
    try {
        // Fetch data for both stations
        const auronData = await fetchStationData('auron');
        const isolaData = await fetchStationData('isola');
        
        // Display results
        displayResults(auronData, isolaData);
        
        // Update last updated time
        updateLastUpdated();
        
        // Hide API key section after successful fetch
        apiKeySectionEl.style.display = 'none';
        
    } catch (error) {
        showError(error.message);
    } finally {
        hideLoading();
    }
}

async function fetchStationData(stationKey) {
    const station = STATIONS[stationKey];
    
    // Fetch current weather for top and bottom
    const topWeather = await fetchCurrentWeather(station.top.lat, station.top.lon);
    const bottomWeather = await fetchCurrentWeather(station.bottom.lat, station.bottom.lon);
    
    // Fetch forecast
    const forecast = await fetchForecast(station.top.lat, station.top.lon);
    
    // Process data
    const data = {
        name: station.name,
        top: {
            elevation: station.top.elevation,
            snow: getSnowDepth(topWeather),
            temp: topWeather.main.temp
        },
        bottom: {
            elevation: station.bottom.elevation,
            snow: getSnowDepth(bottomWeather),
            temp: bottomWeather.main.temp
        },
        freezingLevels: []
    };
    
    // Add current freezing level
    const currentTime = new Date();
    const currentFreezingLevel = calculateFreezingLevel(topWeather.main.temp, station.top.elevation);
    data.freezingLevels.push({
        time: currentTime,
        level: currentFreezingLevel,
        temp: topWeather.main.temp,
        isCurrent: true
    });
    
    // Check for precipitation and add forecast freezing levels
    const { hasPrecip, precipTimes } = checkPrecipitationForecast(forecast);
    data.hasPrecipitation = hasPrecip;
    
    if (hasPrecip) {
        // Add freezing levels for precipitation times
        precipTimes.forEach(p => {
            const freezingLevel = calculateFreezingLevel(p.temp, station.top.elevation);
            data.freezingLevels.push({
                time: p.time,
                level: freezingLevel,
                temp: p.temp,
                isCurrent: false
            });
        });
    } else {
        // Add specific times
        const specificTimes = getSpecificTimesForecast(forecast);
        specificTimes.forEach(st => {
            const freezingLevel = calculateFreezingLevel(st.temp, station.top.elevation);
            data.freezingLevels.push({
                time: st.time,
                level: freezingLevel,
                temp: st.temp,
                isCurrent: false
            });
        });
    }
    
    return data;
}

async function fetchCurrentWeather(lat, lon) {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;
    const response = await fetch(url);
    
    if (!response.ok) {
        if (response.status === 401) {
            throw new Error('Invalid API key. Please check your API key and try again.');
        }
        throw new Error(`Failed to fetch weather data: ${response.statusText}`);
    }
    
    return await response.json();
}

async function fetchForecast(lat, lon) {
    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;
    const response = await fetch(url);
    
    if (!response.ok) {
        throw new Error(`Failed to fetch forecast data: ${response.statusText}`);
    }
    
    return await response.json();
}

function getSnowDepth(weatherData) {
    if (weatherData.snow) {
        return weatherData.snow['1h'] || weatherData.snow['3h'] || 0;
    }
    return 0;
}

function calculateFreezingLevel(tempGround, elevationGround) {
    if (tempGround <= 0) {
        return elevationGround;
    }
    
    // Temperature decreases by 6.5°C per 1000m
    const lapseRate = 6.5 / 1000;
    const heightAboveGround = tempGround / lapseRate;
    const freezingLevel = elevationGround + heightAboveGround;
    
    return Math.round(freezingLevel);
}

function checkPrecipitationForecast(forecastData) {
    const precipTimes = [];
    
    if (forecastData && forecastData.list) {
        forecastData.list.forEach(item => {
            const hasRain = item.rain && Object.keys(item.rain).length > 0;
            const hasSnow = item.snow && Object.keys(item.snow).length > 0;
            
            if (hasRain || hasSnow) {
                precipTimes.push({
                    time: new Date(item.dt * 1000),
                    temp: item.main.temp
                });
            }
        });
    }
    
    return {
        hasPrecip: precipTimes.length > 0,
        precipTimes
    };
}

function getSpecificTimesForecast(forecastData) {
    const targetHours = [8, 11, 16, 20, 23];
    const results = [];
    const seenHours = new Set();
    
    if (forecastData && forecastData.list) {
        forecastData.list.forEach(item => {
            const dt = new Date(item.dt * 1000);
            const hour = dt.getHours();
            
            if (targetHours.includes(hour) && !seenHours.has(hour)) {
                seenHours.add(hour);
                results.push({
                    time: dt,
                    temp: item.main.temp,
                    hour
                });
            }
        });
    }
    
    return results.sort((a, b) => a.hour - b.hour);
}

function displayResults(auronData, isolaData) {
    // Display Auron data
    displayStationData('auron', auronData);
    
    // Display Isola data
    displayStationData('isola', isolaData);
    
    // Show results
    resultsEl.style.display = 'block';
}

function displayStationData(stationKey, data) {
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
    
    // Precipitation status
    document.getElementById(`${stationKey}-precip`).textContent = 
        data.hasPrecipitation ? 'YES ❄️' : 'NO ☀️';
    
    // Freezing levels
    const freezingLevelsEl = document.getElementById(`${stationKey}-freezing-levels`);
    freezingLevelsEl.innerHTML = '';
    
    data.freezingLevels.forEach(fl => {
        const itemEl = document.createElement('div');
        itemEl.className = 'freezing-level-item' + (fl.isCurrent ? ' current' : '');
        
        const timeStr = formatDateTime(fl.time);
        const label = fl.isCurrent ? ' (NOW)' : '';
        
        itemEl.innerHTML = `
            <span class="freezing-level-time">${timeStr}${label}</span>
            <span class="freezing-level-data">${fl.level}m (${fl.temp.toFixed(1)}°C)</span>
        `;
        
        freezingLevelsEl.appendChild(itemEl);
    });
}

function formatDateTime(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function updateLastUpdated() {
    const now = new Date();
    lastUpdatedEl.textContent = `Last updated: ${formatDateTime(now)}`;
}

function showLoading() {
    loadingEl.style.display = 'block';
    resultsEl.style.display = 'none';
}

function hideLoading() {
    loadingEl.style.display = 'none';
}

function showError(message) {
    errorEl.textContent = `❌ Error: ${message}`;
    errorEl.style.display = 'block';
    resultsEl.style.display = 'none';
}

function hideError() {
    errorEl.style.display = 'none';
}