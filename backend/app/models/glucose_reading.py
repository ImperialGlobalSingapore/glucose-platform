"""
GlucoseReading model - Represents a glucose reading for a patient
"""
import sqlite3
from datetime import datetime, timedelta


class GlucoseReading:
    """GlucoseReading model that uses SQLite3 directly instead of SQLAlchemy"""
    
    @staticmethod
    def create_table(conn):
        """Create the glucose_reading table if it doesn't exist"""
        cursor = conn.cursor()
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS glucose_reading (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id TEXT,
            glucose REAL NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (patient_id) REFERENCES patient (id)
        )
        ''')
        
        # Create index for faster queries
        cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_glucose_patient_time ON glucose_reading (patient_id, timestamp)
        ''')
        
        conn.commit()
    
    @staticmethod
    def create(conn, reading_data):
        """Create a new glucose reading"""
        cursor = conn.cursor()
        
        # Format timestamp if provided, otherwise use current time
        timestamp = reading_data.get('timestamp', datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
        
        cursor.execute(
            "INSERT INTO glucose_reading (patient_id, glucose, timestamp) VALUES (?, ?, ?)",
            (
                reading_data['patient_id'],
                reading_data['glucose'],
                timestamp
            )
        )
        
        reading_id = cursor.lastrowid
        conn.commit()
        
        return {
            'id': reading_id,
            'patient_id': reading_data['patient_id'],
            'glucose': reading_data['glucose'],
            'timestamp': timestamp
        }
    
    @staticmethod
    def get_for_patient(conn, patient_id, hours=3, limit=None):
        """Get glucose readings for a patient within the specified time range"""
        cursor = conn.cursor()
        
        # If requesting 24 hours or more of data, return ALL data points for the patient
        # This ensures that when "Initialize" button is clicked, all 288 points are shown
        if hours >= 24:
            print(f"Requesting 24+ hours of data for {patient_id}, returning ALL data points")
            query = "SELECT * FROM glucose_reading WHERE patient_id = ? ORDER BY timestamp"
            params = [patient_id]
            
            # Apply limit if specified
            if limit:
                query += " LIMIT ?"
                params.append(limit)
            
            cursor.execute(query, params)
            rows = cursor.fetchall()
            
            # Log some diagnostic info about the data
            if rows:
                print(f"Retrieved {len(rows)} data points for patient {patient_id}")
                if len(rows) >= 2:
                    first_time = datetime.strptime(rows[0][3], "%Y-%m-%d %H:%M:%S")
                    last_time = datetime.strptime(rows[-1][3], "%Y-%m-%d %H:%M:%S")
                    time_diff = (last_time - first_time).total_seconds() / 3600  # hours
                    print(f"Data spans {time_diff:.2f} hours from {first_time} to {last_time}")
                    
                    # Count data points per hour to identify any gaps
                    hour_count = {}
                    for row in rows:
                        time = datetime.strptime(row[3], "%Y-%m-%d %H:%M:%S")
                        hour_key = time.strftime("%Y-%m-%d %H")
                        hour_count[hour_key] = hour_count.get(hour_key, 0) + 1
                    
                    print(f"Distribution of data points across {len(hour_count)} hours:")
                    for hour, count in sorted(hour_count.items()):
                        print(f"  {hour}: {count} points")
                    
                    if len(hour_count) < 24:
                        print("WARNING: Data spans less than 24 distinct hours!")
            
            return [{
                'id': row[0],
                'patient_id': row[1],
                'glucose': row[2],
                'timestamp': row[3]
            } for row in rows]
        
        # For smaller time ranges, use the standard time filtering
        print(f"Requesting {hours} hours of data for {patient_id} with standard time filtering")
        hours_ago = (datetime.now() - timedelta(hours=hours)).strftime("%Y-%m-%d %H:%M:%S")
        
        query = "SELECT * FROM glucose_reading WHERE patient_id = ? AND timestamp >= ? ORDER BY timestamp"
        params = [patient_id, hours_ago]
        
        if limit:
            query += " LIMIT ?"
            params.append(limit)
        
        cursor.execute(query, params)
        rows = cursor.fetchall()
        
        print(f"Retrieved {len(rows)} data points for {hours}-hour range for patient {patient_id}")
        
        return [{
            'id': row[0],
            'patient_id': row[1],
            'glucose': row[2],
            'timestamp': row[3]
        } for row in rows]
    
    @staticmethod
    def get_latest_for_patient(conn, patient_id):
        """Get the latest glucose reading for a patient"""
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM glucose_reading WHERE patient_id = ? ORDER BY timestamp DESC LIMIT 1",
            [patient_id]
        )
        row = cursor.fetchone()
        
        if row:
            return {
                'id': row[0],
                'patient_id': row[1],
                'glucose': row[2],
                'timestamp': row[3]
            }
        return None
    
    @staticmethod
    def delete_for_patient(conn, patient_id):
        """Delete all glucose readings for a patient"""
        cursor = conn.cursor()
        cursor.execute("DELETE FROM glucose_reading WHERE patient_id = ?", [patient_id])
        conn.commit() 