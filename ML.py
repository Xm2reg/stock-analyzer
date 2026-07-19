import pandas as pd
import json
import sys
import os
import traceback
import time
import requests
import yfinance as yf
from datetime import datetime, timedelta
from alpha_vantage.timeseries import TimeSeries
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split, GridSearchCV

# --- CONFIGURATION ---
ALPHA_VANTAGE_API_KEY = "TAJUW1I4C77TYVI8" 

def get_stock_data(symbol):
    """
    Strategy:
    1. Try Alpha Vantage (Primary).
    2. If it fails (Rate Limit/Error), use yfinance (Backup).
    """
    # --- ATTEMPT 1: ALPHA VANTAGE ---
    try:
        # print(f"Attempting to fetch {symbol} from Alpha Vantage...")
        ts = TimeSeries(key=ALPHA_VANTAGE_API_KEY, output_format='pandas')
        # outputsize='full' gives 20 years of data, 'compact' gives 100 days
        # --- INSIDE get_stock_data ATTEMPT 1 ---
        data, meta_data = ts.get_daily(symbol=symbol, outputsize='full')

# NEW: Filter for the last 2 years (730 days)
        two_years_ago = datetime.now() - timedelta(days=730)
        data = data[data.index >= two_years_ago.strftime('%Y-%m-%d')]
        if data is not None and not data.empty:
            
            # Rename columns to standard names
            data.columns = ['Open', 'High', 'Low', 'Close', 'Volume']
            
            # Sort index to ensure chronological order (Oldest -> Newest)
            data.sort_index(ascending=True, inplace=True)
            
            # Ensure index is datetime
            data.index = pd.to_datetime(data.index)
            
            # print("Success: Retrieved from Alpha Vantage.")
            return data
            
    except Exception as e:
        # print(f"Alpha Vantage failed ({str(e)}). Switching to yfinance...")
        pass # Just catch the error and move to the backup

    # --- ATTEMPT 2: YFINANCE (FALLBACK) ---
    try:
        # print(f"Attempting to fetch {symbol} from yfinance...")
        ticker = yf.Ticker(symbol)
        data = ticker.history(period="2y") # Fetch 2 years to match sentiment scope
        
        if data is not None and not data.empty:
            # yfinance returns extra columns, keep only what we need
            data = data[['Open', 'High', 'Low', 'Close', 'Volume']]
            
            # Normalize index (remove time component) and remove timezone
            data.index = pd.to_datetime(data.index).normalize()
            if data.index.tz is not None:
                data.index = data.index.tz_localize(None)
            
            data.sort_index(ascending=True, inplace=True)
            
            # print("Success: Retrieved from yfinance.")
            return data
            
    except Exception as e:
        # print(f"yfinance failed: {e}")
        return None

    return None

def get_sentiment_data(symbol, days=730):
    """
    Fetches historical news sentiment from Alpha Vantage.
    Returns a DataFrame with 'Date' and 'Sentiment_Score'.
    """
    url = "https://www.alphavantage.co/query"
    time_from = (datetime.now() - timedelta(days=days)).strftime('%Y%m%dT%H%M')
    
    params = {
        "function": "NEWS_SENTIMENT",
        "tickers": symbol,
        "time_from": time_from,
        "limit": 1000,
        "apikey": ALPHA_VANTAGE_API_KEY
    }
    
    try:
        response = requests.get(url, params=params)
        data = response.json()
        
        if "feed" not in data:
            return None

        sentiment_list = []
        for item in data["feed"]:
            date_str = item["time_published"][:8]
            date_obj = datetime.strptime(date_str, "%Y%m%d").strftime("%Y-%m-%d")
            
            score = 0
            for ticker_sentiment in item.get("ticker_sentiment", []):
                if ticker_sentiment["ticker"] == symbol:
                    score = float(ticker_sentiment["ticker_sentiment_score"])
                    break
            
            sentiment_list.append({"Date": date_obj, "Sentiment_Score": score})
        
        if not sentiment_list:
            return None
            
        sent_df = pd.DataFrame(sentiment_list)
        sent_df = sent_df.groupby("Date").mean()
        return sent_df

    except Exception as e:
        return None

def create_features_and_target(df, sentiment_df=None):
    features_df = df.copy()
    features_df.index = pd.to_datetime(features_df.index).normalize()
    
    # --- 1. RSI CALCULATION (14-period) ---
    delta = features_df['Close'].diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
    rs = gain / loss
    features_df['RSI'] = (100 - (100 / (1 + rs))).shift(1)

    # --- 2. MACD CALCULATION (12, 26, 9) ---
    ema_12 = features_df['Close'].ewm(span=12, adjust=False).mean()
    ema_26 = features_df['Close'].ewm(span=26, adjust=False).mean()
    features_df['MACD'] = (ema_12 - ema_26).shift(1)
    features_df['MACD_Signal'] = features_df['MACD'].ewm(span=9, adjust=False).mean().shift(1)

    # --- 3. BASIC INDICATORS ---
    features_df['Price_Change'] = features_df['Close'].diff().shift(1)
    features_df['SMA_5'] = features_df['Close'].rolling(window=5).mean().shift(1)
    features_df['SMA_10'] = features_df['Close'].rolling(window=10).mean().shift(1)
    
    # --- 4. ALIGN SENTIMENT ---
    if sentiment_df is not None:
        sentiment_df.index = pd.to_datetime(sentiment_df.index).normalize()
        features_df = features_df.join(sentiment_df, how='left')
        features_df['Sentiment_Score'] = features_df['Sentiment_Score'].fillna(0).shift(1)
    else:
        features_df['Sentiment_Score'] = 0.0

    # --- 5. TARGET ---
    features_df['Target'] = (features_df['Close'] > features_df['Close'].shift(1)).astype(int)
    
    # Remove rows where indicators couldn't be calculated (first 26 days)
    features_df.dropna(inplace=True)
    return features_df

def train_and_predict_with_validation(df):
    """Trains model using GridSearchCV to find optimal hyperparameters."""
    if len(df) < 30:
        return "Not enough data", "N/A", "N/A", 0.0
    features = [
    'Open', 'High', 'Low', 'Volume', 'Price_Change', 
    'SMA_5', 'SMA_10', 'RSI', 'MACD', 'MACD_Signal', 'Sentiment_Score'
    ]
    features = [f for f in features if f in df.columns]

    X = df[features]
    y = df['Target']

    # Split for validation (last day) and modeling
    X_validate = X.iloc[[-1]]
    y_validate = y.iloc[-1]
    X_model = X.iloc[:-1]
    y_model = y.iloc[:-1]

    X_train, X_test, y_train, y_test = train_test_split(X_model, y_model, test_size=0.2, random_state=42)

    # Define the parameter grid to search
    param_grid = {
        'n_estimators': [50, 100, 200],
        'max_depth': [None, 10, 20],
        'min_samples_split': [2, 5, 10],
        'max_features': ['sqrt', 'log2']
    }

    # Initialize the base model
    rf = RandomForestClassifier(random_state=42)

    # Initialize GridSearchCV
    # cv=5 uses 5-fold cross-validation to ensure the results are stable
    grid_search = GridSearchCV(estimator=rf, param_grid=param_grid, cv=5, n_jobs=-1, scoring='accuracy')
    
    # Run the search
    grid_search.fit(X_train, y_train)

    # Use the best model found by the search
    best_model = grid_search.best_estimator_
    
    accuracy = best_model.score(X_test, y_test)
    last_day_prediction_code = best_model.predict(X_validate)[0]
    
    last_day_prediction_text = "Up" if last_day_prediction_code == 1 else "Down"
    actual_result_text = "Up" if y_validate == 1 else "Down"
    validation_result = "Correct" if last_day_prediction_text == actual_result_text else "Incorrect"
    
    # print(f"Best Parameters: {grid_search.best_params_}") # Optional: See what was chosen
    return last_day_prediction_text, validation_result, actual_result_text, accuracy

def main():
    response = {}
    try:
        if len(sys.argv) > 1:
            input_data_str = sys.argv[1]
            input_data = json.loads(input_data_str.strip("''"))
            stock_symbol = input_data.get("stock_symbol")
        else:
            stock_symbol = "IBM" # Default for testing

        if not stock_symbol:
            raise ValueError("Stock symbol not provided.")

        # 1. Fetch Data (Alpha Vantage -> Fallback to yfinance)
        full_stock_data = get_stock_data(stock_symbol)
        if full_stock_data is None:
            raise ValueError(f"Could not retrieve stock data for {stock_symbol} (Both APIs failed).")

        # 2. Fetch Sentiment (Alpha Vantage only)
        sentiment_data = get_sentiment_data(stock_symbol)

        try:
            # 3. ML Pipeline
            data_for_model = create_features_and_target(full_stock_data.copy(), sentiment_data)
            prediction, validation, actual, accuracy = train_and_predict_with_validation(data_for_model)
            
            response = {
                "status": "success",
                "message": f"Successfully processed data for {stock_symbol}",
                "stock_data": data_for_model.reset_index().to_json(orient='records', date_format='iso'),
                "prediction_for_last_day": prediction,
                "validation_result": validation,
                "actual_result_for_last_day": actual,
                "accuracy": accuracy,
                "sentiment_used": "Yes" if sentiment_data is not None else "No"
            }
            
            last_day_featured_data = data_for_model.tail(2).round(2).reset_index()
            if 'index' in last_day_featured_data.columns:
                last_day_featured_data.rename(columns={'index': 'Date'}, inplace=True)
            last_day_featured_data['Date'] = last_day_featured_data['Date'].dt.strftime('%Y-%m-%d')
            
            response["last_day_data"] = last_day_featured_data.to_json(orient="records")
            response["sentiment_used"] = "Yes" if sentiment_data is not None else "No"
            
        except Exception as prediction_error:
            response["prediction_error"] = f"Prediction failed: {str(prediction_error)}"
            response["traceback"] = traceback.format_exc()

    except Exception as e:
        response = {"status": "error", "message": str(e), "traceback": traceback.format_exc()}
    
    finally:
        print(json.dumps(response, indent=4))

if __name__ == "__main__":
    main()