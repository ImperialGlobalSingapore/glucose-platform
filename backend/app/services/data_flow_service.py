"""
Data Flow Service - Manages continuous data generation for patients
"""
import threading
from .glucose_service import GlucoseService

class DataFlowService:
    """Service to manage continuous data flow for patients"""
    
    # Dictionary to store data flow state for each patient
    # Format: {patient_id: {'active': bool, 'timer': Timer}}
    _patient_data_flows = {}
    
    @classmethod
    def start_data_flow(cls, patient_id, socketio):
        """Start data flow for a patient"""
        print(f"Received data flow start request for patient ID: {patient_id}")
        
        # Check if patient exists
        from .patient_service import PatientService
        patient_info = PatientService.get_patient(patient_id)
        
        if not patient_info:
            print(f"Error: Patient {patient_id} not found")
            return {"error": "Patient not found"}, 404
        
        # If already running, stop it first
        if patient_id in cls._patient_data_flows and cls._patient_data_flows[patient_id]['active']:
            print(f"发现患者 {patient_id} 已有活动的数据流，先停止它")
            cls.stop_data_flow(patient_id)
        
        # Define function to generate data periodically
        def generate_data_for_patient():
            if patient_id in cls._patient_data_flows and cls._patient_data_flows[patient_id]['active']:
                print(f"为患者 {patient_id} 生成新数据点")
                new_data = GlucoseService.generate_new_reading(patient_id, False)
                if new_data:
                    # Send data via WebSocket
                    print(f"通过WebSocket发送数据: {new_data}")
                    socketio.emit('glucose_update', {
                        'patient_id': patient_id,
                        'data': [new_data]
                    })
                else:
                    print(f"警告: 为患者 {patient_id} 生成数据点失败")
                
                # Schedule next run (if flow is still active)
                if patient_id in cls._patient_data_flows and cls._patient_data_flows[patient_id]['active']:
                    print(f"安排5秒后的下一次数据生成")
                    timer = threading.Timer(5.0, generate_data_for_patient)  # Generate a data point every 5 seconds
                    timer.daemon = True
                    cls._patient_data_flows[patient_id]['timer'] = timer
                    timer.start()
        
        # Set data flow state and start first timer
        print(f"设置患者 {patient_id} 的数据流状态为活动")
        cls._patient_data_flows[patient_id] = {
            'active': True,
            'timer': None
        }
        
        # Generate first data point immediately to ensure there's a starting point
        print(f"立即生成第一个数据点")
        new_data = GlucoseService.generate_new_reading(patient_id, True)
        if new_data:
            # Send data via WebSocket
            print(f"通过WebSocket发送初始数据: {new_data}")
            socketio.emit('glucose_update', {
                'patient_id': patient_id,
                'data': [new_data]
            })
        else:
            print(f"警告: 为患者 {patient_id} 生成初始数据点失败")
        
        # Start timer to continue generating data points
        print(f"启动定时器，5秒后生成下一个数据点")
        timer = threading.Timer(5.0, generate_data_for_patient)  # Generate next point after 5 seconds
        timer.daemon = True
        cls._patient_data_flows[patient_id]['timer'] = timer
        timer.start()
        
        print(f"患者 {patient_id} 的数据流成功启动")
        return {
            "success": True,
            "message": f"Data flow started for patient {patient_id}"
        }
    
    @classmethod
    def stop_data_flow(cls, patient_id):
        """Stop data flow for a patient"""
        if patient_id in cls._patient_data_flows and cls._patient_data_flows[patient_id]['active']:
            # Cancel timer
            if cls._patient_data_flows[patient_id]['timer']:
                cls._patient_data_flows[patient_id]['timer'].cancel()
            
            # Update state
            cls._patient_data_flows[patient_id]['active'] = False
            cls._patient_data_flows[patient_id]['timer'] = None
            return {
                "success": True,
                "message": f"Data flow stopped for patient {patient_id}"
            }
        return {
            "warning": True,
            "message": f"No active data flow found for patient {patient_id}"
        }
    
    @classmethod
    def is_data_flow_active(cls, patient_id):
        """Check if data flow is active for a patient"""
        return (patient_id in cls._patient_data_flows and 
                cls._patient_data_flows[patient_id]['active']) 