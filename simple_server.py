#!/usr/bin/env python

import os
import random
from datetime import datetime, timedelta
from flask import Flask, render_template, jsonify, request
from flask_socketio import SocketIO, emit
import sqlite3
import numpy as np
import csv
import pandas as pd

# Create Flask application
app = Flask(__name__)
app.config['SECRET_KEY'] = 'imperial_global_singapore_glucose_platform_key'
app.config['DEBUG'] = True

# Set database path
DB_FILE = 'instance/glucose.db'

# Set predefined patient data CSV file path
PATIENT_CSV = 'data/patient.csv'

# Global variables, store data flow status and interval tasks for each patient
patient_data_flows = {}

# Initialize database
def init_db(recreate=False):
    """Initialize database - If recreate is True, delete and recreate all tables"""
    try:
        # Ensure instance directory exists
        if not os.path.exists('instance'):
            os.makedirs('instance')
        
        # If recreation is needed, delete existing database file first
        if recreate and os.path.exists(DB_FILE):
            os.remove(DB_FILE)
            print(f"Deleted old database file {DB_FILE}")
        
        # Connect to database and create tables
        conn = sqlite3.connect(DB_FILE)
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
        conn.close()
        
        print("Database tables initialized successfully")
    except Exception as e:
        print(f"Error initializing database: {e}")

# Initialize SocketIO
socketio = SocketIO(app, cors_allowed_origins="*")

# Load predefined patient data
patient_data = {}

def load_patient_csv():
    """Load predefined patient data from CSV file"""
    global patient_data
    
    try:
        # Use pandas to read CSV file
        df = pd.read_csv(PATIENT_CSV)
        
        # Initialize patient data dictionary
        patient_data = {}
        
        # Group data by patient type
        for index, row in df.iterrows():
            patient_type = row['type']
            
            # Create patient data object
            patient_info = {
                'id': row['Name'],  # Use Name column as ID
                'type': patient_type,
                'age': int(row['age']),
                'weight': float(row['weight']),
                'height': float(row['height']),
                'has_diabetes': bool(int(row['has_diabetes'])),  # Convert to boolean
                'diabetes_type': random.choice([1, 2]) if int(row['has_diabetes']) else None  # Randomly assign diabetes type
            }
            
            # Save grouped by type
            if patient_type not in patient_data:
                patient_data[patient_type] = []
            
            patient_data[patient_type].append(patient_info)
        
        print(f"Loaded {sum(len(patients) for patients in patient_data.values())} patients from CSV")
    except Exception as e:
        print(f"Error loading patient CSV data: {e}")
        # If file doesn't exist or reading fails, create an empty dictionary
        patient_data = {}

# Load patient data at startup
load_patient_csv()

# Helper function: Execute database query
def query_db(query, args=(), one=False):
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute(query, args)
    rv = cur.fetchall()
    conn.close()
    return (rv[0] if rv else None) if one else rv

# Route: Home page
@app.route('/')
def index():
    return render_template('index.html')

# Get all patient types
@app.route('/patient_types')
def get_patient_types():
    return jsonify(list(patient_data.keys()))

# Get all patients of specified type
@app.route('/patients_by_type/<patient_type>')
def get_patients_by_type(patient_type):
    if patient_type in patient_data:
        # Build complete information including ID and type
        result = [{'id': p['id'], 'type': p['type']} for p in patient_data[patient_type]]
        return jsonify(result)
    return jsonify([])

# Route: Get all patient IDs
@app.route('/patients')
def get_patients():
    # First check patients in database
    db_patients = query_db("SELECT id FROM patient")
    db_patient_ids = [patient['id'] for patient in db_patients]
    
    # Add predefined patient IDs
    predefined_patient_ids = []
    for patients in patient_data.values():
        predefined_patient_ids.extend([p['id'] for p in patients])
    
    # Merge and deduplicate
    all_patient_ids = list(set(db_patient_ids + predefined_patient_ids))
    
    return jsonify(all_patient_ids)

# Route: Get specific patient information
@app.route('/patient/<patient_id>')
def get_patient(patient_id):
    # First check predefined patient data
    for patient_type, patients in patient_data.items():
        for patient in patients:
            if patient['id'] == patient_id:
                # Ensure all necessary fields are returned in correct format
                return jsonify({
                    'id': patient['id'],
                    'type': patient['type'],
                    'age': patient['age'],
                    'weight': float(patient['weight']),
                    'height': float(patient['height']),
                    'has_diabetes': bool(patient['has_diabetes']),
                    'diabetes_type': patient.get('diabetes_type')
                })
    
    # If predefined patient not found, check database
    patient = query_db("SELECT * FROM patient WHERE id = ?", [patient_id], one=True)
    if patient:
        # Ensure all necessary fields are returned in correct format
        return jsonify({
            'id': patient['id'],
            'age': patient['age'],
            'weight': float(patient['weight']),
            'height': float(patient['height']),
            'has_diabetes': bool(patient['has_diabetes']),
            'diabetes_type': patient['diabetes_type']
        })
    
    return jsonify({"error": "Patient not found"}), 404

# Route: Get patient's glucose data
@app.route('/glucose/<patient_id>')
def get_glucose(patient_id):
    limit = request.args.get('limit', default=100, type=int)
    hours = request.args.get('hours', default=3, type=int)
    
    # Check if patient exists
    patient_exists = False
    
    # First check predefined patients
    for patient_type, patients in patient_data.items():
        for patient in patients:
            if patient['id'] == patient_id:
                patient_exists = True
                break
        if patient_exists:
            break

    # If not a predefined patient, check database
    if not patient_exists:
        patient = query_db("SELECT * FROM patient WHERE id = ?", [patient_id], one=True)
        if not patient:
            return jsonify([])
    
    # Calculate timestamp for hours ago
    hours_ago = (datetime.now() - timedelta(hours=hours)).strftime("%Y-%m-%d %H:%M:%S")
    
    # Query glucose readings within specified time range, note that DESC sorting is used to place newest data first
    readings = query_db(
        "SELECT * FROM glucose_reading WHERE patient_id = ? AND timestamp >= ? ORDER BY timestamp DESC", 
        [patient_id, hours_ago]
    )
    
    # Convert to list
    data = [{
        'id': reading['id'],
        'patient_id': reading['patient_id'],
        'glucose': reading['glucose'],
        'timestamp': reading['timestamp']
    } for reading in readings]
    
    # Since frontend expects data to be sorted by time, we need to reverse the data again
    # So the newest data point will be at the end of the array
    data.reverse()
    
    return jsonify(data)

# Add new patient
@app.route('/patient/add', methods=['POST'])
def add_patient():
    try:
        data = request.json
        
        # Validate required fields
        required_fields = ['id', 'type', 'age', 'weight', 'height', 'has_diabetes']
        for field in required_fields:
            if field not in data:
                return jsonify({"success": False, "error": f"Missing required field: {field}"}), 400
        
        patient_id = data['id']
        
        # Check if ID already exists in predefined patients
        for patient_type, patients in patient_data.items():
            for patient in patients:
                if patient.get('id') == patient_id:
                    return jsonify({"success": False, "error": "Patient ID already exists in predefined data"}), 400
        
        # Check if ID already exists in database
        existing_patient = query_db("SELECT id FROM patient WHERE id = ?", [patient_id], one=True)
        if existing_patient:
            return jsonify({"success": False, "error": "Patient ID already exists in database"}), 400
        
        # Insert new patient into database
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO patient (id, age, weight, height, has_diabetes, diabetes_type) VALUES (?, ?, ?, ?, ?, ?)",
            (
                patient_id,
                data['age'],
                data['weight'],
                data['height'],
                1 if data['has_diabetes'] else 0,
                data.get('diabetes_type', None)
            )
        )
        conn.commit()
        conn.close()
        
        # Update in-memory patient data
        # Since we're just adding the patient to the database, no need to update patient_data in memory here
        
        return jsonify({"success": True, "message": "Patient added successfully"})
    
    except Exception as e:
        print(f"Error adding patient: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500

# Handle request to initialize patient data
@app.route('/initialize_patient_data/<patient_id>', methods=['POST'])
def initialize_patient_data(patient_id):
    # Check if it's a predefined patient (contains # symbol)
    is_predefined_patient = '#' in patient_id
    
    # If it's a predefined patient, check if it exists
    if is_predefined_patient:
        patient_found = False
        for patient_type, patients in patient_data.items():
            for patient in patients:
                if patient['id'] == patient_id:
                    patient_found = True
                    patient_info = patient
                    break
            if patient_found:
                break
        
        if not patient_found:
            return jsonify({"error": "Predefined patient not found"}), 404
    else:
        # If it's a custom patient, check the database
        patient = query_db("SELECT * FROM patient WHERE id = ?", [patient_id], one=True)
        if not patient:
            return jsonify({"error": "Patient not found"}), 404
        patient_info = {
            'id': patient['id'],
            'has_diabetes': bool(patient['has_diabetes'])
        }
    
    # Clear existing glucose data for the patient
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM glucose_reading WHERE patient_id = ?", [patient_id])
        conn.commit()
        
        # Determine base glucose values based on patient's diabetes status
        has_diabetes = patient_info.get('has_diabetes', random.choice([True, False]))
        if has_diabetes:
            base_glucose = random.randint(120, 180)
            variability = random.uniform(15, 25)  # Reduce variability for better continuity
        else:
            base_glucose = random.randint(70, 120)
            variability = random.uniform(5, 15)   # Reduce variability for better continuity
        
        # Ensure accurate 24-hour data is generated, starting from current time and going back
        # 5-minute intervals, 288 points total
        now = datetime.now()
        
        # Define meal times and use smoother impact function
        meal_times = [
            {'hour': 7.5, 'intensity': random.uniform(20, 40)},  # Breakfast
            {'hour': 12.5, 'intensity': random.uniform(25, 45)}, # Lunch
            {'hour': 18.5, 'intensity': random.uniform(30, 50)}  # Dinner
        ]
        
        # Initialize glucose value for first point
        prev_glucose = base_glucose
        all_data_points = []
        
        # Generate glucose history data (we generate backwards, from now to the past)
        for i in range(288):  # 12 readings/hour * 24 hours = 288 points
            # Generate a point every 5 minutes going backwards from now
            timestamp = now - timedelta(minutes=5*i)
            hour_in_day = timestamp.hour + timestamp.minute / 60.0
            
            # Calculate sum of all meal effects, using Gaussian function for smooth transition
            meal_effect = 0
            for meal in meal_times:
                # Calculate hour difference between current time and meal time
                hour_diff = min(abs(hour_in_day - meal['hour']), 
                                abs(hour_in_day - meal['hour'] + 24),
                                abs(hour_in_day - meal['hour'] - 24))
                # Use Gaussian function to smooth meal effect transition
                # Effect within 3 hours, peak at meal time
                if hour_diff < 3:
                    # Gaussian function, maximum at meal time, then gradually decreases
                    gaussian_factor = np.exp(-((hour_diff) ** 2) / (2 * 0.5 ** 2))
                    meal_effect += meal['intensity'] * gaussian_factor
            
            # Add circadian rhythm variation - use sine function to simulate natural daily fluctuation
            day_phase = 2 * np.pi * hour_in_day / 24.0
            circadian_effect = 8 * np.sin(day_phase)  # Circadian effect, reduce amplitude for smoothness
            
            # Add continuous randomness - based on previous point value, not completely random
            # Use mean regression model: current value tends to regress towards base value, but with random fluctuation
            regression_factor = 0.85  # Controls regression to previous value, higher means more continuity
            
            # Calculate target glucose value (base + meal + circadian)
            target_glucose = base_glucose + meal_effect + circadian_effect
            
            # Perform mean regression between target value and previous value
            # This ensures each point is related to the previous one, creating continuity
            glucose = regression_factor * prev_glucose + (1 - regression_factor) * target_glucose
            
            # Add some small random fluctuations
            noise = random.normalvariate(0, variability/6)  # Reduce noise for smoothness
            glucose += noise
            
            # For diabetic patients, occasionally add extreme values, but maintain continuity
            if has_diabetes and random.random() < 0.03:  # Reduce extreme value frequency
                # Smoother extreme value handling
                direction = 1 if glucose < base_glucose else -1  # Shift in direction opposite to current
                extreme_factor = random.uniform(15, 30)  # Smaller extreme values for realism
                glucose += direction * extreme_factor
            
            # Ensure glucose values are within reasonable range
            glucose = max(40, min(300, glucose))
            
            # Save as base value for next point
            prev_glucose = glucose
            
            # Add data point to list
            all_data_points.append({
                'patient_id': patient_id,
                'glucose': round(glucose, 1),
                'timestamp': timestamp
            })
        
        # Data is generated from now to past, but we need to insert in chronological order
        # Since we generated in reverse order, reverse the list to insert in time order
        all_data_points.reverse()
        
        # Insert all data points
        for point in all_data_points:
            cursor.execute(
                "INSERT INTO glucose_reading (patient_id, glucose, timestamp) VALUES (?, ?, ?)",
                (point['patient_id'], point['glucose'], point['timestamp'])
            )
        
        conn.commit()
        conn.close()
        
        return jsonify({
            "success": True, 
            "message": "Patient data initialized successfully",
            "data_points": 288,
            "is_predefined": is_predefined_patient
        })
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Socket.IO connection events
@socketio.on('connect')
def test_connect():
    print('Client connected')

@socketio.on('disconnect')
def test_disconnect():
    print('Client disconnected')

@socketio.on('subscribe')
def handle_subscribe(patient_id):
    print(f'Client subscribed to patient {patient_id}')
    
    # Send initial data
    reading = query_db(
        "SELECT * FROM glucose_reading WHERE patient_id = ? ORDER BY timestamp DESC LIMIT 1", 
        [patient_id], 
        one=True
    )
    
    if reading:
        emit('glucose_update', {
            'patient_id': patient_id,
            'data': [{
                'id': reading['id'],
                'patient_id': reading['patient_id'],
                'glucose': reading['glucose'],
                'timestamp': reading['timestamp']
            }]
        })

# Handle mock data updates
@app.route('/mock_update', methods=['POST'])
def mock_update():
    try:
        data = request.json
        if not data or 'patient_id' not in data or 'data' not in data or not isinstance(data['data'], list):
            return jsonify({"error": "Invalid data format"}), 400
        
        patient_id = data['patient_id']
        data_points = data['data']
        
        # Save data points to database
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        
        for point in data_points:
            glucose = point.get('glucose')
            timestamp = point.get('timestamp')
            if glucose is not None and timestamp:
                # Convert timestamp format
                try:
                    # If ISO format, convert to database format
                    if 'T' in timestamp:
                        timestamp = timestamp.replace('T', ' ')
                    if '.' in timestamp:
                        timestamp = timestamp.split('.')[0]
                except:
                    pass  # If conversion fails, use original timestamp
                
                # Insert data point
                cursor.execute(
                    "INSERT INTO glucose_reading (patient_id, glucose, timestamp) VALUES (?, ?, ?)",
                    (patient_id, glucose, timestamp)
                )
        
        conn.commit()
        conn.close()
        
        # Broadcast data update
        for point in data_points:
            socketio.emit('glucose_update', {
                'patient_id': patient_id,
                'glucose': point.get('glucose'),
                'timestamp': point.get('timestamp')
            })
        
        return jsonify({"success": True, "message": "Data updated successfully"})
    
    except Exception as e:
        print(f"Error in mock_update: {str(e)}")
        return jsonify({"error": str(e)}), 500

# New API endpoint: Start data flow
@app.route('/start_data_flow/<patient_id>', methods=['POST'])
def start_data_flow(patient_id):
    try:
        print(f"Received request to start data flow, patient ID: {patient_id}")
        
        # Check if patient exists
        patient_exists = False
        
        # Check predefined patients
        print(f"Checking if {patient_id} exists in predefined patient list")
        for patient_type, patients in patient_data.items():
            for p in patients:
                if p['id'] == patient_id:
                    patient_exists = True
                    print(f"Found predefined patient: {p}")
                    break
            if patient_exists:
                break
        
        if patient_exists:
            print(f"Patient {patient_id} found in predefined list")
        else:
            print(f"Patient {patient_id} not in predefined list, checking database")
            # If not a predefined patient, check database
            patient = query_db("SELECT * FROM patient WHERE id = ?", [patient_id], one=True)
            if patient:
                patient_exists = True
                print(f"Found patient in database: {patient}")
            else:
                print(f"Error: Patient {patient_id} does not exist in database either")
                return jsonify({"error": "Patient not found"}), 404
        
        # If a data flow is already running, stop it first
        if patient_id in patient_data_flows and patient_data_flows[patient_id]['active']:
            print(f"Found active data flow for patient {patient_id}, stopping it first")
            stop_patient_data_flow(patient_id)
        
        # Create a new scheduled task
        import threading
        
        def generate_data_for_patient():
            if patient_id in patient_data_flows and patient_data_flows[patient_id]['active']:
                print(f"Generating new data point for patient {patient_id}")
                new_data = generate_new_glucose_reading(patient_id, True)
                if new_data:
                    # Send data via WebSocket
                    print(f"Sending data via WebSocket: {new_data}")
                    socketio.emit('glucose_update', {
                        'patient_id': patient_id,
                        'data': [new_data]
                    })
                else:
                    print(f"Warning: Failed to generate data point for patient {patient_id}")
                
                # Schedule next run (if data flow is still active)
                if patient_id in patient_data_flows and patient_data_flows[patient_id]['active']:
                    print(f"Scheduling next data generation in 5 seconds")
                    timer = threading.Timer(5.0, generate_data_for_patient)  # Generate a data point every 5 seconds
                    timer.daemon = True
                    patient_data_flows[patient_id]['timer'] = timer
                    timer.start()
        
        # Set data flow status and start first timer
        print(f"Setting data flow status for patient {patient_id} to active")
        patient_data_flows[patient_id] = {
            'active': True,
            'timer': None
        }
        
        # Generate first data point immediately to ensure there's a starting point
        print(f"Generating first data point immediately")
        new_data = generate_new_glucose_reading(patient_id, True)
        if new_data:
            # Send data via WebSocket
            print(f"Sending initial data via WebSocket: {new_data}")
            socketio.emit('glucose_update', {
                'patient_id': patient_id,
                'data': [new_data]
            })
        else:
            print(f"Warning: Failed to generate initial data point for patient {patient_id}")
        
        # Start timer to continuously generate data points
        print(f"Starting timer to generate next data point in 5 seconds")
        timer = threading.Timer(5.0, generate_data_for_patient)  # Generate next point after 5 seconds
        timer.daemon = True
        patient_data_flows[patient_id]['timer'] = timer
        timer.start()
        
        print(f"Data flow for patient {patient_id} successfully started")
        return jsonify({
            "success": True,
            "message": f"Data flow started for patient {patient_id}"
        })
    
    except Exception as e:
        print(f"Error: Exception occurred while starting data flow: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

# New API endpoint: Stop data flow
@app.route('/stop_data_flow/<patient_id>', methods=['POST'])
def stop_data_flow(patient_id):
    try:
        result = stop_patient_data_flow(patient_id)
        if result:
            return jsonify({
                "success": True,
                "message": f"Data flow stopped for patient {patient_id}"
            })
        else:
            return jsonify({
                "warning": True,
                "message": f"No active data flow found for patient {patient_id}"
            })
    
    except Exception as e:
        print(f"Error stopping data flow: {str(e)}")
        return jsonify({"error": str(e)}), 500

# Helper function: Stop data flow for a patient
def stop_patient_data_flow(patient_id):
    if patient_id in patient_data_flows and patient_data_flows[patient_id]['active']:
        # Cancel timer
        if patient_data_flows[patient_id]['timer']:
            patient_data_flows[patient_id]['timer'].cancel()
        
        # Update status
        patient_data_flows[patient_id]['active'] = False
        patient_data_flows[patient_id]['timer'] = None
        return True
    return False

# Generate new glucose reading
def generate_new_glucose_reading(patient_id, force_new_base=False):
    # Get patient information
    patient = query_db("SELECT * FROM patient WHERE id = ?", [patient_id], one=True)
    if not patient:
        # Check if it's a predefined patient
        patient_found = False
        for patient_type, patients in patient_data.items():
            for p in patients:
                if p['id'] == patient_id:
                    patient_found = True
                    patient_info = p
                    has_diabetes = patient_info.get('has_diabetes', False)
                    break
            if patient_found:
                break
                
        if not patient_found:
            return None
    else:
        has_diabetes = bool(patient['has_diabetes'])
    
    # If force new base value, or no history found, generate new initial glucose value
    if force_new_base:
        # For all patients, generate initial glucose value around 100
        base_range = 15  # Allowed variation range
        latest_glucose = random.randint(100 - base_range, 100 + base_range)
        print(f"Generating new initial glucose value for patient {patient_id}: {latest_glucose} mg/dL")
    else:
        # Get latest glucose reading (only for getting recent glucose value as base, not timestamp)
        latest_reading = query_db(
            "SELECT * FROM glucose_reading WHERE patient_id = ? ORDER BY timestamp DESC LIMIT 1", 
            [patient_id], 
            one=True
        )
        
        # If no history found, generate reasonable initial glucose value
        if not latest_reading:
            if has_diabetes:
                # For diabetic patients, generate higher initial glucose
                latest_glucose = random.randint(120, 180)
            else:
                # For non-diabetic patients, generate normal range initial glucose
                latest_glucose = random.randint(70, 120)
            
            print(f"Generating initial glucose value for patient {patient_id}: {latest_glucose} mg/dL")
        else:
            latest_glucose = latest_reading['glucose']
    
    # Determine next glucose value based on patient condition
    if has_diabetes:
        # For diabetic patients, larger fluctuations
        change = random.uniform(-10, 10)
    else:
        # For non-diabetic patients, smaller fluctuations
        change = random.uniform(-3, 3)
    
    # Add some tendency to return to normal range
    if latest_glucose > 140:
        change -= random.uniform(0, 3)
    elif latest_glucose < 70:
        change += random.uniform(0, 3)
    
    new_glucose = max(40, min(300, latest_glucose + change))
    
    # Always use current timestamp to ensure data is real-time
    new_timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    # Create new glucose reading record
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO glucose_reading (patient_id, glucose, timestamp) VALUES (?, ?, ?)",
        (patient_id, round(new_glucose, 1), new_timestamp)
    )
    new_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    return {
        'id': new_id,
        'patient_id': patient_id,
        'glucose': round(new_glucose, 1),
        'timestamp': new_timestamp
    }

# Update glucose data
def update_glucose_data():
    # Get all patient IDs
    patients = query_db("SELECT id FROM patient")
    if not patients:
        return
    
    # Randomly select a patient
    patient = random.choice(patients)
    patient_id = patient['id']
    
    # Generate new glucose reading
    new_data = generate_new_glucose_reading(patient_id)
    
    if new_data:
        socketio.emit('glucose_update', {
            'patient_id': patient_id,
            'data': [new_data]
        })

if __name__ == '__main__':
    import threading
    import time
    
    # Initialize database - Set to True to delete existing database and recreate
    init_db(recreate=True)
    
    # Note: Removed automatic data generation background task, data is now generated through API requests
    # Only when a patient's data flow is started via /start_data_flow/<patient_id> will data be generated
    
    # Start Flask application
    port = int(os.environ.get('PORT', 9000))
    print(f"Starting Glucose Simulation Platform at http://localhost:{port}")
    socketio.run(app, debug=True, host='0.0.0.0', port=port) 