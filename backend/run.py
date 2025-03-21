"""
Application entry point
"""
import os
import sys

# Print current working directory for debugging
print("Current working directory:", os.getcwd())

# Add the current directory to the path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Debug: Show python path
print("Python path:", sys.path)

# Now import our modules
from backend.app import create_app, socketio
from backend.config import get_config

# Debug: Get patient csv path
config = get_config()
print("Patient CSV path:", config.get_patient_csv_path())

# Create the Flask application
app = create_app(get_config().__dict__)

if __name__ == '__main__':
    # Get port from environment or use default
    port = int(os.environ.get('PORT', 9000))
    
    print(f"Starting Glucose Simulation Platform at http://localhost:{port}")
    
    # Run the application with SocketIO
    socketio.run(app, debug=app.config['DEBUG'], host='0.0.0.0', port=port) 