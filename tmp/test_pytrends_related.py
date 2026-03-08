from pytrends.request import TrendReq
import pandas as pd
import sys
import json

def fetch_related_queries(keyword='인공지능'):
    try:
        print(f"--- Fetching Related Queries for: {keyword} ---")
        pytrends = TrendReq(hl='ko-KR', tz=540)
        
        # Build payload for the last 3 months in Korea
        pytrends.build_payload(kw_list=[keyword], timeframe='today 3-m', geo='KR')
        
        related_queries = pytrends.related_queries()
        
        if keyword in related_queries:
            top_df = related_queries[keyword]['top']
            rising_df = related_queries[keyword]['rising']
            
            print("\n[TOP Related Queries]")
            if top_df is not None and not top_df.empty:
                print(top_df.head(10).to_string(index=False))
            else:
                print("No top queries found.")
                
            print("\n[RISING Related Queries]")
            if rising_df is not None and not rising_df.empty:
                print(rising_df.head(10).to_string(index=False))
            else:
                print("No rising queries found.")
        else:
            print(f"No data found for keyword: {keyword}")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    kw = sys.argv[1] if len(sys.argv) > 1 else '인공지능'
    fetch_related_queries(kw)
