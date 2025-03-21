"""
Main application module - Flask app initialization
"""
from flask import Flask, render_template
from flask_socketio import SocketIO
import os

# Initialize SocketIO
socketio = SocketIO(cors_allowed_origins="*")

def create_app(config=None):
    """Create and configure the Flask application"""
    # Create Flask app
    app = Flask(__name__, static_folder='../../static', template_folder='../../templates')
    
    # Set app configuration
    app.config['SECRET_KEY'] = 'imperial_global_singapore_glucose_platform_key'
    app.config['DEBUG'] = True
    
    # Apply custom config if provided
    if config:
        app.config.update(config)
    
    # Initialize SocketIO with app
    socketio.init_app(app)
    
    # Initialize database
    from .util import init_db
    init_db(recreate=True)
    
    # Load patient data
    from .services.patient_service import PatientService
    PatientService.load_patient_csv()
    
    # Register socket handlers
    from .socket import register_socket_handlers
    register_socket_handlers(socketio)
    
    # Register routes
    from .routes import register_routes
    register_routes(app)
    
    # Define index route
    @app.route('/')
    def index():
        return render_template('index.html')
    
    return app 