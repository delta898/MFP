from pytrends.request import TrendReq
import pandas as pd
import sys
import time

def test_pytrends_robust():
    try:
        print("--- Google Trends Test (Robust Mode) ---")
        pytrends = TrendReq(hl='ko-KR', tz=540)

        # Basic interest over time test
        print("1. Fetching Interest Over Time for '인공지능'...")
        pytrends.build_payload(kw_list=['인공지능'], timeframe='today 1-m', geo='KR')
        data = pytrends.interest_over_time()
        
        if not data.empty:
            print("Successfully fetched trend data:")
            print(data.head(5))
        else:
            print("Fetched data is empty (but no error).")

        time.sleep(1) # Prevent too rapid requests

        # Try real-time trending (newer endpoint)
        print("\n2. Fetching Realtime Trending Searches (Korea)...")
        try:
            rt_trends = pytrends.realtime_trending_searches(pn='KR')
            print("Top Realtime Trends:")
            print(rt_trends.head(5))
        except Exception as e:
            print(f"Realtime trends failed (common): {e}")

    except Exception as e:
        print(f"Error during test: {e}")

if __name__ == "__main__":
    test_pytrends_robust()
