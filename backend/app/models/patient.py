"""
Patient model - Represents a patient in the glucose monitoring system
"""
import sqlite3
from datetime import datetime


class Patient:
    """Patient model that uses SQLite3 directly instead of SQLAlchemy"""
    
    @staticmethod
    def create_table(conn):
        """Create the patient table if it doesn't exist"""
        cursor = conn.cursor()
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
        conn.commit()
    
    @staticmethod
    def get_by_id(conn, patient_id):
        """Get a patient by ID"""
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM patient WHERE id = ?", [patient_id])
        row = cursor.fetchone()
        
        if row:
            return {
                'id': row[0],
                'age': row[1],
                'weight': row[2],
                'height': row[3],
                'has_diabetes': bool(row[4]),
                'diabetes_type': row[5],
                'created_at': row[6]
            }
        return None
    
    @staticmethod
    def get_all(conn):
        """Get all patients"""
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM patient")
        rows = cursor.fetchall()
        
        return [row[0] for row in rows]
    
    @staticmethod
    def create(conn, patient_data):
        """Create a new patient"""
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO patient (id, age, weight, height, has_diabetes, diabetes_type) VALUES (?, ?, ?, ?, ?, ?)",
            (
                patient_data['id'],
                patient_data['age'],
                patient_data['weight'],
                patient_data['height'],
                1 if patient_data['has_diabetes'] else 0,
                patient_data.get('diabetes_type', None)
            )
        )
        conn.commit()
        return patient_data
    
    @staticmethod
    def exists(conn, patient_id):
        """Check if a patient exists"""
        cursor = conn.cursor()
        cursor.execute("SELECT 1 FROM patient WHERE id = ?", [patient_id])
        return cursor.fetchone() is not None 