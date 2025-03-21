"""
Glucose service - Business logic for glucose readings
"""
import random
import numpy as np
from datetime import datetime, timedelta
from ..models.glucose_reading import GlucoseReading
from ..models.patient import Patient
from ..util.db import get_db_connection

class GlucoseService:
    """Glucose service containing business logic for glucose readings"""
    
    @classmethod
    def get_glucose_readings(cls, patient_id, hours=3, limit=None):
        """Get glucose readings for a patient within specified time range"""
        conn = get_db_connection()
        readings = GlucoseReading.get_for_patient(conn, patient_id, hours, limit)
        conn.close()
        return readings
    
    @classmethod
    def get_latest_reading(cls, patient_id):
        """Get the latest glucose reading for a patient"""
        conn = get_db_connection()
        reading = GlucoseReading.get_latest_for_patient(conn, patient_id)
        conn.close()
        return reading
    
    @classmethod
    def add_reading(cls, reading_data):
        """Add a new glucose reading"""
        conn = get_db_connection()
        result = GlucoseReading.create(conn, reading_data)
        conn.close()
        return result
    
    @classmethod
    def initialize_patient_data(cls, patient_id):
        """Initialize glucose data for a patient"""
        # Determine if this is a predefined patient
        is_predefined_patient = '#' in patient_id
        
        # Check if patient exists
        conn = get_db_connection()
        patient_info = None
        
        # Get patient info from service
        from .patient_service import PatientService
        patient_info = PatientService.get_patient(patient_id)
        
        if not patient_info:
            conn.close()
            return {"error": "Patient not found"}, 404
        
        # Clear existing glucose data for this patient
        GlucoseReading.delete_for_patient(conn, patient_id)
        
        # Based on patient's diabetes status, determine base glucose value
        has_diabetes = patient_info.get('has_diabetes', random.choice([True, False]))
        if has_diabetes:
            base_glucose = random.randint(120, 180)
            variability = random.uniform(15, 25)  # Reduced variability for continuity
        else:
            base_glucose = random.randint(70, 120)
            variability = random.uniform(5, 15)   # Reduced variability for continuity
        
        # Generate data points for 24 hours with 5-minute intervals (288 points)
        now = datetime.now()
        
        # Make sure we generate a full 24 hours (exactly 24.0 hours)
        # First point will be 24 hours ago, and we'll generate forward to now
        start_time = now - timedelta(hours=24)
        interval_minutes = 5  # 5 minutes between readings
        total_points = 288  # 12 readings/hour * 24 hours
        
        # Log the time range we're generating
        print(f"*** INITIALIZING DATA FOR PATIENT {patient_id} ***")
        print(f"Generating {total_points} data points from {start_time} to {now}")
        print(f"Time span: {(now-start_time).total_seconds()/3600:.2f} hours")
        
        # Define meal times with smoother impact function
        meal_times = [
            {'hour': 7.5, 'intensity': random.uniform(20, 40)},  # Breakfast
            {'hour': 12.5, 'intensity': random.uniform(25, 45)}, # Lunch
            {'hour': 18.5, 'intensity': random.uniform(30, 50)}  # Dinner
        ]
        
        # Initialize first point's glucose value
        prev_glucose = base_glucose
        all_data_points = []
        
        # Generate glucose data chronologically from 24 hours ago to now
        for i in range(total_points):
            # Calculate the exact timestamp for this reading
            timestamp = start_time + timedelta(minutes=interval_minutes*i)
            hour_in_day = timestamp.hour + timestamp.minute / 60.0
            
            # Log timestamps for a few points to verify distribution
            if i < 5 or i > total_points - 5 or i % 60 == 0:
                print(f"Point {i+1}/{total_points}: Timestamp = {timestamp}")
            
            # Calculate total effect of all meals using Gaussian function
            meal_effect = 0
            for meal in meal_times:
                # Calculate hour difference between current time and meal time
                hour_diff = min(abs(hour_in_day - meal['hour']), 
                                abs(hour_in_day - meal['hour'] + 24),
                                abs(hour_in_day - meal['hour'] - 24))
                # Use Gaussian function for smooth transition
                # Effect occurs within 3 hours, peaks at meal time
                if hour_diff < 3:
                    # Gaussian function, maximum at meal time, gradually decreasing
                    gaussian_factor = np.exp(-((hour_diff) ** 2) / (2 * 0.5 ** 2))
                    meal_effect += meal['intensity'] * gaussian_factor
            
            # Add circadian rhythm variation - simulate natural fluctuations throughout the day
            day_phase = 2 * np.pi * hour_in_day / 24.0
            circadian_effect = 8 * np.sin(day_phase)  # Circadian effect, reduced amplitude for smoothness
            
            # Add continuity randomness - based on previous point's value, not completely random
            # Use mean regression model: current value tends to regress toward base value
            regression_factor = 0.85  # Controls regression to previous value, higher = more continuous
            
            # Calculate target glucose (base + meal + circadian)
            target_glucose = base_glucose + meal_effect + circadian_effect
            
            # Regression between target and previous value
            # Ensures each point relates to the previous one, creating continuity
            glucose = regression_factor * prev_glucose + (1 - regression_factor) * target_glucose
            
            # Add small random fluctuations
            noise = random.normalvariate(0, variability/6)  # Reduced noise for smoothness
            glucose += noise
            
            # For diabetic patients, occasionally add extreme values with continuity
            if has_diabetes and random.random() < 0.03:  # Reduced rate of extreme values
                # Smoother extreme value handling
                direction = 1 if glucose < base_glucose else -1  # Opposite to current direction
                extreme_factor = random.uniform(15, 30)  # Smaller extremes for realism
                glucose += direction * extreme_factor
            
            # Ensure glucose value is within reasonable range
            glucose = max(40, min(300, glucose))
            
            # Save for next point's base
            prev_glucose = glucose
            
            # Format timestamp as string
            timestamp_str = timestamp.strftime("%Y-%m-%d %H:%M:%S")
            
            # Add data point to list
            all_data_points.append({
                'patient_id': patient_id,
                'glucose': round(glucose, 1),
                'timestamp': timestamp_str
            })
        
        # Validate the time span before inserting
        if all_data_points:
            first_time = datetime.strptime(all_data_points[0]['timestamp'], "%Y-%m-%d %H:%M:%S")
            last_time = datetime.strptime(all_data_points[-1]['timestamp'], "%Y-%m-%d %H:%M:%S")
            time_diff = (last_time - first_time).total_seconds() / 3600  # hours
            print(f"Validation: Generated {len(all_data_points)} data points spanning {time_diff:.2f} hours")
            print(f"First point: {first_time}, Last point: {last_time}")
            
            # Group by hour to ensure complete coverage
            hour_groups = {}
            for point in all_data_points:
                time = datetime.strptime(point['timestamp'], "%Y-%m-%d %H:%M:%S")
                hour_key = time.strftime("%Y-%m-%d %H")
                hour_groups[hour_key] = hour_groups.get(hour_key, 0) + 1
            
            print(f"Data spans {len(hour_groups)} distinct hours")
            if len(hour_groups) < 24:
                print("WARNING: Data covers less than 24 distinct hours!")
        
        # Insert all data points (already in chronological order)
        for point in all_data_points:
            GlucoseReading.create(conn, point)
        
        print(f"Successfully inserted {len(all_data_points)} data points for patient {patient_id}")
        
        conn.close()
        
        return {
            "success": True, 
            "message": "Patient data initialized successfully",
            "data_points": len(all_data_points),
            "is_predefined": is_predefined_patient
        }
    
    @classmethod
    def generate_new_reading(cls, patient_id, force_new_base=False):
        """Generate a new glucose reading for a patient based on realistic patterns"""
        # Get patient info
        from .patient_service import PatientService
        patient_info = PatientService.get_patient(patient_id)
        
        if not patient_info:
            return None
        
        has_diabetes = patient_info.get('has_diabetes', False)
        
        conn = get_db_connection()
        
        # If force_new_base or no history, generate initial glucose value
        if force_new_base:
            # For all patients, generate around 100 as initial value
            base_range = 15  # Allowed variation range
            latest_glucose = random.randint(100 - base_range, 100 + base_range)
            print(f"Generating new initial glucose value for patient {patient_id}: {latest_glucose} mg/dL")
        else:
            # Get latest reading (just for latest value, not timestamp)
            latest_reading = GlucoseReading.get_latest_for_patient(conn, patient_id)
            
            # If no history found, generate reasonable initial value
            if not latest_reading:
                if has_diabetes:
                    # For diabetic patients, generate higher initial value
                    latest_glucose = random.randint(120, 180)
                else:
                    # For non-diabetic patients, generate normal range initial value
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
        
        # Add tendency to return to normal range
        if latest_glucose > 140:
            change -= random.uniform(0, 3)
        elif latest_glucose < 70:
            change += random.uniform(0, 3)
        
        new_glucose = max(40, min(300, latest_glucose + change))
        
        # Always use current timestamp to ensure data is real-time
        new_timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        # Create new reading
        new_reading = {
            'patient_id': patient_id,
            'glucose': round(new_glucose, 1),
            'timestamp': new_timestamp
        }
        
        result = GlucoseReading.create(conn, new_reading)
        conn.close()
        
        return result 