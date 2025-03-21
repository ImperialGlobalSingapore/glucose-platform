"""
Patient routes - API endpoints for patient data
"""
from flask import jsonify, request
from ..services.patient_service import PatientService

def register_patient_routes(app):
    """Register all patient-related route handlers with the Flask app"""
    
    @app.route('/patient_types')
    def get_patient_types():
        """Get all patient types"""
        return jsonify(PatientService.get_patient_types())
    
    @app.route('/patients_by_type/<patient_type>')
    def get_patients_by_type(patient_type):
        """Get all patients of a specific type"""
        return jsonify(PatientService.get_patients_by_type(patient_type))
    
    @app.route('/patients')
    def get_patients():
        """Get all patients"""
        return jsonify(PatientService.get_all_patients())
    
    @app.route('/patient/<patient_id>')
    def get_patient(patient_id):
        """Get a specific patient by ID"""
        patient = PatientService.get_patient(patient_id)
        if patient:
            return jsonify(patient)
        return jsonify({"error": "Patient not found"}), 404
    
    @app.route('/patient/add', methods=['POST'])
    def add_patient():
        """Add a new patient"""
        try:
            data = request.json
            
            # Validate required fields
            required_fields = ['id', 'type', 'age', 'weight', 'height', 'has_diabetes']
            for field in required_fields:
                if field not in data:
                    return jsonify({"success": False, "error": f"Missing required field: {field}"}), 400
            
            # Create new patient
            result = PatientService.create_patient(data)
            return jsonify(result)
        
        except Exception as e:
            print(f"Error adding patient: {str(e)}")
            return jsonify({"success": False, "error": str(e)}), 500 