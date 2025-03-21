"""
Patient service - Business logic for patient data
"""
import os
import pandas as pd
from ..models.patient import Patient
from ..util.db import get_db_connection
from ...config import get_config

class PatientService:
    """Patient service containing business logic for patients"""

    # Dictionary to store predefined patient data
    _patient_data = {}
    
    @classmethod
    def load_patient_csv(cls):
        """Load predefined patient data from CSV file"""
        try:
            # Get CSV file path
            config = get_config()
            csv_path = config.get_patient_csv_path()
            
            if not os.path.exists(csv_path):
                raise FileNotFoundError(f"Patient CSV file not found: {csv_path}")
            
            # Load CSV file
            print(f"Loading patient data from: {csv_path}")
            df = pd.read_csv(csv_path)
            
            # Validate CSV file format
            required_columns = ['Name', 'type', 'age', 'weight', 'height', 'has_diabetes']
            missing_columns = [col for col in required_columns if col not in df.columns]
            if missing_columns:
                raise ValueError(f"Patient CSV file missing required columns: {', '.join(missing_columns)}. Columns: {', '.join(df.columns)}")
            
            # Output debug information
            print(f"Patient CSV file contains columns: {', '.join(df.columns)}")
            
            # Initialize patient data dictionary
            cls._patient_data = {}
            
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
                    'diabetes_type': int(row['has_diabetes']) and (1 if index % 2 == 0 else 2)  # Randomly assign diabetes type
                }
                
                # Group by type
                if patient_type not in cls._patient_data:
                    cls._patient_data[patient_type] = []
                
                cls._patient_data[patient_type].append(patient_info)
            
            # Output loaded patient data types and counts
            for patient_type, patients in cls._patient_data.items():
                print(f"Loaded {len(patients)} {patient_type} type patients")
            
            print(f"Loaded {sum(len(patients) for patients in cls._patient_data.values())} patients from CSV {csv_path}")
            return True
        except Exception as e:
            print(f"Error loading patient CSV data: {str(e)}")
            print("Current working directory:", os.getcwd())
            # If file doesn't exist or reading fails, create an empty dictionary
            cls._patient_data = {}
            return False
    
    @classmethod
    def get_patient_types(cls):
        """Get all patient types"""
        return list(cls._patient_data.keys())
    
    @classmethod
    def get_patients_by_type(cls, patient_type):
        """Get all patients of a specific type"""
        if patient_type in cls._patient_data:
            return [{'id': p['id'], 'type': p['type']} for p in cls._patient_data[patient_type]]
        return []
    
    @classmethod
    def get_all_patients(cls):
        """Get all patients (both predefined and from database)"""
        # First get patients from database
        conn = get_db_connection()
        db_patients = Patient.get_all(conn)
        
        # Add predefined patient IDs
        predefined_patient_ids = []
        for patients in cls._patient_data.values():
            predefined_patient_ids.extend([p['id'] for p in patients])
        
        # Merge and deduplicate
        conn.close()
        return list(set(db_patients + predefined_patient_ids))
    
    @classmethod
    def get_patient(cls, patient_id):
        """Get a specific patient by ID"""
        # First check predefined patient data
        for patient_type, patients in cls._patient_data.items():
            for patient in patients:
                if patient['id'] == patient_id:
                    return {
                        'id': patient['id'],
                        'type': patient['type'],
                        'age': patient['age'],
                        'weight': float(patient['weight']),
                        'height': float(patient['height']),
                        'has_diabetes': bool(patient['has_diabetes']),
                        'diabetes_type': patient.get('diabetes_type')
                    }
        
        # If not found in predefined data, check database
        conn = get_db_connection()
        patient = Patient.get_by_id(conn, patient_id)
        conn.close()
        
        if patient:
            return patient
        
        return None
    
    @classmethod
    def create_patient(cls, patient_data):
        """Create a new patient"""
        # Validate patient ID format
        patient_id = patient_data['id']
        
        # Check if ID already exists in predefined patients
        for patient_type, patients in cls._patient_data.items():
            for patient in patients:
                if patient.get('id') == patient_id:
                    return {"success": False, "error": "Patient ID already exists in predefined data"}
        
        # Check if ID already exists in database
        conn = get_db_connection()
        if Patient.exists(conn, patient_id):
            conn.close()
            return {"success": False, "error": "Patient ID already exists in database"}
        
        # Insert new patient into database
        result = Patient.create(conn, patient_data)
        conn.close()
        
        if result:
            return {"success": True, "message": "Patient added successfully"}
        
        return {"success": False, "error": "Failed to add patient"} 