import pandas as pd
import json
import sys
import os
# import gspread
import traceback
import time
from google.oauth2.service_account import Credentials
import yfinance as yf
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier

def get_stock_data(symbol):
    """
    Fetches daily stock data using Yahoo Finance, automatically retrying on failure.
    """
    fetch_symbol = symbol
    for attempt in range(3):
        try:
            ticker = yf.Ticker(fetch_symbol)
            data = ticker.history(period="2y")
            if not data.empty:
                data = data[['Open', 'High', 'Low', 'Close', 'Volume']]
                return data
        except Exception as e:
            print(f"Attempt {attempt + 1} for {fetch_symbol} failed with error: {e}. Retrying...")
        time.sleep(1)
    return None

# def write_to_google_sheet(data, spreadsheet_id, sheet_name):
#     """Writes a pandas DataFrame to the specified Google Sheet."""
#     credentials_path = "D:\College\\Credentials.json"
#     if not credentials_path or not os.path.exists(credentials_path):
#         raise FileNotFoundError(f"GOOGLE_APPLICATION_CREDENTIALS not set or path is invalid.")
#     creds = Credentials.from_service_account_file(
#         credentials_path, scopes=["https://www.googleapis.com/auth/spreadsheets"]
#     )
#     gc = gspread.authorize(creds)
#     sh = gc.open_by_key(spreadsheet_id)
#     try:
#         worksheet = sh.worksheet(sheet_name)
#     except gspread.WorksheetNotFound:
#         worksheet = sh.add_worksheet(title=sheet_name, rows="1000", cols="20")
#     worksheet.clear()
#     data_to_write = data.reset_index()
#     date_col = 'Date' if 'Date' in data_to_write.columns else 'Datetime'
#     data_to_write[date_col] = pd.to_datetime(data_to_write[date_col]).dt.strftime('%Y-%m-%d')
#     headers = data_to_write.columns.tolist()
#     rows = data_to_write.astype(str).values.tolist()
#     worksheet.append_row(headers, value_input_option='USER_ENTERED')
#     worksheet.append_rows(rows, value_input_option='USER_ENTERED')

def create_features_and_target(df):
    """Engineers features and creates the target variable for the ML model."""
    features_df = df.copy()
    features_df['Price_Change'] = features_df['Close'].diff().shift(1)
    features_df['SMA_5'] = features_df['Close'].rolling(window=5).mean().shift(1)
    features_df['SMA_10'] = features_df['Close'].rolling(window=10).mean().shift(1)
    features_df['Target'] = (features_df['Close'] > features_df['Close'].shift(1)).astype(int)
    features_df.dropna(inplace=True)
    return features_df

def train_and_predict_with_validation(df):
    """
    Trains a model on a training set, tests on a testing set, and validates its prediction on the most recent day's data.
    """
    if len(df) < 30:
        return "Not enough data", "N/A", "N/A", 0.0

    features = ['Open', 'High', 'Low', 'Volume', 'Price_Change', 'SMA_5', 'SMA_10']
    X = df[features]
    y = df['Target']

    # Last day for validation
    X_validate = X.iloc[[-1]]
    y_validate = y.iloc[-1]

    # The rest of the data for training and testing
    X_model = X.iloc[:-1]
    y_model = y.iloc[:-1]

    # Split data into training and testing sets
    X_train, X_test, y_train, y_test = train_test_split(X_model, y_model, test_size=0.2, random_state=42)

    model = RandomForestClassifier(n_estimators=100, min_samples_split=10, random_state=42)
    model.fit(X_train, y_train)

    # Calculate accuracy on the testing set
    accuracy = model.score(X_test, y_test)

    # Prediction for the last day
    last_day_prediction_code = model.predict(X_validate)[0]
    last_day_prediction_text = "Up" if last_day_prediction_code == 1 else "Down"
    actual_result_text = "Up" if y_validate == 1 else "Down"
    validation_result = "Correct" if last_day_prediction_text == actual_result_text else "Incorrect"
    
    return last_day_prediction_text, validation_result, actual_result_text, accuracy

def main():
    """Main execution block."""
    response = {}
    try:
        input_data_str = sys.argv[1]
        input_data = json.loads(input_data_str.strip("''"))
        stock_symbol = input_data.get("stock_symbol")
        if not stock_symbol:
            raise ValueError("Stock symbol not provided.")

        full_stock_data = get_stock_data(stock_symbol)
        if full_stock_data is None:
            raise ValueError(f"Could not retrieve data for {stock_symbol}.")

        response = {
            "status": "success",
            "message": f"Successfully fetched data for {stock_symbol}",
            "stock_data": full_stock_data.to_json(date_format='iso'),
        }

        try:
            data_for_model = create_features_and_target(full_stock_data.copy())
            prediction, validation, actual, accuracy = train_and_predict_with_validation(data_for_model)
            response["prediction_for_last_day"] = prediction
            response["validation_result"] = validation
            response["actual_result_for_last_day"] = actual
            response["accuracy"] = accuracy
            
            last_day_featured_data = data_for_model.tail(2).round(2).reset_index()
            # --- FIX: Convert timestamp in the 'Date' column to a readable string ---
            last_day_featured_data['Date'] = last_day_featured_data['Date'].dt.strftime('%Y-%m-%d')
            response["last_day_data"] = last_day_featured_data.to_json(orient="records")
            
        except Exception as prediction_error:
            response["prediction_error"] = f"Could not generate prediction: {prediction_error}"

        # try:
        #     spreadsheet_id = "1TyGJxTKT-D0nj3JrCMJGbqhq39m8lwxweybZFh3NpOs"
        #     write_to_google_sheet(full_stock_data, spreadsheet_id, stock_symbol)
        #     response["google_sheet_status"] = f"Successfully wrote data to Google Sheet '{stock_symbol}'."
        # except Exception as sheet_error:
        #     response["google_sheet_status"] = f"Failed to write to Google Sheet: {sheet_error}"

    except Exception as e:
        response = {"status": "error", "message": str(e), "traceback": traceback.format_exc()}
    finally:
        print(json.dumps(response, indent=4))

if __name__ == "__main__":
    main()
