"""
Configuration settings for the application
"""
import os

# No dotenv, just directly use environment variables
class Config:
    """Base configuration class"""
    SECRET_KEY = os.getenv('SECRET_KEY', 'imperial_global_singapore_glucose_platform_key')
    DEBUG = False
    TESTING = False
    
    # Database settings
    DB_FILE = 'instance/glucose.db'
    
    # Patient data CSV file base path
    PATIENT_CSV_BASE = 'patient.csv'
    
    @staticmethod
    def get_patient_csv_path():
        """Get the absolute path to the patient CSV file"""
        # Root project directory (parent of backend)
        root_dir = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
        
        # Try different possible locations, starting from the most likely
        # We prioritize data/patient.csv since it has the correct format
        possible_paths = [
            os.path.join(root_dir, 'data', 'patient.csv'),  # This is the correct one based on inspection
            os.path.join(root_dir, 'patient.csv'),
        ]
        
        for path in possible_paths:
            if os.path.exists(path):
                print(f"Using patient CSV at: {path}")
                return path
        
        # Default to the data directory if none found
        default_path = os.path.join(root_dir, 'data', 'patient.csv')
        print(f"No patient CSV found, defaulting to: {default_path}")
        return default_path

class DevelopmentConfig(Config):
    """Development environment configuration"""
    DEBUG = True
    
class TestingConfig(Config):
    """Testing environment configuration"""
    DEBUG = True
    TESTING = True
    DB_FILE = 'instance/test_glucose.db'

class ProductionConfig(Config):
    """Production environment configuration"""
    # Production specific settings
    SECRET_KEY = os.getenv('SECRET_KEY')  # In production, this must be set in environment
    DEBUG = False

# Configuration dictionary
config_by_name = {
    'development': DevelopmentConfig,
    'testing': TestingConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}

# Get current configuration based on environment variable
def get_config():
    """Get configuration based on environment"""
    env = os.getenv('FLASK_ENV', 'development')
    return config_by_name.get(env, config_by_name['default']) 