// Control Panel Functionality

document.addEventListener('DOMContentLoaded', function() {
    // Create control panel elements
    createControlPanel();
    
    // Get control panel elements
    const controlPanelTab = document.getElementById('control-panel-tab');
    const controlPanel = document.getElementById('control-panel');
    const closeBtn = document.getElementById('control-panel-close');
    
    // Control panel buttons
    const initializeBtn = document.getElementById('initialize-btn');
    const toggleFlowBtn = document.getElementById('toggle-flow-btn');
    const attackBtn = document.getElementById('attack-btn');
    
    // Status indicators
    const dataStatusDot = document.getElementById('data-status-dot');
    const flowStatusDot = document.getElementById('flow-status-dot');
    const attackStatusDot = document.getElementById('attack-status-dot');
    
    // Attack overlay
    const attackOverlay = document.getElementById('attack-overlay');
    const attackMessage = document.getElementById('attack-message');
    const attackStatus = document.getElementById('attack-status');
    
    // Patient selector
    const patientSelector = document.getElementById('control-patient-selector');
    
    // Status variables
    let isDataInitialized = false;
    let isFlowActive = false;
    let isAttackInProgress = false;
    let dataUpdateInterval = null;
    
    // Initialize patient selector
    initializePatientSelector();
    
    // Open/close control panel
    controlPanelTab.addEventListener('click', function() {
        controlPanel.classList.add('open');
    });
    
    closeBtn.addEventListener('click', function() {
        controlPanel.classList.remove('open');
    });
    
    // Initialize data button
    initializeBtn.addEventListener('click', function() {
        if (!isDataInitialized) {
            initializeData();
        }
    });
    
    // Start/pause data flow button
    toggleFlowBtn.addEventListener('click', function() {
        if (!isDataInitialized) {
            alert('Please initialize the data first');
            return;
        }
        
        toggleDataFlow();
    });
    
    // Attack button
    attackBtn.addEventListener('click', function() {
        if (!isDataInitialized) {
            alert('Please initialize the data first');
            return;
        }
        
        if (isAttackInProgress) {
            return;
        }
        
        launchAttack();
    });
    
    // Initialize patient selector
    function initializePatientSelector() {
        fetch('/patients')
            .then(response => response.json())
            .then(patients => {
                // Clear dropdown menu and repopulate
                patientSelector.innerHTML = '<option value="">Select Patient</option>';
                
                patients.forEach(patientId => {
                    const option = document.createElement('option');
                    option.value = patientId;
                    option.textContent = patientId;
                    patientSelector.appendChild(option);
                });
                
                // Trigger a change event
                patientSelector.dispatchEvent(new Event('change'));
            })
            .catch(error => console.error('Failed to load patient list:', error));
    }
    
    // Patient selection change handler
    patientSelector.addEventListener('change', function() {
        const patientId = this.value;
        
        // If there's an active data flow, switch to the newly selected patient
        if (isFlowActive && patientId) {
            // Unsubscribe from current patient
            if (window.currentPatientId) {
                console.log('Unsubscribing from patient:', window.currentPatientId);
                // Logic to unsubscribe can be added here
            }
            
            // Subscribe to new patient
            window.currentPatientId = patientId;
            subscribeToPatient(patientId);
        } else {
            // Just update the current patient ID
            window.currentPatientId = patientId;
        }
    });
    
    // Initialize data
    function initializeData() {
        // Disable initialize button, show loading state
        initializeBtn.disabled = true;
        initializeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Initializing...';
        dataStatusDot.className = 'status-dot pending';
        
        // Simulate API call to initialize data - add random failure chance to demonstrate error handling
        setTimeout(() => {
            // 10% chance of failure for demonstration purposes
            const isFailure = Math.random() < 0.1;
            
            if (isFailure) {
                // Handle initialization failure
                isDataInitialized = false;
                dataStatusDot.className = 'status-dot inactive';
                
                // Re-enable button
                initializeBtn.disabled = false;
                initializeBtn.innerHTML = '<i class="fas fa-database"></i> Initialize';
                
                // Show alert only for failure
                alert('Data initialization failed, please try again!');
            } else {
                // Handle initialization success
                isDataInitialized = true;
                dataStatusDot.className = 'status-dot active';
                
                // Re-enable button
                initializeBtn.disabled = false;
                initializeBtn.innerHTML = '<i class="fas fa-check"></i> Initialized';
            }
        }, 2000);
    }
    
    // Toggle data flow
    function toggleDataFlow() {
        if (isFlowActive) {
            stopDataFlow();
        } else {
            startDataFlow();
        }
    }
    
    // Start data flow
    function startDataFlow() {
        // Update UI
        toggleFlowBtn.innerHTML = '<i class="fas fa-pause"></i> Deactivate';
        flowStatusDot.className = 'status-dot active';
        isFlowActive = true;
        
        // Call the main.js function to start the data flow
        if (typeof window.startDataFlow === 'function') {
            window.startDataFlow();
        }
    }
    
    // Stop data flow
    function stopDataFlow() {
        // Update UI
        toggleFlowBtn.innerHTML = '<i class="fas fa-play"></i> Activate';
        flowStatusDot.className = 'status-dot inactive';
        isFlowActive = false;
        
        // Call the main.js function to stop the data flow
        if (typeof window.stopDataFlow === 'function') {
            window.stopDataFlow();
        }
    }
    
    // Add new data point
    function addNewDataPoint(patientId) {
        // This function can be called to manually add a new data point for testing
        if (typeof window.addNewDataPoint === 'function') {
            const timestamp = new Date().toISOString();
            const glucose = Math.random() * 100 + 70; // Random glucose between 70-170
            
            window.addNewDataPoint({
                patient_id: patientId,
                timestamp: timestamp,
                glucose: glucose
            });
        }
    }
    
    // Subscribe to patient data updates
    function subscribeToPatient(patientId) {
        if (socket) {
            console.log('Subscribing to patient:', patientId);
            socket.emit('subscribe', patientId);
        }
    }
    
    // Launch attack simulation
    function launchAttack() {
        // Update UI
        attackBtn.innerHTML = '<i class="fas fa-bug fa-spin"></i> Attack In Progress';
        attackBtn.classList.add('attack-active');
        attackStatusDot.className = 'status-dot attack';
        attackOverlay.style.display = 'flex';
        attackMessage.textContent = 'Attack simulation in progress...';
        attackStatus.textContent = 'Injecting abnormal glucose readings...';
        isAttackInProgress = true;
        
        // Call the main.js function to launch the attack
        if (typeof window.launchAttack === 'function') {
            window.launchAttack();
        }
        
        // Simulate the end of the attack after 30 seconds
        setTimeout(() => {
            // Update UI
            attackBtn.innerHTML = '<i class="fas fa-bug"></i> Launch Attack';
            attackBtn.classList.remove('attack-active');
            attackStatusDot.className = 'status-dot inactive';
            attackOverlay.style.display = 'none';
            isAttackInProgress = false;
        }, 30000);
    }
    
    // Set socket instance from main.js
    window.setSocket = function(socketInstance) {
        socket = socketInstance;
    };
    
    // Make functions available to main.js
    window.controlPanel = {
        initializeData: function() {
            if (!isDataInitialized) {
                initializeData();
            }
        },
        startDataFlow: startDataFlow,
        stopDataFlow: stopDataFlow,
        isDataInitialized: function() { return isDataInitialized; }
    };
});

// Create control panel HTML structure
function createControlPanel() {
    // Create the control panel tab
    const controlPanelTab = document.createElement('div');
    controlPanelTab.id = 'control-panel-tab';
    controlPanelTab.className = 'control-panel-tab';
    controlPanelTab.innerHTML = '<i class="fas fa-cogs"></i>';
    document.body.appendChild(controlPanelTab);
    
    // Create the control panel
    const controlPanel = document.createElement('div');
    controlPanel.id = 'control-panel';
    controlPanel.className = 'control-panel';
    
    // Panel header
    const panelHeader = document.createElement('div');
    panelHeader.className = 'panel-header';
    panelHeader.innerHTML = `
        <h3>Control Panel</h3>
        <button id="control-panel-close" class="close-btn"><i class="fas fa-times"></i></button>
    `;
    
    // Panel content
    const panelContent = document.createElement('div');
    panelContent.className = 'panel-content';
    
    // Patient selector
    const patientSelector = document.createElement('div');
    patientSelector.className = 'control-section';
    patientSelector.innerHTML = `
        <h4>Patient Selection</h4>
        <select id="control-patient-selector" class="control-select">
            <option value="">Select Patient</option>
        </select>
    `;
    
    // Data control
    const dataControl = document.createElement('div');
    dataControl.className = 'control-section';
    dataControl.innerHTML = `
        <h4>Data Control</h4>
        <div class="status-container">
            <span>Data Status:</span>
            <div id="data-status-dot" class="status-dot inactive"></div>
        </div>
        <button id="initialize-btn" class="control-btn"><i class="fas fa-database"></i> Initialize</button>
        
        <div class="status-container">
            <span>Flow Status:</span>
            <div id="flow-status-dot" class="status-dot inactive"></div>
        </div>
        <button id="toggle-flow-btn" class="control-btn"><i class="fas fa-play"></i> Activate</button>
    `;
    
    // Attack simulation
    const attackSimulation = document.createElement('div');
    attackSimulation.className = 'control-section';
    attackSimulation.innerHTML = `
        <h4>Attack Simulation</h4>
        <div class="status-container">
            <span>Attack Status:</span>
            <div id="attack-status-dot" class="status-dot inactive"></div>
        </div>
        <button id="attack-btn" class="control-btn"><i class="fas fa-bug"></i> Launch Attack</button>
    `;
    
    // Attack overlay
    const attackOverlay = document.createElement('div');
    attackOverlay.id = 'attack-overlay';
    attackOverlay.className = 'attack-overlay';
    attackOverlay.style.display = 'none';
    attackOverlay.innerHTML = `
        <div class="attack-message-container">
            <div class="attack-icon"><i class="fas fa-exclamation-triangle fa-pulse"></i></div>
            <h3 id="attack-message">Attack simulation in progress...</h3>
            <p id="attack-status">Injecting abnormal glucose readings...</p>
        </div>
    `;
    
    // Assemble the panel
    panelContent.appendChild(patientSelector);
    panelContent.appendChild(dataControl);
    panelContent.appendChild(attackSimulation);
    
    controlPanel.appendChild(panelHeader);
    controlPanel.appendChild(panelContent);
    
    // Add to the document
    document.body.appendChild(controlPanel);
    document.body.appendChild(attackOverlay);
    
    // Add styles
    addControlPanelStyles();
}

// Add CSS styles for the control panel
function addControlPanelStyles() {
    const styleElement = document.createElement('style');
    styleElement.innerHTML = `
        /* Control Panel Styles */
        .control-panel-tab {
            position: fixed;
            right: 0;
            top: 50%;
            transform: translateY(-50%);
            background-color: #007bff;
            color: white;
            padding: 10px;
            border-radius: 5px 0 0 5px;
            cursor: pointer;
            z-index: 1000;
            box-shadow: -2px 0 5px rgba(0,0,0,0.2);
        }
        
        .control-panel {
            position: fixed;
            right: -300px;
            top: 0;
            width: 300px;
            height: 100%;
            background-color: #f8f9fa;
            box-shadow: -2px 0 5px rgba(0,0,0,0.2);
            transition: right 0.3s ease;
            z-index: 1001;
            overflow-y: auto;
        }
        
        .control-panel.open {
            right: 0;
        }
        
        .panel-header {
            background-color: #007bff;
            color: white;
            padding: 10px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .panel-header h3 {
            margin: 0;
        }
        
        .close-btn {
            background: none;
            border: none;
            color: white;
            cursor: pointer;
            font-size: 16px;
        }
        
        .panel-content {
            padding: 15px;
        }
        
        .control-section {
            margin-bottom: 20px;
            border-bottom: 1px solid #ddd;
            padding-bottom: 15px;
        }
        
        .control-section h4 {
            margin-top: 0;
            color: #333;
        }
        
        .control-select {
            width: 100%;
            padding: 8px;
            margin-bottom: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
        }
        
        .control-btn {
            width: 100%;
            padding: 8px;
            margin: 5px 0;
            background-color: #007bff;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            transition: background-color 0.3s;
        }
        
        .control-btn:hover {
            background-color: #0069d9;
        }
        
        .control-btn:disabled {
            background-color: #6c757d;
            cursor: not-allowed;
        }
        
        .status-container {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 5px;
        }
        
        .status-dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            display: inline-block;
        }
        
        .status-dot.inactive {
            background-color: #dc3545;
        }
        
        .status-dot.pending {
            background-color: #ffc107;
            animation: blink 1s infinite;
        }
        
        .status-dot.active {
            background-color: #28a745;
        }
        
        .status-dot.attack {
            background-color: #dc3545;
            animation: blink 0.5s infinite;
        }
        
        @keyframes blink {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
        }
        
        #attack-btn.attack-active {
            background-color: #dc3545;
            animation: pulse 1s infinite;
        }
        
        @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.05); }
            100% { transform: scale(1); }
        }
        
        .attack-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(220, 53, 69, 0.2);
            z-index: 999;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        
        .attack-message-container {
            background-color: white;
            padding: 20px;
            border-radius: 5px;
            box-shadow: 0 0 10px rgba(0,0,0,0.3);
            text-align: center;
            max-width: 80%;
        }
        
        .attack-icon {
            font-size: 36px;
            color: #dc3545;
            margin-bottom: 10px;
        }
        
        #attack-message {
            color: #dc3545;
            margin: 10px 0;
        }
        
        #attack-status {
            margin: 5px 0;
            color: #6c757d;
        }
    `;
    document.head.appendChild(styleElement);
} 