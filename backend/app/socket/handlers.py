"""
Socket handlers - WebSocket event handlers
"""
from ..services.glucose_service import GlucoseService
from ..util.db import get_db_connection

def register_socket_handlers(socketio):
    """Register all socket event handlers"""
    
    @socketio.on('connect')
    def handle_connect():
        """Handle client connection"""
        print('Client connected')

    @socketio.on('disconnect')
    def handle_disconnect():
        """Handle client disconnection"""
        print('Client disconnected')

    @socketio.on('subscribe')
    def handle_subscribe(patient_id):
        """Handle subscription to patient data"""
        print(f'Client subscribed to patient {patient_id}')
        
        # Send initial data
        latest_reading = GlucoseService.get_latest_reading(patient_id)
        
        if latest_reading:
            socketio.emit('glucose_update', {
                'patient_id': patient_id,
                'data': [latest_reading]
            }) 