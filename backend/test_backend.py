import database as db
from werkzeug.security import generate_password_hash, check_password_hash
import os
import sys

def run_tests():
    print("=== STARTING BACKEND INTEGRATION TESTS ===")
    
    # 1. Initialize Database
    try:
        db.init_db()
        print("[SUCCESS] Database initialized.")
    except Exception as e:
        print(f"[FAIL] Database initialization failed: {e}")
        sys.exit(1)
        
    # 2. Test Owner CRUD
    print("\n--- Testing Owner Auth ---")
    pw_hash = generate_password_hash("secure_password")
    
    # Create Owner
    owner_success = db.create_owner("owner_test", pw_hash)
    if owner_success:
        print("[SUCCESS] Test Owner created.")
    else:
        print("[WARN] Test Owner might already exist (integrity checked).")
        
    # Retrieve & Verify Owner
    owner = db.get_owner("owner_test")
    if owner and check_password_hash(owner['password_hash'], "secure_password"):
        print("[SUCCESS] Owner retrieval and verification succeeded.")
    else:
        print("[FAIL] Owner retrieval/verification failed.")
        
    # 3. Test Driver CRUD
    print("\n--- Testing Driver Auth ---")
    driver_pw_hash = generate_password_hash("driver_password")
    
    # Create Driver
    driver_success = db.create_driver("KA05MJ9999", "John Tester", driver_pw_hash)
    if driver_success:
        print("[SUCCESS] Test Driver created.")
    else:
        print("[WARN] Test Driver might already exist (integrity checked).")
        
    # Retrieve & Verify Driver
    driver = db.get_driver("KA05MJ9999")
    if driver and check_password_hash(driver['password_hash'], "driver_password"):
        print("[SUCCESS] Driver retrieval and verification succeeded.")
    else:
        print("[FAIL] Driver retrieval/verification failed.")
        
    # 4. Test Camera Pairing
    print("\n--- Testing Camera Pairing ---")
    try:
        db.pair_camera("KA05MJ9999", "webcam")
        camera = db.get_camera("KA05MJ9999")
        if camera and camera['camera_type'] == 'webcam':
            print("[SUCCESS] Camera pairing and retrieval verified.")
        else:
            print("[FAIL] Camera pairing returned incorrect properties.")
    except Exception as e:
        print(f"[FAIL] Camera pairing error: {e}")
        
    # 5. Test Alert Log
    print("\n--- Testing Alert Logging ---")
    try:
        alert_id = db.create_alert("KA05MJ9999", "sleeping", "/backend/screenshots/mock_sleep.jpg")
        print(f"[SUCCESS] Mock Alert created with ID: {alert_id}")
        
        alerts = db.get_alerts("KA05MJ9999")
        if len(alerts) > 0 and alerts[0]['alert_type'] == 'sleeping':
            print(f"[SUCCESS] Alert list returned successfully. Count: {len(alerts)}")
        else:
            print("[FAIL] Alert retrieval returned empty or incorrect results.")
    except Exception as e:
        print(f"[FAIL] Alert creation error: {e}")
        
    # 6. Test Login History
    print("\n--- Testing Login History ---")
    try:
        db.log_login("KA05MJ9999", "driver")
        db.log_login("owner_test", "owner")
        driver_history = db.get_login_history("KA05MJ9999", "driver")
        owner_history = db.get_login_history("owner_test", "owner")
        
        if len(driver_history) > 0 and len(owner_history) > 0:
            print("[SUCCESS] Login history logging and retrieval successful.")
        else:
            print("[FAIL] Login history lists empty.")
    except Exception as e:
        print(f"[FAIL] Login history error: {e}")

    # 7. Test Dashboard Stats Compilation
    print("\n--- Testing Stats Compiler ---")
    try:
        stats = db.get_dashboard_stats()
        print("[SUCCESS] Compiled stats keys:")
        for k, v in stats.items():
            print(f"  - {k}: {v}")
    except Exception as e:
        print(f"[FAIL] Stats compilation error: {e}")
        
    print("\n=== BACKEND TESTS COMPLETED ===")

if __name__ == '__main__':
    run_tests()
