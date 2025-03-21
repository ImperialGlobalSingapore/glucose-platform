document.addEventListener('DOMContentLoaded', function() {
    // DOM elements
    const patientSelector = document.getElementById('patient-selector');
    const patientInfoPanel = document.getElementById('patient-info-panel');
    const dataInsightsPanel = document.getElementById('data-insights-panel');
    const glucoseChart = document.getElementById('glucose-chart');
    const timeButtons = document.querySelectorAll('.time-btn');
    const zoomResetButton = document.getElementById('zoom-reset');
    const fullscreenButton = document.getElementById('toggle-fullscreen');
    
    // Initialize Socket.IO connection
    const socket = io();
    
    // Add socket event logging for debugging
    socket.on('connect', function() {
        console.log('WebSocket connection established, ID:', socket.id);
    });
    
    socket.on('connect_error', function(error) {
        console.error('WebSocket connection error:', error);
    });
    
    socket.on('disconnect', function(reason) {
        console.warn('WebSocket connection disconnected, reason:', reason);
    });
    
    // Make socket available to control panel
    if (typeof window.setSocket === 'function') {
        window.setSocket(socket);
    }
    
    // Control elements
    const initializeBtn = document.getElementById('initialize-btn');
    const toggleFlowBtn = document.getElementById('toggle-flow-btn');
    const attackBtn = document.getElementById('attack-btn');
    const dataStatusDot = document.getElementById('data-status-dot');
    const flowStatusDot = document.getElementById('flow-status-dot');
    const attackStatusDot = document.getElementById('attack-status-dot');
    const attackOverlay = document.getElementById('attack-overlay');
    const attackMessage = document.getElementById('attack-message');
    const attackStatus = document.getElementById('attack-status');
    
    // Data and state
    let currentPatientId = null;
    let glucoseData = [];
    let timeRange = 3; // Default: 3 hours
    let isRealTimeMode = false; // Flag for real-time mode
    let plotlyChart = null;

    // Patient-specific states - key is patientId
    const patientStates = {};
    let dataUpdateInterval = null;
    
    // Initialize
    initApplication();
    
    function initApplication() {
        // We don't load patients list immediately anymore
        // Instead, we wait for user to select a patient type
        setupEventListeners();
        setupAddPatientUI();
    }
    
    function setupEventListeners() {
        // Patient type selection
        const patientTypeSelector = document.getElementById('patient-type-selector');
        patientTypeSelector.addEventListener('change', function() {
            const patientType = this.value;
            console.log("Patient type changed to:", patientType);
            
            if (patientType) {
                fetchPatientsByType(patientType);
            } else {
                // Clear patient selector if no type is selected
                const patientSelector = document.getElementById('patient-selector');
                patientSelector.innerHTML = '<option value="">Select a patient</option>';
                patientSelector.disabled = true;
                
                // Reset display
                resetDisplay();
            }
        });

        // Patient selection
        const patientSelector = document.getElementById('patient-selector');
        patientSelector.disabled = true; // Disable until type is selected
        patientSelector.addEventListener('change', function() {
            const patientId = this.value;
            console.log("Patient selection changed to:", patientId);
            
            if (patientId) {
                // Clear any active data update intervals when switching patients
                if (dataUpdateInterval) {
                    clearInterval(dataUpdateInterval);
                    dataUpdateInterval = null;
                }
                
                // If switching patients, exit real-time mode
                if (isRealTimeMode) {
                    isRealTimeMode = false;
                    // Deactivate real-time button
                    timeButtons.forEach(btn => {
                        if (btn.getAttribute('data-hours') === 'real-time') {
                            btn.classList.remove('active');
                        }
                        if (btn.getAttribute('data-hours') === '3') {
                            btn.classList.add('active');
                            timeRange = 3;
                        }
                    });
                }
                
                fetchPatientData(patientId);
                updateControlsBasedOnPatient(patientId);
            } else {
                resetDisplay();
            }
        });
        
        // Time range buttons
        timeButtons.forEach(button => {
            button.addEventListener('click', function() {
                const hoursValue = this.getAttribute('data-hours');
                console.log("Time button clicked:", hoursValue);
                
                // Only allow real-time mode if data flow is active for this patient
                if (hoursValue === 'real-time') {
                    if (!currentPatientId || !patientStates[currentPatientId] || 
                        !patientStates[currentPatientId].isFlowActive) {
                        console.log("Real-time mode requested but data flow is not active", {
                            patientId: currentPatientId,
                            patientState: patientStates[currentPatientId]
                        });
                        alert('Please start data flow first before using real-time mode.');
                        return;
                    }
                    
                    // Check if there are any new data points generated
                    if (patientStates[currentPatientId].realtimeData.length === 0) {
                        console.log("Real-time mode requested but no real-time data available");
                        alert('No real-time data available yet. Please wait for new data points.');
                        return;
                    }
                    
                    console.log("Switching to real-time mode", {
                        patientId: currentPatientId,
                        realtimeDataPoints: patientStates[currentPatientId].realtimeData.length
                    });
                }
                
                timeButtons.forEach(btn => btn.classList.remove('active'));
                this.classList.add('active');
                
                const wasRealTimeMode = isRealTimeMode;
                
                // Check if real-time mode is selected
                if (hoursValue === 'real-time') {
                    isRealTimeMode = true;
                    timeRange = 1; // Use 1 hour as initial display window for real-time mode
                    console.log("Switched to real-time mode, timeRange =", timeRange);
                } else {
                    isRealTimeMode = false;
                    timeRange = parseInt(hoursValue);
                    console.log("Switched to normal mode, timeRange =", timeRange, "hours");
                }
                
                if (currentPatientId) {
                    // If switching to or from real-time mode, need to update the chart configuration
                    if (wasRealTimeMode !== isRealTimeMode && plotlyChart) {
                        console.log("Mode changed (realtime vs normal), purging chart", {
                            wasRealTimeMode: wasRealTimeMode, 
                            isRealTimeMode: isRealTimeMode
                        });
                        // We'll refetch and redraw the chart with new settings
                        Plotly.purge(glucoseChart);
                        plotlyChart = null;
                    }
                    
                    console.log("Fetching glucose data after time range change", {
                        patientId: currentPatientId,
                        timeRange: timeRange,
                        isRealTimeMode: isRealTimeMode
                    });
                    fetchGlucoseData(currentPatientId);
                }
            });
        });
        
        // Chart controls
        zoomResetButton.addEventListener('click', resetZoom);
        fullscreenButton.addEventListener('click', toggleFullscreen);
        
        // Control buttons
        initializeBtn.addEventListener('click', function() {
            if (!currentPatientId) {
                alert('Please select a patient first');
                return;
            }
            
            if (!currentPatientId.includes('#')) {
                console.error("Invalid patient ID (missing # symbol):", currentPatientId);
                alert("Please select a specific patient from the dropdown (must include '#' symbol), not just a patient type.");
                return;
            }
            
            initializeData(currentPatientId);
        });
        
        toggleFlowBtn.addEventListener('click', function() {
            if (!currentPatientId) {
                alert('Please select a patient first');
                return;
            }
            
            if (!currentPatientId.includes('#')) {
                console.error("Invalid patient ID (missing # symbol):", currentPatientId);
                alert("Please select a specific patient from the dropdown (must include '#' symbol), not just a patient type.");
                return;
            }
            
            toggleDataFlow(currentPatientId);
        });
        
        attackBtn.addEventListener('click', function() {
            if (!currentPatientId) {
                alert('Please select a patient first');
                return;
            }
            
            if (!currentPatientId.includes('#')) {
                console.error("Invalid patient ID (missing # symbol):", currentPatientId);
                alert("Please select a specific patient from the dropdown (must include '#' symbol), not just a patient type.");
                return;
            }
            
            launchAttack(currentPatientId);
        });
    }
    
    // Fetch patients by type
    function fetchPatientsByType(patientType) {
        console.log("Fetching patients for type:", patientType);
        
        fetch(`/patients_by_type/${patientType}`)
            .then(response => {
                console.log("Response status:", response.status);
                if (!response.ok) {
                    throw new Error(`Server returned error: ${response.status}`);
                }
                return response.json();
            })
            .then(patients => {
                console.log("Received patients:", patients);
                
                // Get patient selector
                const patientSelector = document.getElementById('patient-selector');
                
                // Reset patient selector
                patientSelector.innerHTML = '<option value="">Select a patient</option>';
                
                // Filter out valid patient IDs (must contain # symbol)
                let validPatientsFound = false;
                
                // First add predefined patients
                patients.forEach(patient => {
                    // Handle both formats: object with id field or direct patient ID string
                    const patientId = patient.id || patient;
                    console.log("Processing patient:", patient, "extracted ID:", patientId);
                    
                    // Only show valid patient IDs (containing # symbol)
                    if (patientId.includes('#')) {
                        validPatientsFound = true;
                        const option = document.createElement('option');
                        option.value = patientId;
                        
                        // Determine if this is a predefined patient or a custom patient
                        // Predefined patients typically follow a pattern like "type#001", "type#002", etc.
                        const isPredefined = patientId.match(/^[a-zA-Z]+#\d{3}$/);
                        
                        // Add text tag to distinguish between predefined and custom patients
                        option.textContent = `${patientId} [${isPredefined ? 'Predefined' : 'Custom'}]`;
                        option.style.color = isPredefined ? '#3498db' : '#e67e22';
                        
                        patientSelector.appendChild(option);
                        console.log(`Added ${isPredefined ? 'predefined' : 'custom'} patient to selector:`, patientId);
                    } else {
                        console.warn("Skipping invalid patient ID (no # symbol):", patientId);
                    }
                });
                
                // Also look for custom patients from our local state that match this type
                for (const patientId in patientStates) {
                    if (patientId.startsWith(patientType + "#") && 
                        // Check if the patient isn't already in the list
                        ![...patientSelector.options].some(option => option.value === patientId)) {
                        
                        validPatientsFound = true;
                        const option = document.createElement('option');
                        option.value = patientId;
                        option.textContent = `${patientId} [Custom]`;
                        option.style.color = '#e67e22'; // Orange color for custom patients
                        patientSelector.appendChild(option);
                        console.log("Added custom patient to selector:", patientId);
                    }
                }
                
                // If no valid patients found for this type, show message
                if (!validPatientsFound) {
                    console.warn("No valid patients found for type:", patientType);
                    const option = document.createElement('option');
                    option.value = "";
                    option.textContent = "No valid patients for this type";
                    option.disabled = true;
                    patientSelector.appendChild(option);
                }
                
                // Enable patient selector
                patientSelector.disabled = false;
            })
            .catch(error => {
                console.error('Error loading patients by type:', error);
                // Show error message
                alert(`Failed to load patient data: ${error.message}`);
            });
    }
    
    // Get all patient types
    function fetchPatientTypes() {
        fetch('/patient_types')
            .then(response => response.json())
            .then(types => {
                // Populate type selector if needed
                // This is not necessary as we already defined types in HTML
            })
            .catch(error => console.error('Error loading patient types:', error));
    }
    
    // Keep existing function but it's not used on initial load anymore
    function fetchPatientList() {
        fetch('/patients')
            .then(response => response.json())
            .then(patients => {
                const patientSelector = document.getElementById('patient-selector');
                
                // Clear existing options and add default
                patientSelector.innerHTML = '<option value="">Select a patient</option>';
                
                // Add each patient to the dropdown
                patients.forEach(patientId => {
                    const option = document.createElement('option');
                    option.value = patientId;
                    option.textContent = patientId;
                    patientSelector.appendChild(option);
                });
            })
            .catch(error => console.error('Error loading patient list:', error));
    }
    
    // Fetch details for a specific patient
    function fetchPatientData(patientId) {
        if (!patientId) {
            console.log("No patient ID provided, resetting display");
            resetDisplay();
            return;
        }
        
        // Log patient ID for debugging
        console.log("Fetching patient data for ID:", patientId);
        
        // Validate patient ID format - must contain # symbol
        if (!patientId.includes('#')) {
            console.warn("Invalid patient ID (missing # symbol):", patientId);
            alert("Please select a valid patient ID. Valid IDs must contain the '#' symbol.");
            // Reset patient selector
            document.getElementById('patient-selector').value = '';
            resetDisplay();
            return;
        }
        
        // Initialize patient state if it doesn't exist
        if (!patientStates[patientId]) {
            console.log("Initializing state for patient:", patientId);
            patientStates[patientId] = {
                isDataInitialized: false,
                isFlowActive: false,
                isAttackActive: false,
                realtimeData: []
            };
        }
        
        // Properly encode the patient ID for URL safety
        const encodedPatientId = encodeURIComponent(patientId);
        
        // Log the full URL for debugging
        const url = `/patient/${encodedPatientId}`;
        console.log("Making API request to:", url);
        
        fetch(url)
            .then(response => {
                console.log("Response status:", response.status);
                if (!response.ok) {
                    throw new Error(`Server returned error: ${response.status}`);
                }
                return response.json();
            })
            .then(patient => {
                console.log("Received patient data:", patient);
                currentPatientId = patientId;
                
                // Always display patient basic information
                displayPatientInfo(patient);
                
                // Always show patient info panel
                patientInfoPanel.classList.remove('hidden');
                
                // Update control UI based on patient state
                updateControlsBasedOnPatient(patientId);
                
                // Check if data is initialized
                if (patientStates[patientId].isDataInitialized) {
                    console.log("Patient data already initialized, fetching glucose data");
                    // If data is initialized, fetch glucose data and show chart and insights
                    fetchGlucoseData(patientId);
                    dataInsightsPanel.classList.remove('hidden');
                } else {
                    console.log("Patient data not initialized, showing initialization prompt");
                    // If data not initialized, clear chart and show initialization prompt
                    if (plotlyChart) {
                        Plotly.purge(glucoseChart);
                        plotlyChart = null;
                    }
                    
                    glucoseChart.innerHTML = '<div class="no-data-message">Please click the "Initialize" button to generate data for this patient.</div>';
                    
                    // Apply styling to the message
                    const style = document.createElement('style');
                    style.textContent = `
                        .no-data-message {
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            height: 100%;
                            color: #777;
                            font-size: 1.2em;
                            text-align: center;
                            flex-direction: column;
                            padding: 20px;
                        }
                    `;
                    document.head.appendChild(style);
                    
                    // Hide insights panel until data is initialized
                    dataInsightsPanel.classList.add('hidden');
                }
            })
            .catch(error => {
                console.error('Error fetching patient data:', error);
                console.error('URL that caused the error:', url);
                alert(`Failed to load patient data: ${error.message}`);
                resetDisplay();
            });
    }
    
    function fetchGlucoseData(patientId) {
        // Don't fetch data if patient is not initialized
        if (!patientStates[patientId] || !patientStates[patientId].isDataInitialized) {
            console.log("Not fetching glucose data - patient not initialized:", patientId);
            return;
        }
        
        console.log("Fetching glucose data for patient:", patientId, "with timeRange:", timeRange, "hours", "isRealTimeMode:", isRealTimeMode);
        
        // Always fetch 24 hours of data to ensure we have historical data available
        const hours = 24;
        
        // Properly encode the patient ID for URL safety
        const encodedPatientId = encodeURIComponent(patientId);
        
        // Log the full URL for debugging
        const url = `/glucose/${encodedPatientId}?hours=${hours}`;
        console.log("Making API request to:", url);
        console.log(`Chart will display ${timeRange} hours but we're loading the full dataset for historical context`);
        
        // Fetch the data
        fetch(url)
            .then(response => {
                console.log("Response status:", response.status);
                if (!response.ok) {
                    throw new Error(`Server returned error: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                console.log(`Received ${data.length} glucose readings for display`);
                
                // Log information about the data
                if (data.length > 0) {
                    console.log("First data point:", data[0]);
                    console.log("Last data point:", data[data.length - 1]);
                    
                    if (data.length > 1) {
                        // Calculate and log the time span of the data
                        const firstTime = new Date(data[0].timestamp);
                        const lastTime = new Date(data[data.length - 1].timestamp);
                        const timeDiffHours = (lastTime - firstTime) / (1000 * 60 * 60);
                        console.log(`Data spans ${timeDiffHours.toFixed(2)} hours from ${firstTime.toLocaleString()} to ${lastTime.toLocaleString()}`);
                    }
                }
                
                // Store the current glucose data
                glucoseData = data;
                
                // Always cache the full dataset as historical data
                patientStates[patientId].historicalData = [...data];
                console.log(`Cached ${data.length} data points as historical data`);
                
                // If in real-time mode, we need to handle differently
                if (isRealTimeMode) {
                    let displayData;
                    
                    // Check if we have real-time data
                    const hasRealTimeData = patientStates[patientId].realtimeData && 
                                          patientStates[patientId].realtimeData.length > 0;
                    
                    if (hasRealTimeData) {
                        // For real-time mode with data, only show real-time data with historical as gray background
                        displayData = [...patientStates[patientId].realtimeData];
                        console.log(`Using ${displayData.length} real-time data points with historical data as gray background`);
                    } else {
                        // If no real-time data yet, just use the historical data
                        displayData = [...data];
                        console.log(`No real-time data yet, using ${displayData.length} historical data points`);
                    }
                    
                    // Update the UI
                    updateChart(displayData);
                    updateStats(displayData);
                    updateInsights(displayData);
                } else {
                    // For regular time windows, use the fetched data with historical as gray background
                    updateChart(data);
                    updateStats(data);
                    updateInsights(data);
                }
            })
            .catch(error => {
                console.error('Error loading glucose data:', error);
                console.error('URL that caused the error:', url);
                alert('Failed to load glucose data. Please try again.');
            });
    }
    
    // Display patient information in the UI
    function displayPatientInfo(patient) {
        // Check if patient object has all required fields
        if (!patient || !patient.id) {
            console.error('Incomplete patient data:', patient);
            return;
        }
        
        // Update patient info in the sidebar
        document.getElementById('patient-id').textContent = patient.id || 'N/A';
        document.getElementById('patient-age').textContent = patient.age || 'N/A';
        document.getElementById('patient-weight').textContent = patient.weight ? `${patient.weight} kg` : 'N/A';
        document.getElementById('patient-height').textContent = patient.height ? `${patient.height} cm` : 'N/A';
        document.getElementById('patient-diabetes').textContent = patient.has_diabetes ? 'Yes' : 'No';
        
        // Check if the diabetes type elements exist before trying to manipulate them
        const diabetesTypeRow = document.getElementById('diabetes-type-row');
        const diabetesTypeEl = document.getElementById('patient-diabetes-type');
        
        if (diabetesTypeRow && diabetesTypeEl && patient.has_diabetes && patient.diabetes_type) {
            diabetesTypeEl.textContent = `Type ${patient.diabetes_type}`;
            diabetesTypeRow.classList.remove('hidden');
        } else if (diabetesTypeRow) {
            diabetesTypeRow.classList.add('hidden');
        }
    }
    
    function updateChart(data) {
        // Ensure data is an array
        if (!data) data = [];
        
        // Only return early if no data AND NOT in real-time mode
        // In real-time mode with empty data, we still want to show historical data
        if (data.length === 0 && !isRealTimeMode) {
            console.log("Skipping chart update due to empty data in non-realtime mode");
            return;
        }
        
        // Check if glucoseChart element exists
        if (!glucoseChart) {
            console.error('Cannot update chart: glucose chart element not found');
            return;
        }
        
        // Extract timestamps and glucose values if data exists
        const timestamps = data && data.length > 0 ? data.map(d => d.timestamp) : [];
        const glucoseValues = data && data.length > 0 ? data.map(d => d.glucose) : [];
        
        // Initialize traces array
        let traces = [];
        
        // Always add historical data as gray dotted line regardless of mode
        if (currentPatientId && patientStates[currentPatientId] && 
            patientStates[currentPatientId].historicalData && 
            patientStates[currentPatientId].historicalData.length > 0) {
            
            console.log("Adding historical data as gray dotted line, count:", 
                     patientStates[currentPatientId].historicalData.length);
            
            const historicalData = [...patientStates[currentPatientId].historicalData];
            
            // Add historical data as gray dotted line
            traces.push({
                x: historicalData.map(d => d.timestamp),
                y: historicalData.map(d => d.glucose),
                type: 'scatter',
                mode: 'lines',
                name: 'Historical',
                line: {
                    color: '#777777',  // Darker gray color
                    width: 2,          
                    shape: 'spline',
                    dash: 'dot'  // Dotted line for historical data
                },
                opacity: 0.8,
                hoverinfo: 'skip',  // Disable hover for historical data to reduce clutter
                connectgaps: true
            });
        }
        
        // Now handle the main data trace based on mode
        if (isRealTimeMode && currentPatientId && patientStates[currentPatientId]) {
            // Add real-time data as a separate trace with color-coded segments
            if (patientStates[currentPatientId].realtimeData && 
                patientStates[currentPatientId].realtimeData.length > 0) {
                
                console.log("Adding real-time data as separate trace with color-coded segments, count:", 
                         patientStates[currentPatientId].realtimeData.length);
                
                const rtData = patientStates[currentPatientId].realtimeData;
                const rtTimestamps = rtData.map(d => d.timestamp);
                const rtGlucoseValues = rtData.map(d => d.glucose);
                
                // Add real-time data with color-coded line segments
                traces.push({
                    x: rtTimestamps,
                    y: rtGlucoseValues,
                    type: 'scatter',
                    mode: 'lines+markers',
                    name: 'Real-time',
                    line: {
                        width: 2,
                        shape: 'spline',
                        color: rtGlucoseValues.map(value => {
                            // Color line segments based on glucose ranges
                            if (value > 180) return '#E74C3C';  // High (red)
                            if (value >= 70) return '#2ECC71';  // Normal (green)
                            return '#F39C12';  // Low (orange/yellow)
                        })
                    },
                    marker: {
                        size: 6,
                        color: rtGlucoseValues.map(value => {
                            // Color markers based on glucose ranges
                            if (value > 180) return '#E74C3C';  // High
                            if (value >= 70) return '#2ECC71';  // Normal
                            return '#F39C12';  // Low
                        })
                    },
                    text: rtGlucoseValues.map(value => {
                        // Add text labels based on glucose ranges for hover tooltips
                        if (value > 180) return 'High';
                        if (value >= 70) return 'Normal';
                        return 'Low';
                    }),
                    hovertemplate: '<b style="color:%{marker.color}">%{text}</b><br>%{y} mg/dL<br>%{x}<extra></extra>',
                    connectgaps: true
                });
            }
        } else if (data.length > 0) {
            // For non-real-time mode, add the current data with color-coded segments
            traces.push({
                x: timestamps,
                y: glucoseValues,
                type: 'scatter',
                mode: 'lines+markers',
                name: 'Glucose',
                line: {
                    shape: 'spline',
                    width: 2,
                    color: glucoseValues.map(value => {
                        // Color line segments based on glucose ranges
                        if (value > 180) return '#E74C3C';  // High (red)
                        if (value >= 70) return '#2ECC71';  // Normal (green)
                        return '#F39C12';  // Low (orange/yellow)
                    })
                },
                marker: {
                    size: 5,
                    color: glucoseValues.map(value => {
                        // Color markers based on glucose ranges
                        if (value > 180) return '#E74C3C';  // High
                        if (value >= 70) return '#2ECC71';  // Normal
                        return '#F39C12';  // Low
                    })
                },
                text: glucoseValues.map(value => {
                    // Add text labels based on glucose ranges for hover tooltips
                    if (value > 180) return 'High';
                    if (value >= 70) return 'Normal';
                    return 'Low';
                }),
                hovertemplate: '<b style="color:%{marker.color}">%{text}</b><br>%{y} mg/dL<br>%{x}<extra></extra>',
                connectgaps: true
            });
        }
        
        // X-axis settings
        let xaxisSettings = {
            title: 'Time',
            type: 'date',
            tickformat: '%H:%M:%S\n%b %d',  // Include seconds in the time format
            showgrid: true,
            gridcolor: '#E1E5EB',
            fixedrange: false // Allow x-axis zooming
        };
        
        // Y-axis settings - always fixed range in real-time mode
        let yaxisSettings = {
            title: 'Glucose (mg/dL)',
            range: [40, 300],
            showgrid: true,
            gridcolor: '#E1E5EB',
            fixedrange: true // Always lock Y-axis range for all modes (changed from isRealTimeMode)
        };
        
        // For real-time mode, set fixed time window
        if (isRealTimeMode && data.length > 0) {
            // Get the current time instead of using the timestamps in the data
            const currentTime = new Date();
            
            // Add a small buffer to the end time (10 seconds)
            const endTime = new Date(currentTime.getTime() + 10000);
            
            // Set the start time to be 5 minutes before the current time
            // This makes the x-axis always show the last 5 minutes from the current time
            const realTimeWindowMinutes = 5; // Default 5 minute window for real-time view
            const startTime = new Date(endTime.getTime() - (realTimeWindowMinutes * 60 * 1000));
            
            // Set the x-axis range to show this time window
            xaxisSettings.range = [startTime, endTime];
            
            // For very few points, make sure we still maintain a minimum window
            if (endTime - startTime < 30000) {
                xaxisSettings.range = [
                    new Date(endTime.getTime() - 30000),
                    endTime
                ];
            }
        } else if (data.length > 0) {
            // For non-real-time mode with data, use the full data span if available
            // But set the visible window according to the selected timeRange
            
            // Determine the full data time span
            const timestamps = data.map(d => new Date(d.timestamp));
            const minDataTime = new Date(Math.min(...timestamps.map(t => t.getTime())));
            const maxDataTime = new Date(Math.max(...timestamps.map(t => t.getTime())));
            
            // Get the current time for reference
            const currentTime = new Date();
            
            // Calculate the time window for the selected time range
            // Use real end time (either current time or latest data point)
            // Current time may be newer than latest data point (for non-real-time mode)
            const endTime = new Date(Math.max(maxDataTime, currentTime));
            
            // Calculate start time based on timeRange
            const hourInMillis = 60 * 60 * 1000;
            const requestedStartTime = new Date(endTime - timeRange * hourInMillis);
            
            // Log information about our time range
            console.log(`Time range requested: ${timeRange} hours`);
            console.log(`Full data span: ${(maxDataTime - minDataTime) / hourInMillis} hours`);
            console.log(`  from ${minDataTime.toLocaleString()} to ${maxDataTime.toLocaleString()}`);
            console.log(`Setting visible window: ${requestedStartTime.toLocaleString()} to ${endTime.toLocaleString()}`);
            
            // Set x-axis range based on the requested time range
            // The chart will only display data within this window, but all data points are still plotted
            xaxisSettings.range = [requestedStartTime, endTime];
            
            // Add autorange false to ensure the chart respects our range settings
            xaxisSettings.autorange = false;
        }
        
        // Chart layout
        const layout = {
            title: 'Blood Glucose Readings',
            xaxis: xaxisSettings,
            yaxis: yaxisSettings,
            shapes: [
                {
                    type: 'rect',
                    xref: 'paper',
                    yref: 'y',
                    x0: 0,
                    y0: 180,
                    x1: 1,
                    y1: 300,
                    fillcolor: '#FADBD8',
                    opacity: 0.2,
                    line: {
                        width: 0
                    }
                },
                {
                    type: 'rect',
                    xref: 'paper',
                    yref: 'y',
                    x0: 0,
                    y0: 70,
                    x1: 1,
                    y1: 180,
                    fillcolor: '#D5F5E3',
                    opacity: 0.2,
                    line: {
                        width: 0
                    }
                },
                {
                    type: 'rect',
                    xref: 'paper',
                    yref: 'y',
                    x0: 0,
                    y0: 40,
                    x1: 1,
                    y1: 70,
                    fillcolor: '#FCF3CF',
                    opacity: 0.2,
                    line: {
                        width: 0
                    }
                }
            ],
            showlegend: false,
            margin: {
                l: 50,
                r: 20,
                b: 60,
                t: 40,
                pad: 0
            },
            hovermode: 'closest',
            hoverlabel: {
                bgcolor: '#004494',
                font: {
                    color: 'white'
                }
            },
            dragmode: 'pan' // Always set drag mode to pan for all modes (changed from conditionally applying to real-time mode)
        };
        
        // Chart configuration - ensure only horizontal scrolling for all modes
        const config = {
            responsive: true,
            displayModeBar: false,
            scrollZoom: 'x' // Always only horizontal scrolling for all modes (changed from conditionally applying to real-time mode)
        };
        
        // Create or update chart
        if (!plotlyChart) {
            Plotly.newPlot(glucoseChart, traces, layout, config);
            plotlyChart = glucoseChart;
            
            // Add event listener to lock Y-axis for all modes
            plotlyChart.on('plotly_relayout', function(eventData) {
                // If Y-axis range was changed, reset it to fixed range
                if (eventData['yaxis.range[0]'] !== undefined || 
                    eventData['yaxis.range[1]'] !== undefined ||
                    eventData['yaxis.autorange'] !== undefined) {
                    Plotly.relayout(plotlyChart, {
                        'yaxis.range': [40, 300],
                        'yaxis.autorange': false
                    });
                }
            });
        } else {
            Plotly.react(glucoseChart, traces, layout, config);
        }
        
        // 如果在实时模式下，自动滚动图表以显示最新数据
        if (isRealTimeMode && plotlyChart && data.length > 0) {
            // 为实时模式创建一个围绕当前时间的窗口
            // 默认显示最后5分钟
            const currentTime = new Date();
            
            // 时间窗口计算的改进 - 使数据点位置更加平衡
            // 如果最新的数据点是在不到10秒前生成的，我们将其视为"当前"
            const newestPointTime = new Date(data[data.length - 1].timestamp.replace(' ', 'T') + 'Z');
            const timeSinceNewest = currentTime - newestPointTime;
            
            // 计算缓冲区 - 如果最新点是刚刚生成的，右侧缓冲区小些，否则缓冲区大些
            // 这使得新点不会总是出现在最右边
            let rightBufferMs = 2000; // 默认右侧留出2秒缓冲区
            if (timeSinceNewest < 5000) {
                // 如果数据点很新，右侧缓冲区更小，让点显示在更靠中间位置
                rightBufferMs = 30000; // 30秒，大约是5分钟窗口的1/10
            }
            
            // 设置结束时间为当前时间 + 动态缓冲区
            const endTime = new Date(currentTime.getTime() + rightBufferMs);
            
            // 设置开始时间为结束时间 - 5分钟
            const realTimeWindowMinutes = 5; // 保持5分钟窗口不变
            const startTime = new Date(endTime.getTime() - (realTimeWindowMinutes * 60 * 1000));
            
            // 确保我们保持最小窗口大小（30秒）
            if (endTime - startTime < 30000) {
                startTime = new Date(endTime.getTime() - 30000);
            }
            
            console.log("更新图表时间窗口:", {
                startTime: startTime.toLocaleTimeString(),
                endTime: endTime.toLocaleTimeString(),
                duration: (endTime - startTime) / 60000 + "分钟",
                rightBuffer: rightBufferMs / 1000 + "秒"
            });
            
            // 只有当时间窗口发生明显变化时才更新图表
            // 避免频繁更新导致的闪烁
            const currentRange = plotlyChart.layout.xaxis.range;
            const rangeChanged = !currentRange || 
                                Math.abs(new Date(currentRange[0]) - startTime) > 10000 ||
                                Math.abs(new Date(currentRange[1]) - endTime) > 10000;
            
            if (rangeChanged) {
                // 更新图表的x轴
                Plotly.relayout(plotlyChart, {
                    'xaxis.range': [startTime, endTime],
                    'yaxis.range': [40, 300]  // 确保Y轴保持固定
                });
            }
        }
    }
    
    function updateStats(data) {
        if (data.length === 0) return;
        
        // Current glucose
        const currentGlucose = data[data.length - 1].glucose;
        const currentGlucoseEl = document.getElementById('current-glucose');
        if (currentGlucoseEl) {
            currentGlucoseEl.textContent = currentGlucose;
        } else {
            console.warn('Element #current-glucose not found');
        }
        
        // Average glucose
        const avgGlucose = (data.reduce((sum, d) => sum + d.glucose, 0) / data.length).toFixed(1);
        const avgGlucoseEl = document.getElementById('avg-glucose');
        if (avgGlucoseEl) {
            avgGlucoseEl.textContent = avgGlucose;
        } else {
            console.warn('Element #avg-glucose not found');
        }
        
        // Range
        const minGlucose = Math.min(...data.map(d => d.glucose));
        const maxGlucose = Math.max(...data.map(d => d.glucose));
        const rangeGlucoseEl = document.getElementById('range-glucose');
        if (rangeGlucoseEl) {
            rangeGlucoseEl.textContent = `${minGlucose} - ${maxGlucose}`;
        } else {
            console.warn('Element #range-glucose not found');
        }
    }
    
    function updateInsights(data) {
        if (data.length === 0) return;
        
        // Time in range
        const inRangeCount = data.filter(d => d.glucose >= 70 && d.glucose <= 180).length;
        const timeInRangePercent = Math.round((inRangeCount / data.length) * 100);
        
        const timeInRangeBarEl = document.getElementById('time-in-range-bar');
        const timeInRangeValueEl = document.getElementById('time-in-range-value');
        
        if (timeInRangeBarEl) {
            timeInRangeBarEl.style.width = `${timeInRangePercent}%`;
        } else {
            console.warn('Element #time-in-range-bar not found');
        }
        
        if (timeInRangeValueEl) {
            timeInRangeValueEl.textContent = `${timeInRangePercent}%`;
        } else {
            console.warn('Element #time-in-range-value not found');
        }
        
        // Hypo events
        const hypoEvents = countEvents(data, d => d.glucose < 70);
        const hypoEventsValueEl = document.getElementById('hypo-events-value');
        if (hypoEventsValueEl) {
            hypoEventsValueEl.textContent = hypoEvents;
        } else {
            console.warn('Element #hypo-events-value not found');
        }
        
        // Hyper events
        const hyperEvents = countEvents(data, d => d.glucose > 180);
        const hyperEventsValueEl = document.getElementById('hyper-events-value');
        if (hyperEventsValueEl) {
            hyperEventsValueEl.textContent = hyperEvents;
        } else {
            console.warn('Element #hyper-events-value not found');
        }
        
        // Glucose variability (standard deviation)
        const mean = data.reduce((sum, d) => sum + d.glucose, 0) / data.length;
        const variance = data.reduce((sum, d) => sum + Math.pow(d.glucose - mean, 2), 0) / data.length;
        const stdDev = Math.sqrt(variance).toFixed(1);
        
        const variabilityValueEl = document.getElementById('variability-value');
        if (variabilityValueEl) {
            variabilityValueEl.textContent = stdDev;
        } else {
            console.warn('Element #variability-value not found');
        }
    }
    
    function countEvents(data, conditionFn) {
        // Count sequences of events that meet the condition
        let eventCount = 0;
        let inEvent = false;
        
        for (let i = 0; i < data.length; i++) {
            const meetsCondition = conditionFn(data[i]);
            
            if (meetsCondition && !inEvent) {
                eventCount++;
                inEvent = true;
            } else if (!meetsCondition) {
                inEvent = false;
            }
        }
        
        return eventCount;
    }
    
    function resetDisplay() {
        currentPatientId = null;
        glucoseData = [];
        isRealTimeMode = false;
        
        // Hide panels
        patientInfoPanel.classList.add('hidden');
        dataInsightsPanel.classList.add('hidden');
        
        // Clear chart
        if (plotlyChart) {
            Plotly.purge(glucoseChart);
            plotlyChart = null;
        }
        
        // Reset UI controls to default state
        updateControlUI(false, false, false);
    }
    
    function resetZoom() {
        if (plotlyChart) {
            if (isRealTimeMode) {
                // For real-time mode, use current time as reference point
                const currentTime = new Date();
                
                // Add a small buffer to the end time
                const endTime = new Date(currentTime.getTime() + 10000); // Add 10 seconds buffer
                
                // Set the start time to 5 minutes before the current time
                const realTimeWindowMinutes = 5; // Default 5 minute window for real-time view
                let startTime = new Date(endTime.getTime() - (realTimeWindowMinutes * 60 * 1000));
                
                // Ensure we show at least the minimum window (30 seconds)
                if (endTime - startTime < 30000) {
                    startTime = new Date(endTime.getTime() - 30000);
                }
                
                Plotly.relayout(plotlyChart, {
                    'xaxis.range': [startTime, endTime],
                    'yaxis.range': [40, 300]
                });
            } else {
                // For normal mode with time range, also use current time as reference point
                const currentTime = new Date();
                
                // Calculate the start time based on the timeRange
                const hourInMillis = 60 * 60 * 1000;
                const startTime = new Date(currentTime - timeRange * hourInMillis);
                
                console.log(`重置缩放：从${startTime.toLocaleString()}到${currentTime.toLocaleString()}`);
                
                // Set the x-axis range to show the specified time period
                Plotly.relayout(plotlyChart, {
                    'xaxis.range': [startTime, currentTime],
                    'yaxis.range': [40, 300],
                    'yaxis.autorange': false
                });
            }
        }
    }
    
    function toggleFullscreen() {
        const chartContainer = document.querySelector('.chart-container');
        
        if (!document.fullscreenElement) {
            if (chartContainer.requestFullscreen) {
                chartContainer.requestFullscreen();
            } else if (chartContainer.webkitRequestFullscreen) {
                chartContainer.webkitRequestFullscreen();
            } else if (chartContainer.msRequestFullscreen) {
                chartContainer.msRequestFullscreen();
            }
            fullscreenButton.innerHTML = '<i class="fas fa-compress"></i>';
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
            fullscreenButton.innerHTML = '<i class="fas fa-expand"></i>';
        }
    }
    
    // Update UI controls based on patient state
    function updateControlsBasedOnPatient(patientId) {
        if (!patientStates[patientId]) {
            patientStates[patientId] = {
                isDataInitialized: false,
                isFlowActive: false,
                isAttackActive: false,
                realtimeData: []
            };
        }
        
        const state = patientStates[patientId];
        
        // Update UI elements based on this patient's state
        updateControlUI(
            state.isDataInitialized, 
            state.isFlowActive, 
            state.isAttackInProgress
        );
        
        // If this patient has an active data flow, restart it
        if (state.isFlowActive) {
            if (dataUpdateInterval) {
                clearInterval(dataUpdateInterval);
            }
            
            dataUpdateInterval = setInterval(() => {
                addNewDataPoint(patientId);
            }, 1000);
        }
    }
    
    // Update control UI elements based on states
    function updateControlUI(isInitialized, isFlowActive, isAttackActive) {
        // Initialize button
        if (isInitialized) {
            initializeBtn.innerHTML = '<i class="fas fa-database"></i> Initialized';
            dataStatusDot.className = 'status-dot active';
        } else {
            initializeBtn.innerHTML = '<i class="fas fa-database"></i> Initialize';
            dataStatusDot.className = 'status-dot inactive';
        }
        
        // Toggle flow button
        if (isFlowActive) {
            toggleFlowBtn.innerHTML = '<i class="fas fa-power-off"></i> Deactivate';
            toggleFlowBtn.className = 'control-btn pause';
            flowStatusDot.className = 'status-dot active';
        } else {
            toggleFlowBtn.innerHTML = '<i class="fas fa-power-off"></i> Activate';
            toggleFlowBtn.className = 'control-btn start';
            flowStatusDot.className = 'status-dot inactive';
        }
        
        // Attack button and status
        attackBtn.disabled = isAttackActive;
        attackStatusDot.className = isAttackActive ? 'status-dot pending' : 'status-dot inactive';
    }
    
    // Control functions - all take patientId as a parameter
    
    // Initialize data for a specific patient
    function initializeData(patientId) {
        // Ensure patientId is valid and contains # symbol (indicating a specific patient, not just a type)
        if (!patientId || !patientId.includes('#') || !patientStates[patientId] || patientStates[patientId].isDataInitialized) {
            if (patientId && !patientId.includes('#')) {
                alert('Please select a valid patient ID, not a patient type');
            }
            return;
        }
        
        console.log("Initializing data for patient:", patientId);
        
        // Show loading state
        initializeBtn.disabled = true;
        initializeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Initializing...';
        dataStatusDot.className = 'status-dot pending';
        
        // Properly encode the patient ID for URL safety
        const encodedPatientId = encodeURIComponent(patientId);
        
        // Log the full URL for debugging
        const url = `/initialize_patient_data/${encodedPatientId}`;
        console.log("Making API request to:", url);
        
        // For all patients, use server endpoint to initialize data
        // This endpoint handles predefined patients from CSV specially
        fetch(url, {
            method: 'POST'
        })
        .then(response => {
            console.log("Response status:", response.status);
            if (!response.ok) {
                throw new Error('Server error: ' + response.status);
            }
            return response.json();
        })
        .then(data => {
            console.log('Initialization successful:', data);
            
            // Update patient state
            patientStates[patientId].isDataInitialized = true;
            
            // Update UI
            initializeBtn.disabled = false;
            initializeBtn.innerHTML = '<i class="fas fa-database"></i> Initialized';
            dataStatusDot.className = 'status-dot active';
            
            // Show data insights panel
            dataInsightsPanel.classList.remove('hidden');
            
            // Store the previous time range and mode
            const previousTimeRange = timeRange;
            const previousRealTimeMode = isRealTimeMode;
            
            // Set to 24 hours and disable real-time mode
            timeRange = 24;
            isRealTimeMode = false;
            
            // Update the time button UI
            timeButtons.forEach(button => {
                // Remove active class from all buttons
                button.classList.remove('active');
                
                // Activate the 24 hour button
                if (button.getAttribute('data-hours') === '24') {
                    button.classList.add('active');
                }
            });
            
            // Fetch and display the 24 hours of data
            fetchGlucoseData(patientId);
            
            // Success notification removed - no alert on success
        })
        .catch(error => {
            console.error('Error initializing patient data:', error);
            console.error('URL that caused the error:', url);
            
            // Reset UI on error
            initializeBtn.disabled = false;
            initializeBtn.innerHTML = '<i class="fas fa-database"></i> Initialize';
            dataStatusDot.className = 'status-dot inactive';
            
            alert('Failed to initialize data, please try again.');
        });
    }
    
    // Toggle data flow state for a specific patient
    function toggleDataFlow(patientId) {
        if (!patientId) {
            alert('Please select a patient first');
            return;
        }
        
        // 确保患者ID包含 '#' 符号，说明它是一个具体的患者而不是患者类型
        if (!patientId.includes('#')) {
            console.error("Invalid patient ID (missing # symbol):", patientId);
            alert("Please select a specific patient from the dropdown (must include '#' symbol), not just a patient type.");
            return;
        }
        
        if (!patientStates[patientId]) {
            console.error("找不到患者状态:", patientId);
            alert("无法找到所选患者的状态，请重新选择一个患者。");
            return;
        }
        
        if (!patientStates[patientId].isDataInitialized) {
            alert('Please initialize data first');
            return;
        }
        
        // Toggle based on current state
        if (patientStates[patientId].isFlowActive) {
            // Pause data flow
            stopDataFlow(patientId);
        } else {
            // Start data flow
            startDataFlow(patientId);
        }
    }
    
    // Stop data flow for a specific patient
    function stopDataFlow(patientId) {
        if (!patientId || !patientStates[patientId]) return;
        
        console.log(`Stopping data flow for patient: ${patientId}`);
        
        // Show loading indicator
        const pauseButton = document.getElementById('toggle-flow-btn');
        if (pauseButton) {
            pauseButton.classList.add('loading');
            pauseButton.disabled = true;
        }
        
        // Properly encode the patient ID for URL safety
        const encodedPatientId = encodeURIComponent(patientId);
        
        // Send request to stop data flow on the server
        fetch(`/stop_data_flow/${encodedPatientId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('数据流暂停成功:', data);
            
            // Update patient state
            patientStates[patientId].isFlowActive = false;
            
            // Update UI
            updateControlUI(true, false, patientStates[patientId].isAttackActive);
            
            // Remove loading state from button
            if (pauseButton) {
                pauseButton.classList.remove('loading');
                pauseButton.disabled = false;
            }
        })
        .catch(error => {
            console.error('暂停数据流失败:', error);
            alert('暂停数据流失败: ' + error.message);
            
            // Remove loading state from button
            if (pauseButton) {
                pauseButton.classList.remove('loading');
                pauseButton.disabled = false;
            }
        });
    }
    
    // Start data flow for a specific patient
    function startDataFlow(patientId) {
        if (!patientId || !patientStates[patientId] || !patientStates[patientId].isDataInitialized) {
            return;
        }
        
        // Validate the patient ID format
        if (!patientId.includes('#')) {
            console.error("Invalid patient ID (missing # symbol):", patientId);
            alert("Please select a specific patient from the dropdown (must include '#' symbol), not just a patient type.");
            return;
        }
        
        console.log("Starting data flow for patient:", patientId);
        
        // Show loading indicator
        const startButton = document.getElementById('toggle-flow-btn');
        if (startButton) {
            startButton.classList.add('loading');
            startButton.disabled = true;
        }
        
        // Always fetch fresh historical data to ensure we have it for gray dotted line display
        console.log('Fetching historical data for background display in real-time mode');
        
        // Properly encode the patient ID for URL safety
        const encodedPatientId = encodeURIComponent(patientId);
        console.log('Encoded patient ID for API request:', encodedPatientId);
        
        // First get historical data, then start the data flow
        fetch(`/glucose/${encodedPatientId}?hours=24`)
            .then(response => response.json())
            .then(data => {
                console.log(`Fetched ${data.length} historical data points for background display`);
                
                // Sort the historical data by timestamp to ensure proper ordering
                data.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                
                // Make sure we store the historical data BEFORE switching to real-time mode
                patientStates[patientId].historicalData = data;
                
                // Reset real-time data array - we'll start fresh
                patientStates[patientId].realtimeData = [];
                
                // Now start the data flow - make sure to use the encoded patient ID here
                return fetch(`/start_data_flow/${encodedPatientId}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                console.log('数据流启动成功:', data);
                
                // Update patient state
                patientStates[patientId].isFlowActive = true;
                
                // Reset the attack state when starting a new data flow
                patientStates[patientId].isAttackActive = false;
                
                // Update UI
                updateControlUI(true, true, false);
                
                // First forcefully update the chart with the historical data BEFORE switching to real-time mode
                // This ensures the historical data is drawn first
                console.log('Pre-rendering historical data before switching to real-time mode');
                if (patientStates[patientId].historicalData && patientStates[patientId].historicalData.length > 0) {
                    // Temporarily set real-time mode to true so that historical data is rendered as gray dotted line
                    const previousRealTimeMode = isRealTimeMode;
                    isRealTimeMode = true;
                    
                    // Force a chart update using empty data to make the chart rely on historical data
                    updateChart([]);
                    
                    // Restore the real-time mode setting
                    isRealTimeMode = previousRealTimeMode;
                }
                
                // Now switch to real-time mode
                isRealTimeMode = true;
                
                // Activate real-time button in the UI
                const rtButton = document.querySelector('.time-btn[data-hours="real-time"]');
                if (rtButton) {
                    // Remove active class from all time buttons
                    timeButtons.forEach(button => button.classList.remove('active'));
                    // Make real-time button active
                    rtButton.classList.add('active');
                    console.log('Switched to real-time mode automatically');
                }
                
                // Subscribe to real-time updates for this patient
                console.log('订阅患者实时数据', patientId);
                socket.emit('subscribe', patientId);
                
                // Set up event listener for real-time data if not already set
                if (!window.realTimeListenerSet) {
                    socket.on('glucose_update', function(data) {
                        if (data.patient_id === currentPatientId) {
                            const newPoints = Array.isArray(data.data) ? data.data : [data];
                            
                            console.log('收到实时数据更新:', newPoints.length, '个新数据点');
                            
                            // Add each new point to the real-time array
                            for (const point of newPoints) {
                                addNewDataPoint(point);
                            }
                        }
                    });
                    
                    window.realTimeListenerSet = true;
                }
                
                // Final chart update to ensure it's displaying correctly in real-time mode
                console.log('Final update: displaying historical data as gray dotted line in real-time mode');
                updateChart([]);
            })
            .catch(error => {
                console.error('启动数据流失败:', error);
                alert('启动数据流失败: ' + error.message);
                
                // Reset the state
                patientStates[patientId].isFlowActive = false;
                updateControlUI(true, false, false);
            })
            .finally(() => {
                // Remove loading indicator
                if (startButton) {
                    startButton.classList.remove('loading');
                    startButton.disabled = false;
                }
            });
    }
    
    // Launch attack for a specific patient
    function launchAttack(patientId) {
        if (!patientId || !patientStates[patientId] || 
            !patientStates[patientId].isDataInitialized ||  // Don't allow attacks on uninitialized patients
            patientStates[patientId].isAttackActive) {
            return;
        }
        
        // Set attack status
        patientStates[patientId].isAttackActive = true;
        
        // Update UI
        attackStatusDot.className = 'status-dot pending';
        attackBtn.disabled = true;
        
        // Show attack overlay
        attackOverlay.classList.add('active');
        attackMessage.textContent = 'Executing attack operation...';
        attackStatus.textContent = '';
        attackStatus.className = 'attack-status';
        
        // Simulate attack process (now just 3 seconds instead of 10 for faster feedback)
        setTimeout(() => {
            // Randomly determine if attack is successful
            const isSuccess = Math.random() > 0.5;
            
            if (isSuccess) {
                attackStatusDot.className = 'status-dot active';
                attackStatus.textContent = 'Attack Successful!';
                attackStatus.className = 'attack-status success';
                
                // Get current data for context
                let currentRealtimeData = [];
                if (patientStates[patientId].realtimeData && patientStates[patientId].realtimeData.length > 0) {
                    currentRealtimeData = [...patientStates[patientId].realtimeData];
                }
                
                // Get last glucose value to make attack value somewhat related
                let lastGlucose = 100;
                if (currentRealtimeData.length > 0) {
                    lastGlucose = currentRealtimeData[currentRealtimeData.length - 1].glucose;
                }
                
                // Generate attack data points - create a sequence of 3 rapid extreme values
                for (let i = 0; i < 3; i++) {
                    // If last value was high, go low, and vice versa for more dramatic effect
                    let extremeValue;
                    if (i === 0) {
                        // First point: go to opposite extreme of last value
                        extremeValue = lastGlucose > 150 ? 40 : 300;
                    } else {
                        // Subsequent points: alternate between high and low
                        const prevValue = currentRealtimeData[currentRealtimeData.length - 1].glucose;
                        extremeValue = prevValue > 150 ? 40 : 300;
                    }
                    
                    const attackDataPoint = {
                        id: Math.floor(Math.random() * 10000),
                        patient_id: patientId,
                        glucose: extremeValue,
                        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19)
                    };
                    
                    // Add to local data
                    glucoseData.push(attackDataPoint);
                    
                    // Also add to real-time data if data flow is active
                    if (patientStates[patientId].isFlowActive) {
                        if (!patientStates[patientId].realtimeData) {
                            patientStates[patientId].realtimeData = [attackDataPoint];
                        } else {
                            patientStates[patientId].realtimeData.push(attackDataPoint);
                        }
                        currentRealtimeData.push(attackDataPoint);
                    }
                    
                    // Send data to server
                    fetch('/mock_update', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            patient_id: patientId,
                            data: [attackDataPoint]
                        })
                    }).catch(error => console.error('Error updating data:', error));
                }
                
                // Determine which data to use for update
                let updateData;
                if (isRealTimeMode) {
                    // In real-time mode, only show the data points generated after "Start Data"
                    updateData = [...patientStates[patientId].realtimeData];
                } else {
                    // In regular mode, show all current data
                    updateData = [...glucoseData];
                }
                
                // Update visualizations
                updateChart(updateData);
                updateStats(updateData);
                updateInsights(updateData);
                
                // 如果在实时模式下，自动滚动图表以显示最新数据
                if (isRealTimeMode && plotlyChart && updateData.length > 0) {
                    // 为实时模式创建一个围绕当前时间的窗口
                    // 默认显示最后5分钟
                    const currentTime = new Date();
                    
                    // 设置结束时间为当前时间 + 10秒缓冲
                    const endTime = new Date(currentTime.getTime() + 10000);
                    
                    // 设置开始时间为结束时间 - 5分钟（或配置的timeRange）
                    // 这使图表始终从当前时间向后显示数据
                    const realTimeWindowMinutes = 5; // 实时视图默认5分钟窗口
                    const startTime = new Date(endTime.getTime() - (realTimeWindowMinutes * 60 * 1000));
                    
                    // 确保我们保持最小窗口大小（30秒）
                    if (endTime - startTime < 30000) {
                        startTime = new Date(endTime.getTime() - 30000);
                    }
                    
                    console.log("更新图表时间窗口:", {
                        startTime: startTime,
                        endTime: endTime,
                        duration: (endTime - startTime) / 60000 + "分钟"
                    });
                    
                    // 更新图表的x轴
                    Plotly.relayout(plotlyChart, {
                        'xaxis.range': [startTime, endTime],
                        'yaxis.range': [40, 300]  // 确保Y轴保持固定
                    });
                }
            } else {
                attackStatusDot.className = 'status-dot inactive';
                attackStatus.textContent = 'Attack Failed';
                attackStatus.className = 'attack-status failure';
            }
            
            // Hide attack overlay after 2 seconds and reset state
            setTimeout(() => {
                attackOverlay.classList.remove('active');
                attackBtn.disabled = false;
                patientStates[patientId].isAttackActive = false;
            }, 2000);
        }, 3000); // Reduced from 10s to 3s for faster feedback
    }
    
    // Add the UI for adding new patients
    function setupAddPatientUI() {
        // Create a new button after the patient selector
        const patientSelectionDiv = document.querySelector('.patient-selection');
        const addPatientBtn = document.createElement('button');
        addPatientBtn.id = 'add-patient-btn';
        addPatientBtn.className = 'control-btn add-patient';
        addPatientBtn.innerHTML = '<i class="fas fa-user-plus"></i> Add Patient';
        
        // Insert after patient selector
        patientSelectionDiv.insertBefore(addPatientBtn, document.querySelector('.control-buttons'));
        
        // Add styles for the new button
        const style = document.createElement('style');
        style.textContent = `
            .control-btn.add-patient {
                background-color: #9b59b6;
                margin: 10px 0;
                width: 100%;
            }
            .control-btn.add-patient:hover {
                background-color: #8e44ad;
            }
            
            .patient-modal {
                display: none;
                position: fixed;
                z-index: 2000;
                left: 0;
                top: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0,0,0,0.7);
            }
            
            .patient-modal-content {
                background-color: white;
                margin: 10% auto;
                padding: 20px;
                width: 50%;
                max-width: 500px;
                border-radius: 8px;
                box-shadow: 0 4px 8px rgba(0,0,0,0.2);
            }
            
            .patient-modal h3 {
                margin-top: 0;
                color: var(--primary-color);
            }
            
            .patient-form-group {
                margin-bottom: 15px;
            }
            
            .patient-form-group label {
                display: block;
                margin-bottom: 5px;
                font-weight: 600;
            }
            
            .patient-form-group input {
                width: 100%;
                padding: 8px;
                border: 1px solid #ddd;
                border-radius: 4px;
            }
            
            .patient-form-group select {
                width: 100%;
                padding: 8px;
                border: 1px solid #ddd;
                border-radius: 4px;
            }
            
            .patient-form-buttons {
                text-align: right;
                margin-top: 20px;
            }
            
            .patient-form-buttons button {
                padding: 8px 16px;
                margin-left: 10px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
            }
            
            .patient-form-buttons .cancel-btn {
                background-color: #e74c3c;
                color: white;
            }
            
            .patient-form-buttons .add-btn {
                background-color: var(--success-color);
                color: white;
            }
        `;
        document.head.appendChild(style);
        
        // Create modal for adding patient
        const patientModal = document.createElement('div');
        patientModal.className = 'patient-modal';
        patientModal.id = 'patient-modal';
        patientModal.innerHTML = `
            <div class="patient-modal-content">
                <h3>Add New Patient</h3>
                <form id="add-patient-form">
                    <div class="patient-form-group">
                        <label for="patient-type-input">Patient Type:</label>
                        <select id="patient-type-input" required>
                            <option value="">Select type</option>
                            <option value="adolescent">Adolescent</option>
                            <option value="adult">Adult</option>
                            <option value="child">Child</option>
                        </select>
                    </div>
                    <div class="patient-form-group">
                        <label for="patient-id">Patient ID:</label>
                        <input type="text" id="patient-id-input" placeholder="e.g. 012" required>
                        <small>Note: ID will be prefixed with type (e.g. adult#012)</small>
                    </div>
                    <div class="patient-form-group">
                        <label for="patient-age">Age:</label>
                        <input type="number" id="patient-age-input" min="1" max="120" required>
                    </div>
                    <div class="patient-form-group">
                        <label for="patient-weight">Weight (kg):</label>
                        <input type="number" id="patient-weight-input" min="1" max="300" step="0.1" required>
                    </div>
                    <div class="patient-form-group">
                        <label for="patient-height">Height (cm):</label>
                        <input type="number" id="patient-height-input" min="30" max="250" required>
                    </div>
                    <div class="patient-form-group">
                        <label for="patient-diabetes">Has Diabetes:</label>
                        <select id="patient-diabetes-input">
                            <option value="false">No</option>
                            <option value="true">Yes</option>
                        </select>
                    </div>
                    <div class="patient-form-group" id="diabetes-type-group" style="display: none;">
                        <label for="patient-diabetes-type">Diabetes Type:</label>
                        <select id="patient-diabetes-type-input">
                            <option value="1">Type 1</option>
                            <option value="2">Type 2</option>
                        </select>
                    </div>
                    <div class="patient-form-buttons">
                        <button type="button" class="cancel-btn" id="cancel-patient-btn">Cancel</button>
                        <button type="submit" class="add-btn">Add Patient</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(patientModal);
        
        // Add event listeners for the modal
        addPatientBtn.addEventListener('click', function() {
            document.getElementById('patient-modal').style.display = 'block';
        });
        
        document.getElementById('cancel-patient-btn').addEventListener('click', function() {
            document.getElementById('patient-modal').style.display = 'none';
        });
        
        // Show/hide diabetes type based on selection
        document.getElementById('patient-diabetes-input').addEventListener('change', function() {
            document.getElementById('diabetes-type-group').style.display = 
                this.value === 'true' ? 'block' : 'none';
        });
        
        // Form submission
        document.getElementById('add-patient-form').addEventListener('submit', function(e) {
            e.preventDefault();
            addNewPatient(e);
        });
    }
    
    // Add a new patient to the system
    function addNewPatient() {
        const patientType = document.getElementById('patient-type-input').value;
        const patientIdInput = document.getElementById('patient-id-input').value;
        const age = parseInt(document.getElementById('patient-age-input').value) || 30;
        const weight = parseFloat(document.getElementById('patient-weight-input').value) || 70;
        const height = parseInt(document.getElementById('patient-height-input').value) || 170;
        const hasDiabetes = document.getElementById('patient-diabetes-input').value === 'true';
        const diabetesType = hasDiabetes ? parseInt(document.getElementById('patient-diabetes-type-input').value) : null;
        
        // Check if patient type is selected
        if (!patientType) {
            alert('Please select a patient type');
            return;
        }
        
        // Validate patient ID
        if (!patientIdInput.trim()) {
            alert('Please enter a patient ID');
            return;
        }
        
        // Format patient ID with type prefix
        const patientId = patientType + '#' + patientIdInput;
        
        // Check if patient ID already exists
        if (patientStates[patientId]) {
            alert('A patient with this ID already exists.');
            return;
        }
        
        // Create patient data object
        const patientData = {
            id: patientId,
            type: patientType,
            age: age,
            weight: weight,
            height: height,
            has_diabetes: hasDiabetes,
            diabetes_type: diabetesType
        };
        
        // Add loading state
        const addBtn = document.querySelector('.add-btn');
        const originalText = addBtn.textContent;
        addBtn.disabled = true;
        addBtn.textContent = 'Adding...';
        
        // Send to server
        fetch('/patient/add', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(patientData)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Server returned ' + response.status);
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                // Hide modal
                document.getElementById('patient-modal').style.display = 'none';
                
                // Initialize patient state
                patientStates[patientId] = {
                    isDataInitialized: false,
                    isFlowActive: false,
                    isAttackActive: false,
                    realtimeData: []
                };
                
                // Update the patient list if the current type matches
                const currentSelectedType = document.getElementById('patient-type-selector').value;
                if (currentSelectedType === patientType) {
                    // Add to patient selector
                    const patientSelector = document.getElementById('patient-selector');
                    const option = document.createElement('option');
                    option.value = patientId;
                    option.textContent = `${patientId} [Custom]`;
                    option.style.color = '#e67e22'; // Orange color for custom patients
                    patientSelector.appendChild(option);
                    
                    // Select the new patient
                    patientSelector.value = patientId;
                    
                    // Trigger the change event to load the patient data
                    const event = new Event('change');
                    patientSelector.dispatchEvent(event);
                    
                    // Show confirmation message
                    alert(`Patient ${patientId} added successfully!`);
                } else {
                    // Change the patient type selector to the new patient's type
                    document.getElementById('patient-type-selector').value = patientType;
                    
                    // Trigger the change event to load patients of this type
                    const event = new Event('change');
                    document.getElementById('patient-type-selector').dispatchEvent(event);
                    
                    // Show a message and let the type change event handle the rest
                    alert(`Patient ${patientId} added successfully! Switching to ${patientType} patient list.`);
                    
                    // We'll select the patient after the list is loaded in a small timeout
                    setTimeout(() => {
                        const patientSelector = document.getElementById('patient-selector');
                        patientSelector.value = patientId;
                        patientSelector.dispatchEvent(new Event('change'));
                    }, 500);
                }
                
                // Reset form
                document.getElementById('add-patient-form').reset();
                document.getElementById('diabetes-type-group').style.display = 'none';
            } else {
                alert('Failed to add patient: ' + (data.error || 'Unknown error'));
            }
        })
        .catch(error => {
            console.error('Error adding patient:', error);
            alert('Error adding patient: ' + error.message);
        })
        .finally(() => {
            // Reset button state
            addBtn.disabled = false;
            addBtn.textContent = originalText;
        });
    }
    
    // 添加处理实时数据更新的函数
    function addNewDataPoint(newDataPoint) {
        // Check if we have the current patient ID
        if (!currentPatientId) {
            console.error('Cannot add data point: no current patient ID');
            return;
        }
        
        // Make sure patient state exists
        if (!patientStates[currentPatientId]) {
            console.error('Cannot add data point: patient state not initialized for', currentPatientId);
            return;
        }
        
        // Skip if the data point is for a different patient
        if (newDataPoint.patient_id !== currentPatientId) {
            console.log('Ignoring data point for different patient:', newDataPoint.patient_id);
            return;
        }
        
        console.log('Adding new data point:', newDataPoint);
        
        // Add the point to the real-time data array
        if (!patientStates[currentPatientId].realtimeData) {
            patientStates[currentPatientId].realtimeData = [];
        }
        
        // When adding the first real-time data point, ensure it connects with historical data
        if (patientStates[currentPatientId].realtimeData.length === 0 && 
            patientStates[currentPatientId].historicalData && 
            patientStates[currentPatientId].historicalData.length > 0) {
            
            // Get the last historical data point
            const lastHistoricalPoint = patientStates[currentPatientId].historicalData[
                patientStates[currentPatientId].historicalData.length - 1
            ];
            
            console.log('Connecting historical data to real-time data:', 
                     'Last historical point:', lastHistoricalPoint, 
                     'First real-time point:', newDataPoint);
            
            // Add a "bridge" point that's identical to the last historical point
            // This creates a smooth transition from historical to real-time data
            patientStates[currentPatientId].realtimeData.push({
                id: 'bridge-' + lastHistoricalPoint.id,
                patient_id: currentPatientId,
                glucose: lastHistoricalPoint.glucose,
                timestamp: lastHistoricalPoint.timestamp
            });
        }
        
        // Add the actual new data point
        patientStates[currentPatientId].realtimeData.push(newDataPoint);
        
        // Only update the UI if in real-time mode
        if (isRealTimeMode) {
            // Update the chart with current data (it will automatically include historical data as gray line)
            updateChart(patientStates[currentPatientId].realtimeData);
            
            // Update stats and insights with just the real-time data
            updateStats(patientStates[currentPatientId].realtimeData);
            updateInsights(patientStates[currentPatientId].realtimeData);
        }
    }
    
    // 修改socketio处理函数来处理来自服务器的实时数据更新
    socket.on('glucose_update', function(data) {
        console.log("收到WebSocket数据更新:", data);
        
        // 检查这个更新是否针对当前选中的患者
        if (data.patient_id === currentPatientId) {
            console.log("数据匹配当前患者:", currentPatientId);
            
            // 检查是否是数据数组
            if (data.data && Array.isArray(data.data) && data.data.length > 0) {
                console.log("接收到的数据点:", data.data.length, "个");
                
                // 处理每个数据点
                data.data.forEach(dataPoint => {
                    // 记录每个数据点
                    console.log("处理数据点:", dataPoint);
                    
                    // 如果数据流处于活动状态，处理新的数据点
                    if (patientStates[currentPatientId] && 
                        patientStates[currentPatientId].isFlowActive) {
                        console.log("数据流处于活动状态，添加数据点");
                        addNewDataPoint(dataPoint);
                    } else {
                        console.log("数据流未活动，忽略数据点", {
                            patientState: patientStates[currentPatientId] ? patientStates[currentPatientId] : "未定义",
                            isFlowActive: patientStates[currentPatientId] ? patientStates[currentPatientId].isFlowActive : "未定义"
                        });
                    }
                });
            } else {
                // 处理可能的单一数据点格式
                console.log("可能的单一数据点格式:", data);
                
                // 如果数据中有glucose和timestamp字段，将其作为单一数据点处理
                if (data.glucose !== undefined && data.timestamp !== undefined) {
                    const dataPoint = {
                        id: data.id || Math.floor(Math.random() * 10000),
                        patient_id: data.patient_id,
                        glucose: data.glucose,
                        timestamp: data.timestamp
                    };
                    
                    console.log("从单一格式构建数据点:", dataPoint);
                    
                    // 如果数据流处于活动状态，处理新的数据点
                    if (patientStates[currentPatientId] && 
                        patientStates[currentPatientId].isFlowActive) {
                        console.log("数据流处于活动状态，添加单一数据点");
                        addNewDataPoint(dataPoint);
                    }
                }
            }
        } else {
            console.log("数据不匹配当前患者:", {
                dataPatientId: data.patient_id,
                currentPatientId: currentPatientId
            });
        }
    });
}); 