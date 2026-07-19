import React, { useState, useEffect, useRef, memo } from 'react';

// --- CHART COMPONENT ---
const CandlestickChart = memo(({ seriesData, stockName }) => {
    const canvasRef = useRef(null);
    const chartRef = useRef(null);

    useEffect(() => {
        if (!canvasRef.current || !window.Chart || !seriesData.length) {
            return;
        }

        if (chartRef.current) {
            chartRef.current.destroy();
        }

        const ctx = canvasRef.current.getContext('2d');
        
        // Map data to Chart.js financial format
        const chartData = seriesData.map(d => ({
            x: d.x.getTime(),
            o: d.y[0],
            h: d.y[1],
            l: d.y[2],
            c: d.y[3]
        }));

        chartRef.current = new window.Chart(ctx, {
            type: 'candlestick',
            data: {
                datasets: [{
                    label: `${stockName} OHLC`,
                    data: chartData,
                    borderColor: '#e2e8f0', // Light gray border
                    color: {
                        up: '#10b981', // Green for up
                        down: '#ef4444', // Red for down
                        unchanged: '#9ca3af',
                    }
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                           label: (context) => {
                               const raw = context.raw;
                               return `O: ${raw.o.toFixed(2)} H: ${raw.h.toFixed(2)} L: ${raw.l.toFixed(2)} C: ${raw.c.toFixed(2)}`;
                           }
                        }
                    }
                },
                scales: {
                    x: { 
                        type: 'time', 
                        time: { unit: 'day', tooltipFormat: 'MMM dd, yyyy' }, 
                        grid: { color: 'rgba(255, 255, 255, 0.1)' }, 
                        ticks: { color: '#a0aec0' } 
                    },
                    y: { 
                        grid: { color: 'rgba(255, 255, 255, 0.1)' }, 
                        ticks: { color: '#a0aec0' } 
                    }
                }
            }
        });

        return () => {
            if (chartRef.current) {
                chartRef.current.destroy();
            }
        };
    }, [seriesData, stockName]);

    return (
        <div style={{ position: 'relative', height: '400px' }}>
            <canvas ref={canvasRef}></canvas>
        </div>
    );
});

// --- DATA TABLE COMPONENT ---
const DataTable = ({ jsonData, title }) => {
    if (!jsonData) return null;
    let data;
    try {
        data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
        if (!Array.isArray(data) || data.length === 0) return null;
    } catch (e) { return <p className="text-red-400">Error displaying data.</p>; }
    
    const headers = Object.keys(data[0]);
    
    return (
        <div className="bg-gray-800 p-4 rounded-lg shadow-lg mb-8">
            <h2 className="text-2xl font-semibold text-center mb-4 text-cyan-400">{title}</h2>
            <div className="overflow-x-auto max-h-96 relative scrollbar-thin scrollbar-thumb-gray-600">
                <table className="w-full text-sm text-left text-gray-400">
                    <thead className="text-xs text-gray-300 uppercase bg-gray-700 sticky top-0">
                        <tr>{headers.map(h => <th key={h} className="py-3 px-6 whitespace-nowrap">{h}</th>)}</tr>
                    </thead>
                    <tbody>
                        {data.map((row, i) => (
                            <tr key={i} className="border-b bg-gray-800 border-gray-700 hover:bg-gray-600">
                                {headers.map(h => (
                                    <td key={`${i}-${h}`} className="py-4 px-6 whitespace-nowrap">
                                        {/* Format numbers to 2 decimal places if they are numbers */}
                                        {typeof row[h] === 'number' ? row[h].toFixed(2) : row[h]}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// --- MAIN APP COMPONENT ---
function App() {
  const stockSymbols = {
  "JPMorgan Chase": "JPM",
  "Visa": "V",
  "Mastercard": "MA",
  "Bank of America": "BAC",
  "Walmart": "WMT",
  "Disney": "DIS",
  "Johnson & Johnson": "JNJ",
  "Procter & Gamble": "PG",
  "UnitedHealth Group": "UNH",
  "Exxon Mobil": "XOM",
  "Chevron": "CVX"
}

  const [selectedSymbol, setSelectedSymbol] = useState("Apple");
  const [seriesData, setSeriesData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [validationResult, setValidationResult] = useState(null);
  const [actualResult, setActualResult] = useState(null);
  const [isChartLibReady, setIsChartLibReady] = useState(false);
  const [fullData, setFullData] = useState(null);
  const [lastDayData, setLastDayData] = useState(null);
  const [showHistoryTable, setShowHistoryTable] = useState(false);
  const [showValidationTable, setShowValidationTable] = useState(false);
  const [lastDaySeriesData, setLastDaySeriesData] = useState([]);
  const [accuracy, setAccuracy] = useState(null);
  const [sentimentUsed, setSentimentUsed] = useState("No");
  const [sentimentScore, setSentimentScore] = useState(null);

  const handleSymbolChange = (event) => setSelectedSymbol(event.target.value);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    setSeriesData([]);
    setLastDaySeriesData([]);
    setPrediction(null);
    setValidationResult(null);
    setActualResult(null);
    setFullData(null);
    setLastDayData(null);
    setShowHistoryTable(false);
    setShowValidationTable(false);
    setAccuracy(null);
    setSentimentUsed("No");
    setSentimentScore(null);

    try {
      const symbolToSend = stockSymbols[selectedSymbol];
      const response = await fetch("http://localhost:5000/get-stock-data", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stock_symbol: symbolToSend }),
      });
      
      const responseText = await response.text();
      if (!response.ok) throw new Error(`Server Error (Status: ${response.status}): ${responseText}`);
      
      const data = JSON.parse(responseText);
      if (data.status === "error") throw new Error(data.message);

      // --- 1. Parse Stock Data ---
      if (data.stock_data) {
        // Python sends data as JSON Array of objects now (orient='records')
        const parsed = JSON.parse(data.stock_data);
        
        // Transform for Chart.js: { x: Date, y: [O, H, L, C] }
        const transformed = parsed.map(item => ({
            x: new Date(item.Date || item.index), // Handle if column is 'Date' or index
            y: [item.Open, item.High, item.Low, item.Close]
        }));

        setSeriesData(transformed);
        
        if (transformed.length >= 2) {
            setLastDaySeriesData(transformed.slice(-5)); // Show last 5 days for better context
        }
        
        setFullData(JSON.stringify(parsed));
      } else {
        setError("Chart data was not returned.");
      }

      // --- 2. Parse Prediction & Sentiment ---
      if (data.prediction_for_last_day) {
        setPrediction(data.prediction_for_last_day);
        setValidationResult(data.validation_result);
        setActualResult(data.actual_result_for_last_day);
        setLastDayData(data.last_day_data);
        
        if (data.accuracy !== undefined) setAccuracy(data.accuracy);
        if (data.sentiment_used) setSentimentUsed(data.sentiment_used);

        // Extract Sentiment Score from last day data if available
        if (data.last_day_data) {
            const lastDataParsed = JSON.parse(data.last_day_data);
            if (lastDataParsed.length > 0 && lastDataParsed[lastDataParsed.length -1].Sentiment_Score !== undefined) {
                setSentimentScore(lastDataParsed[lastDataParsed.length -1].Sentiment_Score);
            }
        }
      }

    } catch (err) {
      setError(`Operation failed: ${err.message}.`);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Initial Setup: Load Chart Scripts & Tailwind ---
  useEffect(() => {
    // Inject Tailwind
    if (!document.getElementById('tailwind-cdn-script')) {
        const script = document.createElement('script');
        script.id = 'tailwind-cdn-script';
        script.src = "https://cdn.tailwindcss.com";
        document.head.appendChild(script);
    }

    // Load Chart.js and Financial Plugin
    if (window.Chart) { setIsChartLibReady(true); return; }
    
    const scriptUrls = [
        'https://cdn.jsdelivr.net/npm/chart.js@^4.0.0/dist/chart.umd.js', 
        'https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns/dist/chartjs-adapter-date-fns.bundle.min.js', 
        'https://cdn.jsdelivr.net/npm/chartjs-chart-financial@^0.2.0/dist/chartjs-chart-financial.js'
    ];
    
    let loadedScripts = 0;
    const loadScript = (url) => {
        const script = document.createElement('script');
        script.src = url;
        script.async = true;
        script.onload = () => { 
            loadedScripts++; 
            if (loadedScripts === scriptUrls.length) { 
                setIsChartLibReady(true); 
            } 
        };
        document.head.appendChild(script);
    };
    
    scriptUrls.forEach(url => loadScript(url));
  }, []);

  // --- Helper: Get Sentiment Color/Text ---
  const getSentimentInfo = (score) => {
      if (score === null || score === undefined) return { color: 'text-gray-400', text: 'N/A' };
      if (score > 0.15) return { color: 'text-green-400', text: 'Bullish (Positive)' };
      if (score < -0.15) return { color: 'text-red-400', text: 'Bearish (Negative)' };
      return { color: 'text-gray-400', text: 'Neutral' };
  };

  return (
    <div className="bg-gray-900 text-white min-h-screen font-sans p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl sm:text-5xl font-bold text-cyan-400 tracking-tight">Market Sentinel AI</h1>
          <p className="text-gray-400 mt-2">Hybrid Prediction: Technical Indicators + News Sentiment Analysis</p>
        </header>

        {/* Input Section */}
        <div className="bg-gray-800 p-6 rounded-xl shadow-2xl mb-8 flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-6 border border-gray-700">
          <div className="flex flex-col">
            <label htmlFor="stock-select" className="text-sm font-semibold text-gray-400 mb-1">Select Asset</label>
            <select id="stock-select" value={selectedSymbol} onChange={handleSymbolChange} className="bg-gray-700 text-white border border-gray-600 rounded-lg p-3 w-64 focus:ring-2 focus:ring-cyan-500 outline-none">
                {Object.keys(stockSymbols).map((name) => (<option key={name} value={name}>{name}</option>))}
            </select>
          </div>
          <button onClick={fetchData} disabled={isLoading} className="w-full sm:w-auto mt-6 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold py-3 px-8 rounded-lg transition-all shadow-lg transform hover:scale-105">
            {isLoading ? 'Running Analysis...' : 'Analyze Market'}
          </button>
        </div>

        {error && <div className="bg-red-900/50 border border-red-500 text-red-200 p-4 rounded-lg text-center mb-8">{error}</div>}

        {/* Dashboard Grid */}
        {prediction && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            
            {/* Card 1: Prediction */}
            <div className="bg-gray-800 p-6 rounded-xl shadow-lg border-t-4 border-cyan-500">
                <h2 className="text-sm font-semibold text-gray-400 uppercase">Model Prediction</h2>
                <div className="flex items-center justify-between mt-2">
                    <p className={`text-5xl font-bold ${prediction === 'Up' ? 'text-green-400' : 'text-red-400'}`}>{prediction}</p>
                    <span className="text-4xl">{prediction === 'Up' ? '🚀' : '📉'}</span>
                </div>
                <p className="text-xs text-gray-500 mt-2">For next trading session</p>
            </div>

            {/* Card 2: Accuracy/Validation */}
            <div className="bg-gray-800 p-6 rounded-xl shadow-lg border-t-4 border-purple-500">
                <h2 className="text-sm font-semibold text-gray-400 uppercase">Validation</h2>
                <div className="mt-2">
                    <p className={`text-2xl font-bold ${validationResult === 'Correct' ? 'text-green-400' : 'text-orange-400'}`}>{validationResult}</p>
                    <p className="text-sm text-gray-400">Actual: {actualResult}</p>
                </div>
                {accuracy !== null && (
                    <div className="mt-3 pt-3 border-t border-gray-700">
                        <span className="text-xs text-gray-400">Model Confidence: </span>
                        <span className="font-bold text-white">{(accuracy * 100).toFixed(1)}%</span>
                    </div>
                )}
            </div>

            {/* Card 3: Sentiment Score */}
            <div className="bg-gray-800 p-6 rounded-xl shadow-lg border-t-4 border-yellow-500">
                <h2 className="text-sm font-semibold text-gray-400 uppercase">News Sentiment</h2>
                <div className="mt-2">
                    {sentimentUsed === "Yes" ? (
                        <>
                            <p className={`text-xl font-bold ${getSentimentInfo(sentimentScore).color}`}>
                                {getSentimentInfo(sentimentScore).text}
                            </p>
                            <p className="text-sm text-gray-500 mt-1">Score: {sentimentScore?.toFixed(3)}</p>
                        </>
                    ) : (
                         <p className="text-gray-500 italic">Data Unavailable</p>
                    )}
                </div>
                <p className="text-xs text-gray-500 mt-2">Based on Alpha Vantage News</p>
            </div>

             {/* Card 4: Data Source Status */}
             <div className="bg-gray-800 p-6 rounded-xl shadow-lg border-t-4 border-blue-500">
                <h2 className="text-sm font-semibold text-gray-400 uppercase">Data Sources</h2>
                <ul className="mt-2 space-y-2 text-sm">
                    <li className="flex justify-between">
                        <span className="text-gray-400">Price Data:</span>
                        <span className="text-green-400 font-bold">Live</span>
                    </li>
                    <li className="flex justify-between">
                        <span className="text-gray-400">Sentiment:</span>
                        <span className={`font-bold ${sentimentUsed === 'Yes' ? 'text-green-400' : 'text-red-400'}`}>
                            {sentimentUsed === 'Yes' ? 'Active' : 'Offline'}
                        </span>
                    </li>
                </ul>
            </div>
          </div>
        )}
        
        {/* Toggle Buttons */}
        {prediction && (
            <div className="flex justify-center space-x-4 mb-8">
                <button onClick={() => setShowValidationTable(s => !s)} className="bg-gray-700 hover:bg-gray-600 border border-gray-600 text-white text-sm py-2 px-4 rounded transition-colors">
                    {showValidationTable ? 'Hide' : 'Show'} Analysis Data
                </button>
                <button onClick={() => setShowHistoryTable(s => !s)} className="bg-gray-700 hover:bg-gray-600 border border-gray-600 text-white text-sm py-2 px-4 rounded transition-colors">
                    {showHistoryTable ? 'Hide' : 'Show'} Full History
                </button>
            </div>
        )}

        {/* Data Tables */}
        {showValidationTable && <DataTable jsonData={lastDayData} title="Model Input Data (Last 2 Days)" />}
        {showHistoryTable && <DataTable jsonData={fullData} title="Historical Training Data" />}
        
        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {seriesData.length > 0 && (
                <div className="bg-gray-800 p-4 rounded-xl shadow-lg border border-gray-700">
                    <div className="flex justify-between items-center mb-4 px-2">
                         <h2 className="text-lg font-semibold text-gray-200">Price Action (2 Years)</h2>
                         

[Image of Candlestick Chart]

                    </div>
                    {isChartLibReady ? <CandlestickChart seriesData={seriesData} stockName={stockSymbols[selectedSymbol]}/> : <p className="text-center text-gray-400 py-12 animate-pulse">Loading Chart Engine...</p>}
                </div>
            )}
            {lastDaySeriesData.length > 0 && (
                <div className="bg-gray-800 p-4 rounded-xl shadow-lg border border-gray-700">
                    <h2 className="text-lg font-semibold text-gray-200 mb-4 px-2">Recent Trend (Last 5 Days)</h2>
                    {isChartLibReady ? <CandlestickChart seriesData={lastDaySeriesData} stockName={stockSymbols[selectedSymbol]}/> : <p className="text-center text-gray-400 py-12 animate-pulse">Loading Chart Engine...</p>}
                </div>
            )}
        </div>
      </div>
    </div>
  );
}

export default App;