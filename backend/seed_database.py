"""
Database Seeding Script for WASKITA LBS
======================================

This script seeds the database with initial data when the database is empty.
It runs automatically on server startup or can be triggered manually.

Usage:
  - Automatic: Runs on server startup if database is empty
  - Manual: python seed_database.py
  - Via API: POST /api/db/seed with JSON data
"""

import asyncio
import json
import os
from pathlib import Path
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Default seed data - minimal structure to get started
DEFAULT_SEED_DATA = {
    "cases": [
        {
            "id": "default-case-001",
            "name": "Default Case",
            "description": "Initial case for new deployment",
            "status": "active",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "target_count": 0
        }
    ],
    "aois": [],
    "schedules": [],
    "targets": [],
    "chat_messages": [],
    "position_history": [],
    "aoi_alerts": [],
    "users": []
}


async def check_database_empty(db) -> bool:
    """Check if database has any data"""
    collections = ['cases', 'targets', 'aois']
    
    for col in collections:
        count = await db[col].count_documents({})
        if count > 0:
            return False
    
    return True


async def seed_collection(db, collection_name: str, documents: list) -> int:
    """Seed a single collection with documents"""
    if not documents:
        return 0
    
    try:
        result = await db[collection_name].insert_many(documents)
        return len(result.inserted_ids)
    except Exception as e:
        logger.error(f"Error seeding {collection_name}: {e}")
        return 0


async def seed_database(db, seed_data: dict = None, force: bool = False) -> dict:
    """
    Seed the database with initial data
    
    Args:
        db: MongoDB database instance
        seed_data: Dictionary of collection data to seed
        force: If True, seed even if database has existing data
    
    Returns:
        Dictionary with seeding results
    """
    results = {
        "status": "skipped",
        "message": "",
        "collections": {}
    }
    
    # Check if database is empty
    is_empty = await check_database_empty(db)
    
    if not is_empty and not force:
        results["message"] = "Database already has data. Use force=True to override."
        logger.info(results["message"])
        return results
    
    # Use provided seed data or load from file
    if seed_data is None:
        seed_file = Path(__file__).parent / "seed_data.json"
        template_file = Path(__file__).parent / "seed_data_template.json"
        
        if seed_file.exists():
            logger.info(f"Loading seed data from {seed_file}")
            with open(seed_file, 'r') as f:
                loaded = json.load(f)
                seed_data = loaded.get('data', loaded)
        elif template_file.exists():
            logger.info(f"Loading seed template from {template_file}")
            with open(template_file, 'r') as f:
                loaded = json.load(f)
                seed_data = loaded.get('data', loaded)
        else:
            logger.info("Using default seed data")
            seed_data = DEFAULT_SEED_DATA
    
    # Seed each collection
    results["status"] = "completed"
    results["message"] = "Database seeded successfully"
    
    for collection_name, documents in seed_data.items():
        if isinstance(documents, list):
            count = await seed_collection(db, collection_name, documents)
            results["collections"][collection_name] = count
            logger.info(f"Seeded {count} documents to {collection_name}")
    
    return results


async def main():
    """Main function for manual seeding"""
    mongo_url = os.environ.get('MONGO_URL')
    db_name = os.environ.get('DB_NAME', 'waskita_lbs')
    
    if not mongo_url:
        logger.error("MONGO_URL environment variable not set")
        return
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    logger.info(f"Connected to database: {db_name}")
    
    # Run seeding
    results = await seed_database(db, force=False)
    
    logger.info(f"Seeding results: {json.dumps(results, indent=2)}")
    
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
