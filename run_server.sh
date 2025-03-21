#!/bin/bash

# Stop all Python processes
echo "Stopping all Python processes..."
pkill -f python || true

# Wait to ensure all processes are closed
sleep 1

# Clean up any temporary files
echo "Cleaning temporary files..."
rm -f instance/*.db || true

# Start the application
echo "Starting Glucose Simulation Platform..."
cd backend && python run.py 