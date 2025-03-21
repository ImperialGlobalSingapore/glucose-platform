#!/usr/bin/env python

import os
import sys
import random
import sqlite3
import numpy as np
from datetime import datetime, timedelta

# Database file path
DB_FILE = 'instance/glucose.db'

def ensure_dir_exists(file_path):
    """Ensure directory exists"""
    directory = os.path.dirname(file_path)
    if not os.path.exists(directory):
        os.makedirs(directory)

def create_tables(conn):
    """Create database tables"""
    cursor = conn.cursor()
    
    # Create patient table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS patient (
        id TEXT PRIMARY KEY,
        age INTEGER,
        weight REAL,
        height REAL,
        has_diabetes BOOLEAN,
        diabetes_type INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')
    
    # Create glucose reading table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS glucose_reading (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id TEXT,
        glucose REAL NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (patient_id) REFERENCES patient (id)
    )
    ''')
    
    # Create index
    cursor.execute('''
    CREATE INDEX IF NOT EXISTS idx_glucose_patient_time ON glucose_reading (patient_id, timestamp)
    ''')
    
    conn.commit()

def create_test_data(conn):
    """Create test data"""
    cursor = conn.cursor()
    
    # Clear existing data
    cursor.execute("DELETE FROM glucose_reading")
    cursor.execute("DELETE FROM patient")
    conn.commit()
    
    print("Starting to create test data...")
    
    # Create test patients
    patient_ids = [f"P{i:03d}" for i in range(1, 11)]
    
    for patient_id in patient_ids:
        # Generate basic patient information
        age = random.randint(25, 75)
        weight = random.randint(50, 100)
        height = random.randint(150, 190)
        
        # Determine if patient has diabetes
        has_diabetes = random.choice([1, 0])  # Boolean values in SQLite
        diabetes_type = random.choice([1, 2]) if has_diabetes else None
        
        # Create patient record
        cursor.execute(
            "INSERT INTO patient (id, age, weight, height, has_diabetes, diabetes_type) VALUES (?, ?, ?, ?, ?, ?)",
            (patient_id, age, weight, height, has_diabetes, diabetes_type)
        )
        
        # Base glucose values based on diabetes status
        if has_diabetes:
            base_glucose = random.randint(120, 180)
            variability = random.uniform(30, 50)
        else:
            base_glucose = random.randint(70, 120)
            variability = random.uniform(10, 25)
        
        # Generate 24 hours of data at 5-minute intervals
        now = datetime.now()
        
        # Generate historical data
        for i in range(288):  # 12 readings/hour * 24 hours
            timestamp = now - timedelta(minutes=5*i)
            hour = timestamp.hour
            
            # Meal effects
            meal_effect = 0
            if hour in [7, 8]:  # Breakfast
                meal_effect = random.uniform(20, 40)
            elif hour in [12, 13]:  # Lunch
                meal_effect = random.uniform(25, 45)
            elif hour in [18, 19]:  # Dinner
                meal_effect = random.uniform(30, 50)
            
            # Add randomness
            noise = random.normalvariate(0, variability/4)
            
            # Calculate glucose with time-of-day variation
            time_factor = 1 + 0.1 * np.sin(2 * np.pi * i / 288)
            glucose = base_glucose * time_factor + meal_effect + noise
            
            # For diabetic patients, simulate occasional extreme values
            if has_diabetes and random.random() < 0.05:
                glucose += random.choice([-40, 40])
            
            # Ensure glucose values are within reasonable range
            glucose = max(40, min(300, glucose))
            
            # Create glucose reading
            cursor.execute(
                "INSERT INTO glucose_reading (patient_id, glucose, timestamp) VALUES (?, ?, ?)",
                (patient_id, round(glucose, 1), timestamp)
            )
    
    # Commit all changes
    conn.commit()
    print(f"Successfully created {len(patient_ids)} patients and {len(patient_ids) * 288} glucose readings")

def main():
    try:
        # Ensure directory exists
        ensure_dir_exists(DB_FILE)
        
        # Connect to SQLite database
        conn = sqlite3.connect(DB_FILE)
        
        # Create tables
        create_tables(conn)
        
        # Generate test data
        create_test_data(conn)
        
        conn.close()
        print(f"Data successfully written to {DB_FILE}")
        
    except Exception as e:
        print(f"Error: {e}")
        return 1
    
    return 0

if __name__ == "__main__":
    sys.exit(main()) 