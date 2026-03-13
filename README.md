# 🎿 Ski Stations Weather PWA

A Progressive Web App for checking real-time ski conditions and weather forecasts for **Auron** and **Isola 2000** ski stations in the French Alps (Alpes du Sud).

## 🌟 Features

- **Real-time Weather Data**: Current temperature and recent snowfall at top and bottom elevations
- **Freezing Level Forecast**: Hourly freezing level predictions for snow quality assessment
- **Precipitation Alerts**: Automatic detection of rain/snow in the forecast
- **Side-by-Side Comparison**: Easy comparison between both ski stations
- **Progressive Web App**: Install on your device and use like a native app
- **Offline Capable**: Works offline after first load
- **Mobile Responsive**: Optimized for all screen sizes
- **Auto-refresh**: Easy data refresh with one click

## 📊 Data Provided

### For Each Station (Auron & Isola 2000):

1. **Weather at Top**
   - Elevation
   - Recent snowfall (last 3 hours)
   - Current temperature

2. **Weather at Bottom**
   - Elevation
   - Recent snowfall (last 3 hours)
   - Current temperature

3. **Freezing Level Forecast**
   - Current freezing level (highlighted)
   - Hourly forecast during precipitation
   - Specific times (8am, 12pm, 4pm, 8pm, 12am) when no precipitation

## 🚀 Getting Started

### Option 1: Open Locally

1. Download all files to a folder
2. Open `index.html` in a web browser
3. Click "Save & Fetch Data" to load weather data

### Option 2: Deploy to GitHub Pages

1. Create a new GitHub repository
2. Upload all files from the `ski-pwa` folder
3. Enable GitHub Pages in repository settings
4. Access your app at: `https://yourusername.github.io/repository-name/`

### Option 3: Deploy to Any Web Server

Upload all files to your web server and access via the URL.

## 🔑 API Key Configuration

The app comes with a default OpenWeatherMap API key pre-configured. You can:

- **Use the default key**: Just click "Save & Fetch Data"
- **Use your own key**: Enter it in the input field and click "Save & Fetch Data"

To get your own free API key:
1. Visit [OpenWeatherMap](https://openweathermap.org/api)
2. Sign up for a free account
3. Generate an API key
4. Enter it in the app

## 📱 Installing as an App

### On Android (Chrome):
1. Open the PWA in Chrome
2. Tap the menu (⋮)
3. Select "Install app" or "Add to Home Screen"
4. The app will appear on your home screen

### On iOS (Safari):
1. Open the PWA in Safari
2. Tap the Share button
3. Select "Add to Home Screen"
4. Tap "Add"

### On Desktop (Chrome/Edge):
1. Open the PWA in Chrome or Edge
2. Look for the install icon in the address bar
3. Click "Install"

## 🏔️ Ski Stations

### Auron
- **Top Elevation**: 2450m
- **Bottom Elevation**: 1600m
- **Official Bulletin**: [hiver.auron.com/bulletin-des-pistes](https://hiver.auron.com/bulletin-des-pistes/)

### Isola 2000
- **Top Elevation**: 2600m
- **Bottom Elevation**: 2000m
- **Official Bulletin**: [isola2000.com/bulletin-pistes](https://isola2000.com/bulletin-pistes/)

## 📖 Understanding the Data

### Recent Snowfall
Shows precipitation in the last 3 hours, **NOT** the total accumulated snow base. For actual snow depth, check the official bulletins.

### Freezing Level
Calculated using standard atmospheric lapse rate (6.5°C per 1000m). This helps predict:
- Snow quality (powder vs. wet snow)
- Rain/snow line elevation
- Optimal skiing conditions

### Temperature Inversions
It's normal for the top to be warmer than the bottom in mountain regions due to:
- Cold air sinking into valleys
- Different sun exposure
- Atmospheric conditions

## 🛠️ Technical Details

### Built With
- **HTML5**: Semantic structure
- **CSS3**: Modern styling with gradients and animations
- **Vanilla JavaScript**: No frameworks, pure JS
- **Service Worker**: Offline functionality
- **Web Manifest**: PWA capabilities

### APIs Used
- **OpenWeatherMap Current Weather API**: Real-time conditions
- **OpenWeatherMap 5-Day Forecast API**: Future predictions

### Browser Support
- Chrome/Edge (recommended)
- Firefox
- Safari
- Opera
- Any modern browser with PWA support

## 📂 File Structure

```
ski-pwa/
├── index.html          # Main HTML structure
├── style.css           # Styling and responsive design
├── app.js              # Application logic
├── manifest.json       # PWA manifest
├── service-worker.js   # Offline functionality
└── README.md           # This file
```

## 🔄 Updates

The app automatically caches resources for offline use. To get the latest version:
1. Clear your browser cache
2. Reload the page
3. Or uninstall and reinstall the PWA

## ⚠️ Limitations

- **Snow Depth**: OpenWeatherMap doesn't provide accumulated snow base data
- **API Rate Limits**: Free tier has 60 calls/minute, 1,000,000 calls/month
- **Forecast Range**: 5-day forecast in 3-hour intervals
- **Data Accuracy**: Weather data is estimated for specific coordinates

## 🎯 Use Cases

Perfect for:
- Planning ski trips
- Checking conditions before heading to the slopes
- Comparing conditions between stations
- Monitoring freezing levels for snow quality
- Tracking precipitation forecasts

## 🤝 Contributing

Feel free to fork and improve! Suggestions:
- Add more ski stations
- Enhance UI/UX
- Add weather charts
- Include wind speed data
- Add snow quality indicators

## 📄 License

Free to use and modify for personal and commercial purposes.

## 🙏 Credits

- Weather data: [OpenWeatherMap](https://openweathermap.org/)
- Ski station info: Official Auron and Isola 2000 websites
- Icons: Emoji (🎿⛷️🏔️❄️)

## 📞 Support

For issues or questions:
- Check the official ski station bulletins for accurate snow data
- Verify your API key is valid
- Ensure you have internet connection for first load
- Check browser console for error messages

---

**Made with ❄️ for ski enthusiasts**

Enjoy your skiing! 🎿⛷️
