import os
import click
import random
import numpy as np
from datetime import datetime, timedelta
from flask.cli import FlaskGroup
from app import create_app
from models import db, Patient, GlucoseReading

app = create_app(os.getenv('FLASK_ENV', 'development'))
cli = FlaskGroup(create_app=lambda: app)

@cli.command('init_db')
def init_db():
    """Initialize database - Create tables and reset data"""
    with app.app_context():
        db.drop_all()
        db.create_all()
        click.echo('Database initialized!')

@cli.command('seed_data')
def seed_data():
    """Generate test data"""
    with app.app_context():
        # Clear existing data
        GlucoseReading.query.delete()
        Patient.query.delete()
        db.session.commit()
        
        click.echo("Starting to create test data...")
        
        # Create test patients
        patient_ids = [f"P{i:03d}" for i in range(1, 11)]
        
        for patient_id in patient_ids:
            # Generate basic patient information
            age = random.randint(25, 75)
            weight = random.randint(50, 100)
            height = random.randint(150, 190)
            
            # Determine if patient has diabetes
            has_diabetes = random.choice([True, False])
            diabetes_type = random.choice([1, 2]) if has_diabetes else None
            
            # Create patient record
            patient = Patient(
                id=patient_id,
                age=age,
                weight=weight,
                height=height,
                has_diabetes=has_diabetes,
                diabetes_type=diabetes_type
            )
            db.session.add(patient)
            
            # Based on diabetes status baseline glucose value
            if has_diabetes:
                base_glucose = random.randint(120, 180)
                variability = random.uniform(30, 50)
            else:
                base_glucose = random.randint(70, 120)
                variability = random.uniform(10, 25)
            
            # Generate 24 hours of data, 5 minutes interval
            now = datetime.now()
            
            # Generate historical data
            for i in range(288):  # 12 readings/hour * 24 hours
                timestamp = now - timedelta(minutes=5*i)
                hour = timestamp.hour
                
                # Meal effect
                meal_effect = 0
                if hour in [7, 8]:  # Breakfast
                    meal_effect = random.uniform(20, 40)
                elif hour in [12, 13]:  # Lunch
                    meal_effect = random.uniform(25, 45)
                elif hour in [18, 19]:  # Dinner
                    meal_effect = random.uniform(30, 50)
                
                # Add randomness
                noise = random.normalvariate(0, variability/4)
                
                # Calculate glucose value with time-varying in a day
                time_factor = 1 + 0.1 * np.sin(2 * np.pi * i / 288)
                glucose = base_glucose * time_factor + meal_effect + noise
                
                # For diabetic patients, simulate occasional extreme values
                if has_diabetes and random.random() < 0.05:
                    glucose += random.choice([-40, 40])
                
                # Ensure glucose value is within reasonable range
                glucose = max(40, min(300, glucose))
                
                # Create glucose reading
                reading = GlucoseReading(
                    patient_id=patient_id,
                    glucose=round(glucose, 1),
                    timestamp=timestamp
                )
                db.session.add(reading)
        
        # Commit all changes
        db.session.commit()
        click.echo(f"Successfully created {len(patient_ids)} patients and {len(patient_ids) * 288} glucose readings")

@cli.command('run')
def run():
    """Run application (with real-time data update)"""
    import threading
    from app import update_glucose_data
    
    def background_task():
        while True:
            with app.app_context():
                update_glucose_data()
            time.sleep(5)  # Update every 5 seconds
    
    # Start background thread
    from time import sleep
    import time
    
    thread = threading.Thread(target=background_task)
    thread.daemon = True
    thread.start()
    
    # Run application
    from app import socketio
    socketio.run(app, debug=True, host='0.0.0.0', port=int(os.getenv('PORT', 5000)))

if __name__ == '__main__':
    cli() 