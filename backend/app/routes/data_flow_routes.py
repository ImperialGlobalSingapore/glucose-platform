"""
Data Flow routes - API endpoints for controlling data flow
"""
from flask import jsonify
from ..services.data_flow_service import DataFlowService

def register_data_flow_routes(app):
    """Register all data flow related route handlers with the Flask app"""
    
    @app.route('/start_data_flow/<patient_id>', methods=['POST'])
    def start_data_flow(patient_id):
        """Start data flow for a patient"""
        # Get the socketio instance from the app
        socketio = app.extensions['socketio']
        
        # Start the data flow
        result = DataFlowService.start_data_flow(patient_id, socketio)
        
        # If result is a tuple (response, status_code)
        if isinstance(result, tuple):
            return jsonify(result[0]), result[1]
        
        return jsonify(result)
    
    @app.route('/stop_data_flow/<patient_id>', methods=['POST'])
    def stop_data_flow(patient_id):
        """Stop data flow for a patient"""
        result = DataFlowService.stop_data_flow(patient_id)
        return jsonify(result) 