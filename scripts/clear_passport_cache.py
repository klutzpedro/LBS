#!/usr/bin/env python3
"""
Script untuk membersihkan cache passport yang tidak memiliki array passports.
Jalankan di VPS setelah deploy code baru.

Usage: python3 clear_passport_cache.py
"""

import pymongo
import os
from datetime import datetime

# Get MongoDB URL from environment
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'netra')

def main():
    print("=" * 60)
    print("Clear Passport Cache Script")
    print("=" * 60)
    
    client = pymongo.MongoClient(MONGO_URL)
    db = client[DB_NAME]
    
    # Find all passport caches without passports array
    print("\n1. Checking passport_wni caches...")
    passport_caches = list(db.simple_query_cache.find({
        "query_type": "passport_wni"
    }))
    
    print(f"   Found {len(passport_caches)} passport_wni cache entries")
    
    caches_without_passports = []
    for cache in passport_caches:
        if not cache.get("passports"):
            caches_without_passports.append(cache)
            print(f"   - {cache.get('cache_key')}: NO passports array")
    
    if caches_without_passports:
        print(f"\n   Found {len(caches_without_passports)} caches without passports array")
        confirm = input("   Delete these caches? (y/n): ")
        if confirm.lower() == 'y':
            for cache in caches_without_passports:
                db.simple_query_cache.delete_one({"_id": cache["_id"]})
            print(f"   Deleted {len(caches_without_passports)} passport caches")
    else:
        print("   All passport caches have passports array - OK")
    
    # Also check perlintasan caches
    print("\n2. Checking perlintasan caches...")
    perl_caches = list(db.simple_query_cache.find({
        "query_type": "perlintasan"
    }))
    print(f"   Found {len(perl_caches)} perlintasan cache entries")
    
    caches_without_crossings = []
    for cache in perl_caches:
        if not cache.get("crossings"):
            caches_without_crossings.append(cache)
            print(f"   - {cache.get('cache_key')}: NO crossings array")
    
    if caches_without_crossings:
        print(f"\n   Found {len(caches_without_crossings)} caches without crossings array")
        confirm = input("   Delete these caches? (y/n): ")
        if confirm.lower() == 'y':
            for cache in caches_without_crossings:
                db.simple_query_cache.delete_one({"_id": cache["_id"]})
            print(f"   Deleted {len(caches_without_crossings)} perlintasan caches")
    else:
        print("   All perlintasan caches have crossings array - OK")
    
    print("\n" + "=" * 60)
    print("Done! Old investigations will need to be re-run to get perlintasan data.")
    print("=" * 60)

if __name__ == "__main__":
    main()
