"""
Glucose routes - API endpoints for glucose data
"""
from flask import jsonify, request
from ..services.glucose_service import GlucoseService

def register_glucose_routes(app):
    """Register all glucose-related route handlers with the Flask app"""
    
    @app.route('/glucose/<patient_id>')
    def get_glucose(patient_id):
        """Get glucose readings for a patient"""
        hours = request.args.get('hours', default=3, type=int)
        
        # For 24 hour requests, don't limit the number of points
        # This ensures all 288 points generated during initialization are returned
        if hours >= 24:
            limit = None
            print(f"24-hour request detected for {patient_id} - removing data point limit")
        else:
            limit = request.args.get('limit', default=100, type=int)
        
        # Get glucose readings
        readings = GlucoseService.get_glucose_readings(patient_id, hours, limit)
        return jsonify(readings)
    
    @app.route('/initialize_patient_data/<patient_id>', methods=['POST'])
    def initialize_patient_data(patient_id):
        """Initialize glucose data for a patient"""
        result = GlucoseService.initialize_patient_data(patient_id)
        
        # If result is a tuple (response, status_code)
        if isinstance(result, tuple):
            return jsonify(result[0]), result[1]
        
        return jsonify(result)
    
    @app.route('/mock_update', methods=['POST'])
    def mock_update():
        """Handle mock data updates"""
        try:
            data = request.json
            if not data or 'patient_id' not in data or 'data' not in data or not isinstance(data['data'], list):
                return jsonify({"error": "Invalid data format"}), 400
            
            patient_id = data['patient_id']
            data_points = data['data']
            
            # Add each data point
            for point in data_points:
                # Create a properly formatted reading data object
                reading_data = {
                    'patient_id': patient_id,
                    'glucose': point.get('glucose'),
                    'timestamp': point.get('timestamp')
                }
                
                # Format timestamp if necessary
                if 'timestamp' in reading_data and reading_data['timestamp']:
                    try:
                        # If ISO format, convert to database format
                        if 'T' in reading_data['timestamp']:
                            reading_data['timestamp'] = reading_data['timestamp'].replace('T', ' ')
                        if '.' in reading_data['timestamp']:
                            reading_data['timestamp'] = reading_data['timestamp'].split('.')[0]
                    except:
                        pass  # If conversion fails, use original timestamp
                
                # Add the reading
                GlucoseService.add_reading(reading_data)
            
            # Use socketio directly from the app object to broadcast updates
            socketio = app.extensions['socketio']
            
            # Broadcast data updates
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