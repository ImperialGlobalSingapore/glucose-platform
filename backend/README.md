# Glucose Simulation Platform Backend

This is the backend for the Glucose Simulation Platform, providing APIs for patient data and glucose readings.

## Project Structure

```
backend/
├── app/                  # Main application package
│   ├── __init__.py       # Application factory
│   ├── models/           # Database models
│   │   ├── __init__.py
│   │   ├── glucose_reading.py
│   │   └── patient.py
│   ├── routes/           # API routes/views
│   │   ├── __init__.py
│   │   ├── data_flow_routes.py
│   │   ├── glucose_routes.py
│   │   └── patient_routes.py
│   ├── services/         # Business logic
│   │   ├── __init__.py
│   │   ├── data_flow_service.py
│   │   ├── glucose_service.py
│   │   └── patient_service.py
│   ├── socket/           # WebSocket handlers
│   │   ├── __init__.py
│   │   └── handlers.py
│   └── util/             # Utility functions
│       ├── __init__.py
│       └── db.py
├── config.py             # Configuration settings
└── run.py                # Application entry point
```

## Running the Application

1. Make sure all dependencies are installed:
   ```
   pip install -r requirements.txt
   ```

2. Run the application:
   ```
   python run.py
   ```
   
   Or use the provided shell script from the root directory:
   ```
   ./run_server.sh
   ```

3. The application will be available at http://localhost:9000

## Features

- Patient management (create, retrieve)
- Glucose reading data (create, retrieve)
- Real-time data streaming via WebSockets
- Initialization of sample data for patients
- Data flow control (start/stop)

## API Endpoints

### Patient Endpoints
- `GET /patient_types` - Get all patient types
- `GET /patients_by_type/<patient_type>` - Get patients by type
- `GET /patients` - Get all patients
- `GET /patient/<patient_id>` - Get a specific patient
- `POST /patient/add` - Add a new patient

### Glucose Endpoints
- `GET /glucose/<patient_id>` - Get glucose readings for a patient
- `POST /initialize_patient_data/<patient_id>` - Initialize glucose data for a patient
- `POST /mock_update` - Update with mock data

### Data Flow Endpoints
- `POST /start_data_flow/<patient_id>` - Start data flow for a patient
- `POST /stop_data_flow/<patient_id>` - Stop data flow for a patient

## WebSocket Events

- `connect` - Client connects
- `disconnect` - Client disconnects
- `subscribe` - Subscribe to a patient's data
- `glucose_update` - Emitted when new glucose data is available 