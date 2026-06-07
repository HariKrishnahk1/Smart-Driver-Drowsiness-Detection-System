import sqlite3
import os

DB_PATH = os.environ.get('DATABASE_PATH', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'drowsiness_system.db'))

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Create drivers table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS drivers (
            vehicle_number TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Create owners table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS owners (
            owner_id TEXT PRIMARY KEY,
            password_hash TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Create cameras table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS cameras (
            vehicle_number TEXT PRIMARY KEY,
            camera_type TEXT NOT NULL,
            camera_url TEXT,
            paired_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (vehicle_number) REFERENCES drivers (vehicle_number) ON DELETE CASCADE
        )
    ''')
    
    # Create alerts table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vehicle_number TEXT NOT NULL,
            alert_type TEXT NOT NULL, -- 'sleeping', 'yawning', 'nodding'
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            screenshot_path TEXT,
            FOREIGN KEY (vehicle_number) REFERENCES drivers (vehicle_number) ON DELETE CASCADE
        )
    ''')
    
    # Create login_history table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS login_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            role TEXT NOT NULL, -- 'driver', 'owner'
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    conn.commit()
    conn.close()
    print("Database initialized successfully.")

# Driver operations
def create_driver(vehicle_number, name, password_hash):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            'INSERT INTO drivers (vehicle_number, name, password_hash) VALUES (?, ?, ?)',
            (vehicle_number.strip().upper(), name.strip(), password_hash)
        )
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        return False
    finally:
        conn.close()

def get_driver(vehicle_number):
    conn = get_db_connection()
    row = conn.execute(
        'SELECT * FROM drivers WHERE vehicle_number = ?',
        (vehicle_number.strip().upper(),)
    ).fetchone()
    conn.close()
    return dict(row) if row else None

# Owner operations
def create_owner(owner_id, password_hash):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            'INSERT INTO owners (owner_id, password_hash) VALUES (?, ?)',
            (owner_id.strip(), password_hash)
        )
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        return False
    finally:
        conn.close()

def get_owner(owner_id):
    conn = get_db_connection()
    row = conn.execute(
        'SELECT * FROM owners WHERE owner_id = ?',
        (owner_id.strip(),)
    ).fetchone()
    conn.close()
    return dict(row) if row else None

# Camera operations
def pair_camera(vehicle_number, camera_type, camera_url=None):
    conn = get_db_connection()
    cursor = conn.cursor()
    # Use REPLACE to update camera if vehicle number already exists
    cursor.execute(
        'INSERT OR REPLACE INTO cameras (vehicle_number, camera_type, camera_url) VALUES (?, ?, ?)',
        (vehicle_number.strip().upper(), camera_type, camera_url)
    )
    conn.commit()
    conn.close()

def get_camera(vehicle_number):
    conn = get_db_connection()
    row = conn.execute(
        'SELECT * FROM cameras WHERE vehicle_number = ?',
        (vehicle_number.strip().upper(),)
    ).fetchone()
    conn.close()
    return dict(row) if row else None

# Alert operations
def create_alert(vehicle_number, alert_type, screenshot_path):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        'INSERT INTO alerts (vehicle_number, alert_type, screenshot_path) VALUES (?, ?, ?)',
        (vehicle_number.strip().upper(), alert_type, screenshot_path)
    )
    conn.commit()
    alert_id = cursor.lastrowid
    conn.close()
    return alert_id

def get_alerts(vehicle_number=None, limit=50):
    conn = get_db_connection()
    if vehicle_number:
        rows = conn.execute(
            'SELECT * FROM alerts WHERE vehicle_number = ? ORDER BY timestamp DESC LIMIT ?',
            (vehicle_number.strip().upper(), limit)
        ).fetchall()
    else:
        rows = conn.execute(
            'SELECT * FROM alerts ORDER BY timestamp DESC LIMIT ?',
            (limit,)
        ).fetchall()
    conn.close()
    return [dict(row) for row in rows]

# History operations
def log_login(user_id, role):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        'INSERT INTO login_history (user_id, role) VALUES (?, ?)',
        (user_id.strip().upper() if role == 'driver' else user_id.strip(), role)
    )
    conn.commit()
    conn.close()

def get_login_history(user_id, role, limit=10):
    conn = get_db_connection()
    rows = conn.execute(
        'SELECT * FROM login_history WHERE user_id = ? AND role = ? ORDER BY timestamp DESC LIMIT ?',
        (user_id.strip().upper() if role == 'driver' else user_id.strip(), role, limit)
    ).fetchall()
    conn.close()
    return [dict(row) for row in rows]

# Stats and Dashboard metrics
def get_dashboard_stats():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Total active alerts count
    cursor.execute('SELECT COUNT(*) as count FROM alerts')
    total_alerts = cursor.fetchone()['count']
    
    # Counts by alert type
    cursor.execute('SELECT alert_type, COUNT(*) as count FROM alerts GROUP BY alert_type')
    alerts_by_type = {row['alert_type']: row['count'] for row in cursor.fetchall()}
    
    # Ensure all alert types are present in dict
    for atype in ['sleeping', 'yawning', 'nodding']:
        if atype not in alerts_by_type:
            alerts_by_type[atype] = 0
            
    # Alerts in the last 24 hours
    cursor.execute("SELECT COUNT(*) as count FROM alerts WHERE timestamp >= datetime('now', '-1 day')")
    alerts_24h = cursor.fetchone()['count']

    # Alert count by vehicle
    cursor.execute('SELECT vehicle_number, COUNT(*) as count FROM alerts GROUP BY vehicle_number ORDER BY count DESC LIMIT 5')
    alerts_by_vehicle = [dict(row) for row in cursor.fetchall()]
    
    # Alert trend per hour (last 8 hours)
    # Using strftime to get hour
    cursor.execute("""
        SELECT strftime('%H:00', timestamp) as hour, COUNT(*) as count 
        from alerts 
        where timestamp >= datetime('now', '-8 hours')
        group by hour 
        order by timestamp ASC
    """)
    hourly_trend = [dict(row) for row in cursor.fetchall()]

    conn.close()
    return {
        'total_alerts': total_alerts,
        'alerts_by_type': alerts_by_type,
        'alerts_24h': alerts_24h,
        'alerts_by_vehicle': alerts_by_vehicle,
        'hourly_trend': hourly_trend
    }
