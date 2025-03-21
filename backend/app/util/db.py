"""
Database utility functions
"""
import os
import sqlite3
from ..models.patient import Patient
from ..models.glucose_reading import GlucoseReading

# Database file path
DB_FILE = 'instance/glucose.db'

def get_db_connection():
    """Get a connection to the SQLite database"""
    # Make sure the directory exists
    if not os.path.exists('instance'):
        os.makedirs('instance')
    
    # Connect to the database and set row factory to get dict-like results
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db(recreate=False):
    """Initialize the database and create tables"""
    try:
        # Make sure the instance directory exists
        if not os.path.exists('instance'):
            os.makedirs('instance')
        
        # If recreate is True, delete the existing database file
        if recreate and os.path.exists(DB_FILE):
            os.remove(DB_FILE)
            print(f"Deleted old database file {DB_FILE}")
        
        # Get a connection to the database
        conn = get_db_connection()
        
        # Create tables using model methods
        Patient.create_table(conn)
        GlucoseReading.create_table(conn)
        
        conn.close()
        
        print("Database tables initialized successfully")
        return True
    except Exception as e:
        print(f"Error initializing database: {e}")
        return False 