from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()

class Patient(db.Model):
    """Patient Information Model"""
    id = db.Column(db.String(10), primary_key=True)
    age = db.Column(db.Integer)
    weight = db.Column(db.Float)
    height = db.Column(db.Float)
    has_diabetes = db.Column(db.Boolean, default=False)
    diabetes_type = db.Column(db.Integer, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.now)
    
    # 建立与GlucoseReading的关系
    glucose_readings = db.relationship('GlucoseReading', backref='patient', lazy=True, cascade="all, delete-orphan")
    
    def to_dict(self):
        """Convert patient data to dictionary"""
        return {
            'id': self.id,
            'age': self.age,
            'weight': self.weight,
            'height': self.height,
            'has_diabetes': self.has_diabetes,
            'diabetes_type': self.diabetes_type
        }


class GlucoseReading(db.Model):
    """Glucose Reading Model"""
    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(db.String(10), db.ForeignKey('patient.id'), nullable=False)
    glucose = db.Column(db.Float, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.now, index=True)
    
    def to_dict(self):
        """Convert glucose reading to dictionary"""
        return {
            'id': self.id,
            'patient_id': self.patient_id,
            'glucose': self.glucose,
            'timestamp': self.timestamp.strftime("%Y-%m-%d %H:%M:%S")
        } 