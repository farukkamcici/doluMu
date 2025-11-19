// frontend/src/lib/dummyData.js

// Helper function to generate forecast data for a line
const generateForecast = (peakHours = [], alwaysBusy = false) => {
  const forecast = [];
  for (let i = 0; i < 24; i++) {
    const hour = i.toString().padStart(2, '0') + ':00';
    let score;

    if (alwaysBusy) {
      score = 75 + Math.floor(Math.random() * 20); // Consistently high score
    } else if (peakHours.includes(i)) {
      score = 80 + Math.floor(Math.random() * 15); // Peak hour score
    } else {
      score = 20 + Math.floor(Math.random() * 40); // Off-peak score
    }
    
    forecast.push({ hour, score: Math.min(100, score) });
  }
  return forecast;
};

export const TRANSPORT_LINES = [
  {
    id: "500T",
    name: "Tuzla - Cevizlibağ",
    type: "bus",
    current_level: "Very High",
    suggestion: "22:00",
    forecast: generateForecast([], true), // Always busy
  },
  {
    id: "M2",
    name: "Yenikapı - Hacıosman",
    type: "metro",
    current_level: "High",
    suggestion: "11:00",
    forecast: generateForecast([8, 18]), // Peaks at 08:00 and 18:00
  },
  {
    id: "15F",
    name: "Beykoz - Kadıköy",
    type: "bus",
    current_level: "Medium",
    suggestion: "14:00",
    forecast: generateForecast([9, 17]),
  },
  {
    id: "Metrobüs",
    name: "Beylikdüzü - Söğütlüçeşme",
    type: "metrobus",
    current_level: "Very High",
    suggestion: "00:00",
    forecast: generateForecast([], true), // Always busy
  },
];
