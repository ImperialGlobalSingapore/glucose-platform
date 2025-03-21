import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class Config:
    """Base Configuration Class"""
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev_key_for_glucose_platform')
    DEBUG = False
    TESTING = False
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_DATABASE_URI = os.getenv('DATABASE_URL', 'sqlite:///glucose.db')

class DevelopmentConfig(Config):
    """Development Environment Configuration"""
    DEBUG = True

class TestingConfig(Config):
    """Test Environment Configuration"""
    DEBUG = True
    TESTING = True
    SQLALCHEMY_DATABASE_URI = 'sqlite:///test_glucose.db'

class ProductionConfig(Config):
    """Production Environment Configuration"""
    # Production environment specific configuration

# Configuration mapping dictionary
config_by_name = {
    'development': DevelopmentConfig,
    'testing': TestingConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}

# Default use development environment configuration
config = config_by_name[os.getenv('FLASK_ENV', 'development')] 