# Routes modules
from .patient_routes import register_patient_routes
from .glucose_routes import register_glucose_routes
from .data_flow_routes import register_data_flow_routes

def register_routes(app):
    """Register all route handlers with the Flask app"""
    register_patient_routes(app)
    register_glucose_routes(app)
    register_data_flow_routes(app) 