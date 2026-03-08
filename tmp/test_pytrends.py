from pytrends.request import TrendReq
import pandas as pd
import sys

def test_pytrends():
    try:
        print("--- Google Trends Test (pytrends) ---")
        # Initialize (hl='ko-KR', tz=540 for Korea)
        pytrends = TrendReq(hl='ko-KR', tz=540)

        print("1. Fetching Daily Trending Searches (South Korea)...")
        trending_searches = pytrends.trending_searches(pn='south_korea')
        print("Top 5 Trending Searches:")
        print(trending_searches.head(5))
        print("\n")

        print("2. Fetching Related Queries for '인공지능'...")
        pytrends.build_payload(kw_list=['인공지능'], timeframe='today 3-m', geo='KR')
        related_queries = pytrends.related_queries()
        
        if '인공지능' in related_queries:
            top_queries = related_queries['인공지능']['top']
            rising_queries = related_queries['인공지능']['rising']
            
            print("Top Related Queries:")
            print(top_queries.head(5) if top_queries is not None else "No data")
            
            print("\nRising Related Queries:")
            print(rising_queries.head(5) if rising_queries is not None else "No data")
        else:
            print("No related queries found.")

    except Exception as e:
        print(f"Error during test: {e}")
        # Not exiting with 1 to see the output
        # sys.exit(1)

if __name__ == "__main__":
    test_pytrends()
