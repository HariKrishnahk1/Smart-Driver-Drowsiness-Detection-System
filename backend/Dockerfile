# Use python 3.10 slim buster
FROM python:3.10-slim

# Install system dependencies required for OpenCV and MediaPipe
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements and install
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the backend files
COPY . .

# Set working directory to backend
WORKDIR /app/backend

# Create database volume directory
RUN mkdir -p /app/db_volume

# Expose backend port
EXPOSE 5000

# Set environment variable to run database from the volume
ENV DATABASE_PATH=/app/db_volume/drowsiness_system.db

# Run the socketio app
CMD ["python", "app.py"]
