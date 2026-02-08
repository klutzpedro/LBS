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
    print("Clear Passport & Perlintasan Cache Script")
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
        passports = cache.get("passports", [])
        if not passports:
            caches_without_passports.append(cache)
            print(f"   - {cache.get('cache_key')}: NO passports array (will delete)")
        else:
            print(f"   - {cache.get('cache_key')}: OK ({len(passports)} passports)")
    
    if caches_without_passports:
        print(f"\n   Found {len(caches_without_passports)} caches without passports array")
        confirm = input("   Delete these caches? (y/n): ")
        if confirm.lower() == 'y':
            for cache in caches_without_passports:
                db.simple_query_cache.delete_one({"_id": cache["_id"]})
            print(f"   ✓ Deleted {len(caches_without_passports)} passport caches")
    else:
        print("   ✓ All passport caches have passports array - OK")
    
    # Also check perlintasan caches
    print("\n2. Checking perlintasan caches...")
    perl_caches = list(db.simple_query_cache.find({
        "$or": [
            {"query_type": "perlintasan"},
            {"cache_key": {"$regex": "^perlintasan:"}}
        ]
    }))
    print(f"   Found {len(perl_caches)} perlintasan cache entries")
    
    caches_without_crossings = []
    for cache in perl_caches:
        crossings = cache.get("crossings", [])
        if not crossings:
            caches_without_crossings.append(cache)
            print(f"   - {cache.get('cache_key')}: NO crossings array (will delete)")
        else:
            print(f"   - {cache.get('cache_key')}: OK ({len(crossings)} crossings)")
    
    if caches_without_crossings:
        print(f"\n   Found {len(caches_without_crossings)} caches without crossings array")
        confirm = input("   Delete these caches? (y/n): ")
        if confirm.lower() == 'y':
            for cache in caches_without_crossings:
                db.simple_query_cache.delete_one({"_id": cache["_id"]})
            print(f"   ✓ Deleted {len(caches_without_crossings)} perlintasan caches")
    else:
        print("   ✓ All perlintasan caches have crossings array - OK")
    
    # Option to clear ALL passport and perlintasan caches
    print("\n3. Optional: Clear ALL passport and perlintasan caches")
    print("   This will force fresh queries for all passport/perlintasan data")
    confirm_all = input("   Delete ALL passport and perlintasan caches? (y/n): ")
    if confirm_all.lower() == 'y':
        result1 = db.simple_query_cache.delete_many({"query_type": "passport_wni"})
        result2 = db.simple_query_cache.delete_many({"cache_key": {"$regex": "^perlintasan:"}})
        result3 = db.simple_query_cache.delete_many({"query_type": "perlintasan"})
        print(f"   ✓ Deleted {result1.deleted_count} passport caches")
        print(f"   ✓ Deleted {result2.deleted_count + result3.deleted_count} perlintasan caches")
    
    print("\n" + "=" * 60)
    print("Done! Old investigations will need to be re-run to get")
    print("fresh passport and perlintasan data.")
    print("=" * 60)

if __name__ == "__main__":
    main()
