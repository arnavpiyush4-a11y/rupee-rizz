#!/usr/bin/env python3
"""
RupeeRizz Backend API Test Suite
Tests all backend endpoints with focus on:
- Auth (demo + email)
- Consent gating
- Profile onboarding
- OCR validation
- Receipts CRUD + masking + user isolation
- Dashboard
- Goals + contributions
- Financial health
- Before You Borrow
- AI insights
- Schemes
- My Data export/delete
"""

import requests
import json
import base64
import random
import string
from datetime import datetime

# Base URL - using localhost for internal testing
BASE_URL = "http://localhost:3000/api"

def random_email():
    """Generate random email for testing"""
    rand = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
    return f"test+{rand}@example.com"

def create_tiny_png_data_url():
    """Create a minimal valid PNG data URL for testing"""
    # 1x1 transparent PNG
    png_bytes = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    )
    b64 = base64.b64encode(png_bytes).decode('utf-8')
    return f"data:image/png;base64,{b64}"

def create_bad_mime_data_url():
    """Create a data URL with non-image mime type"""
    return "data:text/plain;base64,aGVsbG8="

class TestResults:
    def __init__(self):
        self.passed = []
        self.failed = []
        self.warnings = []
    
    def add_pass(self, test_name):
        self.passed.append(test_name)
        print(f"✅ PASS: {test_name}")
    
    def add_fail(self, test_name, reason):
        self.failed.append((test_name, reason))
        print(f"❌ FAIL: {test_name} - {reason}")
    
    def add_warning(self, test_name, reason):
        self.warnings.append((test_name, reason))
        print(f"⚠️  WARNING: {test_name} - {reason}")
    
    def summary(self):
        print("\n" + "="*80)
        print("TEST SUMMARY")
        print("="*80)
        print(f"✅ Passed: {len(self.passed)}")
        print(f"❌ Failed: {len(self.failed)}")
        print(f"⚠️  Warnings: {len(self.warnings)}")
        
        if self.failed:
            print("\nFailed Tests:")
            for name, reason in self.failed:
                print(f"  - {name}: {reason}")
        
        if self.warnings:
            print("\nWarnings:")
            for name, reason in self.warnings:
                print(f"  - {name}: {reason}")
        
        return len(self.failed) == 0

results = TestResults()

def test_auth():
    """Test authentication endpoints"""
    print("\n" + "="*80)
    print("TESTING AUTH")
    print("="*80)
    
    # Test 1: Demo student login
    try:
        resp = requests.post(f"{BASE_URL}/auth/session", json={"demo": True, "demo_profile": "student"})
        if resp.status_code == 200:
            data = resp.json()
            if "user" in data and "id" in data["user"] and data.get("seeded") == True:
                results.add_pass("Auth: Demo student login")
                student_user = data["user"]
            else:
                results.add_fail("Auth: Demo student login", f"Missing user.id or seeded flag: {data}")
                student_user = None
        else:
            results.add_fail("Auth: Demo student login", f"Status {resp.status_code}: {resp.text}")
            student_user = None
    except Exception as e:
        results.add_fail("Auth: Demo student login", str(e))
        student_user = None
    
    # Test 2: Demo entrepreneur login
    try:
        resp = requests.post(f"{BASE_URL}/auth/session", json={"demo": True, "demo_profile": "entrepreneur"})
        if resp.status_code == 200:
            data = resp.json()
            if "user" in data and "id" in data["user"] and data.get("seeded") == True:
                results.add_pass("Auth: Demo entrepreneur login")
                entrepreneur_user = data["user"]
            else:
                results.add_fail("Auth: Demo entrepreneur login", f"Missing user.id or seeded flag: {data}")
                entrepreneur_user = None
        else:
            results.add_fail("Auth: Demo entrepreneur login", f"Status {resp.status_code}: {resp.text}")
            entrepreneur_user = None
    except Exception as e:
        results.add_fail("Auth: Demo entrepreneur login", str(e))
        entrepreneur_user = None
    
    # Test 3: Email login
    try:
        email = random_email()
        resp = requests.post(f"{BASE_URL}/auth/session", json={"email": email, "name": "Test User"})
        if resp.status_code == 200:
            data = resp.json()
            if "user" in data and "id" in data["user"]:
                results.add_pass("Auth: Email login")
                email_user = data["user"]
            else:
                results.add_fail("Auth: Email login", f"Missing user.id: {data}")
                email_user = None
        else:
            results.add_fail("Auth: Email login", f"Status {resp.status_code}: {resp.text}")
            email_user = None
    except Exception as e:
        results.add_fail("Auth: Email login", str(e))
        email_user = None
    
    # Test 4: Missing email should return 400 with code email_required
    try:
        resp = requests.post(f"{BASE_URL}/auth/session", json={})
        if resp.status_code == 400:
            data = resp.json()
            if data.get("code") == "email_required":
                results.add_pass("Auth: Missing email returns 400 email_required")
            else:
                results.add_fail("Auth: Missing email returns 400 email_required", f"Wrong code: {data.get('code')}")
        else:
            results.add_fail("Auth: Missing email returns 400 email_required", f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        results.add_fail("Auth: Missing email returns 400 email_required", str(e))
    
    # Test 5: Protected route without Authorization should return 401 no_auth
    try:
        resp = requests.get(f"{BASE_URL}/me")
        if resp.status_code == 401:
            data = resp.json()
            if data.get("code") == "no_auth":
                results.add_pass("Auth: No auth header returns 401 no_auth")
            else:
                results.add_fail("Auth: No auth header returns 401 no_auth", f"Wrong code: {data.get('code')}")
        else:
            results.add_fail("Auth: No auth header returns 401 no_auth", f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        results.add_fail("Auth: No auth header returns 401 no_auth", str(e))
    
    # Test 6: Invalid Bearer token should return 401
    try:
        resp = requests.get(f"{BASE_URL}/me", headers={"Authorization": "Bearer invalid-token-12345"})
        if resp.status_code == 401:
            data = resp.json()
            if data.get("code") == "no_auth":
                results.add_pass("Auth: Invalid token returns 401 no_auth")
            else:
                results.add_fail("Auth: Invalid token returns 401 no_auth", f"Wrong code: {data.get('code')}")
        else:
            results.add_fail("Auth: Invalid token returns 401 no_auth", f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        results.add_fail("Auth: Invalid token returns 401 no_auth", str(e))
    
    return student_user, entrepreneur_user, email_user

def test_consent_gating(email_user):
    """Test consent gating with fresh email user"""
    print("\n" + "="*80)
    print("TESTING CONSENT GATING")
    print("="*80)
    
    if not email_user:
        results.add_fail("Consent: Skipped", "No email user available")
        return
    
    headers = {"Authorization": f"Bearer {email_user['id']}"}
    
    # Test protected endpoints should return 403 consent_required
    protected_endpoints = [
        ("GET", "/dashboard"),
        ("POST", "/ocr/receipt", {"image": create_tiny_png_data_url()}),
        ("POST", "/receipts", {"merchant": "Test", "total": 100}),
        ("POST", "/insights/generate", {}),
        ("POST", "/before-you-borrow", {}),
    ]
    
    for method, endpoint, *body_args in protected_endpoints:
        try:
            body = body_args[0] if body_args else None
            if method == "GET":
                resp = requests.get(f"{BASE_URL}{endpoint}", headers=headers)
            else:
                resp = requests.post(f"{BASE_URL}{endpoint}", headers=headers, json=body)
            
            if resp.status_code == 403:
                data = resp.json()
                if data.get("code") == "consent_required":
                    results.add_pass(f"Consent gate: {method} {endpoint} returns 403 consent_required")
                else:
                    results.add_fail(f"Consent gate: {method} {endpoint}", f"Wrong code: {data.get('code')}")
            else:
                results.add_fail(f"Consent gate: {method} {endpoint}", f"Status {resp.status_code}: {resp.text}")
        except Exception as e:
            results.add_fail(f"Consent gate: {method} {endpoint}", str(e))
    
    # Test POST /api/consent
    try:
        resp = requests.post(f"{BASE_URL}/consent", headers=headers, json={})
        if resp.status_code == 200:
            data = resp.json()
            if data.get("active") == True:
                results.add_pass("Consent: POST /consent returns active=true")
            else:
                results.add_fail("Consent: POST /consent", f"active not true: {data}")
        else:
            results.add_fail("Consent: POST /consent", f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        results.add_fail("Consent: POST /consent", str(e))
    
    # Test GET /api/me shows consent.active true
    try:
        resp = requests.get(f"{BASE_URL}/me", headers=headers)
        if resp.status_code == 200:
            data = resp.json()
            if data.get("consent", {}).get("active") == True:
                results.add_pass("Consent: GET /me shows consent.active=true")
            else:
                results.add_fail("Consent: GET /me", f"consent.active not true: {data}")
        else:
            results.add_fail("Consent: GET /me", f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        results.add_fail("Consent: GET /me", str(e))
    
    # Test POST /api/consent/withdraw
    try:
        resp = requests.post(f"{BASE_URL}/consent/withdraw", headers=headers, json={})
        if resp.status_code == 200:
            data = resp.json()
            if data.get("active") == False:
                results.add_pass("Consent: POST /consent/withdraw returns active=false")
            else:
                results.add_fail("Consent: POST /consent/withdraw", f"active not false: {data}")
        else:
            results.add_fail("Consent: POST /consent/withdraw", f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        results.add_fail("Consent: POST /consent/withdraw", str(e))
    
    # Re-consent for further tests
    try:
        requests.post(f"{BASE_URL}/consent", headers=headers, json={})
    except:
        pass

def test_profile(email_user):
    """Test profile onboarding"""
    print("\n" + "="*80)
    print("TESTING PROFILE")
    print("="*80)
    
    if not email_user:
        results.add_fail("Profile: Skipped", "No email user available")
        return
    
    headers = {"Authorization": f"Bearer {email_user['id']}"}
    
    # Test POST /api/profile
    profile_data = {
        "user_type": "student",
        "preferred_language": "en",
        "finance": {
            "income_type": "regular",
            "reliable_monthly_income": 8000,
            "essential_expenses": 4500,
            "non_essential_expenses": 1800,
            "compulsory_emi": 0,
            "business_operating_costs": 0,
            "emergency_fund_amount": 1000
        },
        "initial_goal": {
            "goal_name": "Laptop",
            "goal_amount": 15000,
            "current_saved_amount": 2000,
            "target_date": "2026-01-01"
        }
    }
    
    try:
        resp = requests.post(f"{BASE_URL}/profile", headers=headers, json=profile_data)
        if resp.status_code == 200:
            data = resp.json()
            if "profile" in data and data["profile"].get("user_type") == "student":
                results.add_pass("Profile: POST /profile creates profile")
            else:
                results.add_fail("Profile: POST /profile", f"Invalid response: {data}")
        else:
            results.add_fail("Profile: POST /profile", f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        results.add_fail("Profile: POST /profile", str(e))
    
    # Test GET /api/profile
    try:
        resp = requests.get(f"{BASE_URL}/profile", headers=headers)
        if resp.status_code == 200:
            data = resp.json()
            if "profile" in data and data["profile"].get("user_type") == "student":
                results.add_pass("Profile: GET /profile returns profile")
            else:
                results.add_fail("Profile: GET /profile", f"Invalid response: {data}")
        else:
            results.add_fail("Profile: GET /profile", f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        results.add_fail("Profile: GET /profile", str(e))
    
    # Test that initial_goal was created
    try:
        resp = requests.get(f"{BASE_URL}/goals", headers=headers)
        if resp.status_code == 200:
            data = resp.json()
            if "goals" in data and len(data["goals"]) > 0:
                goal = data["goals"][0]
                if goal.get("goal_name") == "Laptop":
                    results.add_pass("Profile: initial_goal created")
                else:
                    results.add_fail("Profile: initial_goal created", f"Goal name mismatch: {goal.get('goal_name')}")
            else:
                results.add_fail("Profile: initial_goal created", "No goals found")
        else:
            results.add_fail("Profile: initial_goal created", f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        results.add_fail("Profile: initial_goal created", str(e))

def test_ocr(email_user):
    """Test OCR validation"""
    print("\n" + "="*80)
    print("TESTING OCR")
    print("="*80)
    
    if not email_user:
        results.add_fail("OCR: Skipped", "No email user available")
        return
    
    headers = {"Authorization": f"Bearer {email_user['id']}"}
    
    # Test 1: Missing image should return 400 bad_image
    try:
        resp = requests.post(f"{BASE_URL}/ocr/receipt", headers=headers, json={})
        if resp.status_code == 400:
            data = resp.json()
            if data.get("code") == "bad_image":
                results.add_pass("OCR: Missing image returns 400 bad_image")
            else:
                results.add_fail("OCR: Missing image", f"Wrong code: {data.get('code')}")
        else:
            results.add_fail("OCR: Missing image", f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        results.add_fail("OCR: Missing image", str(e))
    
    # Test 2: Bad mime type should return 400 bad_mime
    try:
        resp = requests.post(f"{BASE_URL}/ocr/receipt", headers=headers, json={"image": create_bad_mime_data_url()})
        if resp.status_code == 400:
            data = resp.json()
            if data.get("code") == "bad_mime":
                results.add_pass("OCR: Bad mime returns 400 bad_mime")
            else:
                results.add_fail("OCR: Bad mime", f"Wrong code: {data.get('code')}")
        else:
            results.add_fail("OCR: Bad mime", f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        results.add_fail("OCR: Bad mime", str(e))
    
    # Test 3: Valid PNG should return 200 with extraction
    try:
        resp = requests.post(f"{BASE_URL}/ocr/receipt", headers=headers, json={"image": create_tiny_png_data_url()})
        if resp.status_code == 200:
            data = resp.json()
            extraction = data.get("extraction", {})
            if all(k in extraction for k in ["merchant", "date", "currency", "total", "total_confidence", "items", "needs_user_verification"]):
                if data.get("mode") == "demo":
                    results.add_pass("OCR: Valid PNG returns extraction with mode=demo")
                else:
                    results.add_fail("OCR: Valid PNG", f"Mode not demo: {data.get('mode')}")
            else:
                results.add_fail("OCR: Valid PNG", f"Missing extraction fields: {extraction}")
        else:
            results.add_fail("OCR: Valid PNG", f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        results.add_fail("OCR: Valid PNG", str(e))

def test_receipts(email_user):
    """Test receipts CRUD and phone masking"""
    print("\n" + "="*80)
    print("TESTING RECEIPTS")
    print("="*80)
    
    if not email_user:
        results.add_fail("Receipts: Skipped", "No email user available")
        return None
    
    headers = {"Authorization": f"Bearer {email_user['id']}"}
    
    # Test POST /api/receipts with phone number in merchant
    receipt_data = {
        "merchant": "Cafe Call 98765 43210",
        "items": [
            {
                "item_name": "Coffee",
                "price": 120,
                "category": "Food & Drinks"
            }
        ],
        "total": 120,
        "user_verified": True,
        "image": create_tiny_png_data_url()
    }
    
    receipt_id = None
    try:
        resp = requests.post(f"{BASE_URL}/receipts", headers=headers, json=receipt_data)
        if resp.status_code == 200:
            data = resp.json()
            receipt = data.get("receipt", {})
            merchant = receipt.get("merchant", "")
            sensitive_masked = data.get("sensitive_masked", [])
            
            # Check if phone is masked
            if "98765 43210" not in merchant and "9876543210" not in merchant:
                if "phone" in sensitive_masked:
                    results.add_pass("Receipts: POST masks phone number")
                    receipt_id = receipt.get("id")
                else:
                    results.add_fail("Receipts: POST masks phone", f"Phone masked but not in sensitive_masked: {sensitive_masked}")
                    receipt_id = receipt.get("id")
            else:
                results.add_fail("Receipts: POST masks phone", f"Phone not masked: {merchant}")
        else:
            results.add_fail("Receipts: POST masks phone", f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        results.add_fail("Receipts: POST masks phone", str(e))
    
    # Test GET /api/receipts
    try:
        resp = requests.get(f"{BASE_URL}/receipts", headers=headers)
        if resp.status_code == 200:
            data = resp.json()
            if "receipts" in data and len(data["receipts"]) > 0:
                results.add_pass("Receipts: GET /receipts lists receipts")
            else:
                results.add_fail("Receipts: GET /receipts", "No receipts found")
        else:
            results.add_fail("Receipts: GET /receipts", f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        results.add_fail("Receipts: GET /receipts", str(e))
    
    # Test GET /api/receipts/:id
    if receipt_id:
        try:
            resp = requests.get(f"{BASE_URL}/receipts/{receipt_id}", headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                if "receipt" in data and data["receipt"].get("id") == receipt_id:
                    results.add_pass("Receipts: GET /receipts/:id returns receipt")
                else:
                    results.add_fail("Receipts: GET /receipts/:id", f"Invalid response: {data}")
            else:
                results.add_fail("Receipts: GET /receipts/:id", f"Status {resp.status_code}: {resp.text}")
        except Exception as e:
            results.add_fail("Receipts: GET /receipts/:id", str(e))
        
        # Test PUT /api/receipts/:id
        try:
            update_data = {"merchant": "Updated Cafe", "total": 150}
            resp = requests.put(f"{BASE_URL}/receipts/{receipt_id}", headers=headers, json=update_data)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("receipt", {}).get("merchant") == "Updated Cafe":
                    results.add_pass("Receipts: PUT /receipts/:id updates receipt")
                else:
                    results.add_fail("Receipts: PUT /receipts/:id", f"Update failed: {data}")
            else:
                results.add_fail("Receipts: PUT /receipts/:id", f"Status {resp.status_code}: {resp.text}")
        except Exception as e:
            results.add_fail("Receipts: PUT /receipts/:id", str(e))
        
        # Test DELETE /api/receipts/:id
        try:
            resp = requests.delete(f"{BASE_URL}/receipts/{receipt_id}", headers=headers)
            if resp.status_code == 200:
                # Verify it's deleted
                resp2 = requests.get(f"{BASE_URL}/receipts/{receipt_id}", headers=headers)
                if resp2.status_code == 404:
                    results.add_pass("Receipts: DELETE /receipts/:id removes receipt")
                else:
                    results.add_fail("Receipts: DELETE /receipts/:id", "Receipt still exists after delete")
            else:
                results.add_fail("Receipts: DELETE /receipts/:id", f"Status {resp.status_code}: {resp.text}")
        except Exception as e:
            results.add_fail("Receipts: DELETE /receipts/:id", str(e))
    
    return receipt_id

def test_user_isolation(student_user, entrepreneur_user):
    """Test user isolation - user B cannot access user A's receipts"""
    print("\n" + "="*80)
    print("TESTING USER ISOLATION")
    print("="*80)
    
    if not student_user or not entrepreneur_user:
        results.add_fail("User isolation: Skipped", "Missing demo users")
        return
    
    headers_a = {"Authorization": f"Bearer {student_user['id']}"}
    headers_b = {"Authorization": f"Bearer {entrepreneur_user['id']}"}
    
    # Create a receipt for user A
    receipt_data = {
        "merchant": "User A Store",
        "items": [{"item_name": "Item A", "price": 100, "category": "Other"}],
        "total": 100,
        "user_verified": True
    }
    
    receipt_id_a = None
    try:
        resp = requests.post(f"{BASE_URL}/receipts", headers=headers_a, json=receipt_data)
        if resp.status_code == 200:
            receipt_id_a = resp.json().get("receipt", {}).get("id")
        else:
            results.add_fail("User isolation: Setup", f"Failed to create receipt for user A: {resp.status_code}")
            return
    except Exception as e:
        results.add_fail("User isolation: Setup", str(e))
        return
    
    # Try to access user A's receipt with user B's token
    if receipt_id_a:
        try:
            resp = requests.get(f"{BASE_URL}/receipts/{receipt_id_a}", headers=headers_b)
            if resp.status_code == 404:
                results.add_pass("User isolation: User B cannot GET user A's receipt")
            else:
                results.add_fail("User isolation: User B cannot GET user A's receipt", f"Status {resp.status_code}: {resp.text}")
        except Exception as e:
            results.add_fail("User isolation: User B cannot GET user A's receipt", str(e))
    
    # Verify user B's GET /receipts doesn't include user A's receipts
    try:
        resp = requests.get(f"{BASE_URL}/receipts", headers=headers_b)
        if resp.status_code == 200:
            data = resp.json()
            receipts_b = data.get("receipts", [])
            if not any(r.get("id") == receipt_id_a for r in receipts_b):
                results.add_pass("User isolation: User B's receipts list excludes user A's receipts")
            else:
                results.add_fail("User isolation: User B's receipts list", "Contains user A's receipt")
        else:
            results.add_fail("User isolation: User B's receipts list", f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        results.add_fail("User isolation: User B's receipts list", str(e))

def test_dashboard(student_user):
    """Test dashboard aggregation"""
    print("\n" + "="*80)
    print("TESTING DASHBOARD")
    print("="*80)
    
    if not student_user:
        results.add_fail("Dashboard: Skipped", "No student user available")
        return
    
    headers = {"Authorization": f"Bearer {student_user['id']}"}
    
    try:
        resp = requests.get(f"{BASE_URL}/dashboard", headers=headers)
        if resp.status_code == 200:
            data = resp.json()
            dashboard = data.get("dashboard", {})
            
            # Check required fields
            required_fields = [
                "snapshot", "health", "goals", "spending_by_category",
                "income_vs_expenses", "nudge", "schemes_preview"
            ]
            
            missing = [f for f in required_fields if f not in dashboard]
            if not missing:
                # Check snapshot has safe_monthly_saving
                snapshot = dashboard.get("snapshot", {})
                if "safe_monthly_saving" in snapshot:
                    # Check health has score
                    health = dashboard.get("health", {})
                    if "score" in health and 0 <= health["score"] <= 100:
                        results.add_pass("Dashboard: GET /dashboard returns complete dashboard")
                    else:
                        results.add_fail("Dashboard: GET /dashboard", f"Invalid health score: {health}")
                else:
                    results.add_fail("Dashboard: GET /dashboard", "Missing safe_monthly_saving in snapshot")
            else:
                results.add_fail("Dashboard: GET /dashboard", f"Missing fields: {missing}")
        else:
            results.add_fail("Dashboard: GET /dashboard", f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        results.add_fail("Dashboard: GET /dashboard", str(e))

def test_goals(student_user):
    """Test goals and contributions"""
    print("\n" + "="*80)
    print("TESTING GOALS")
    print("="*80)
    
    if not student_user:
        results.add_fail("Goals: Skipped", "No student user available")
        return
    
    headers = {"Authorization": f"Bearer {student_user['id']}"}
    
    # Test GET /api/goals
    try:
        resp = requests.get(f"{BASE_URL}/goals", headers=headers)
        if resp.status_code == 200:
            data = resp.json()
            if "goals" in data:
                results.add_pass("Goals: GET /goals returns goals")
                goals = data["goals"]
            else:
                results.add_fail("Goals: GET /goals", "Missing goals field")
                goals = []
        else:
            results.add_fail("Goals: GET /goals", f"Status {resp.status_code}: {resp.text}")
            goals = []
    except Exception as e:
        results.add_fail("Goals: GET /goals", str(e))
        goals = []
    
    # Test POST /api/goals
    goal_data = {
        "goal_name": "New Phone",
        "goal_amount": 20000,
        "current_saved_amount": 5000,
        "target_date": "2026-06-01"
    }
    
    new_goal_id = None
    try:
        resp = requests.post(f"{BASE_URL}/goals", headers=headers, json=goal_data)
        if resp.status_code == 200:
            data = resp.json()
            goal = data.get("goal", {})
            if goal.get("goal_name") == "New Phone":
                results.add_pass("Goals: POST /goals creates goal")
                new_goal_id = goal.get("id")
            else:
                results.add_fail("Goals: POST /goals", f"Invalid response: {data}")
        else:
            results.add_fail("Goals: POST /goals", f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        results.add_fail("Goals: POST /goals", str(e))
    
    # Test POST /api/goals/:id/contribute
    if new_goal_id:
        try:
            resp = requests.post(f"{BASE_URL}/goals/{new_goal_id}/contribute", headers=headers, json={"amount": 500})
            if resp.status_code == 200:
                data = resp.json()
                goal = data.get("goal", {})
                # Should be 5000 + 500 = 5500
                if goal.get("current_saved_amount") == 5500:
                    results.add_pass("Goals: POST /goals/:id/contribute increments saved amount")
                else:
                    results.add_fail("Goals: POST /goals/:id/contribute", f"Amount not incremented correctly: {goal.get('current_saved_amount')}")
            else:
                results.add_fail("Goals: POST /goals/:id/contribute", f"Status {resp.status_code}: {resp.text}")
        except Exception as e:
            results.add_fail("Goals: POST /goals/:id/contribute", str(e))
        
        # Test PUT /api/goals/:id
        try:
            update_data = {"goal_name": "Updated Phone"}
            resp = requests.put(f"{BASE_URL}/goals/{new_goal_id}", headers=headers, json=update_data)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("goal", {}).get("goal_name") == "Updated Phone":
                    results.add_pass("Goals: PUT /goals/:id updates goal")
                else:
                    results.add_fail("Goals: PUT /goals/:id", f"Update failed: {data}")
            else:
                results.add_fail("Goals: PUT /goals/:id", f"Status {resp.status_code}: {resp.text}")
        except Exception as e:
            results.add_fail("Goals: PUT /goals/:id", str(e))
        
        # Test DELETE /api/goals/:id
        try:
            resp = requests.delete(f"{BASE_URL}/goals/{new_goal_id}", headers=headers)
            if resp.status_code == 200:
                results.add_pass("Goals: DELETE /goals/:id removes goal")
            else:
                results.add_fail("Goals: DELETE /goals/:id", f"Status {resp.status_code}: {resp.text}")
        except Exception as e:
            results.add_fail("Goals: DELETE /goals/:id", str(e))

def test_financial_health(student_user):
    """Test financial health endpoint"""
    print("\n" + "="*80)
    print("TESTING FINANCIAL HEALTH")
    print("="*80)
    
    if not student_user:
        results.add_fail("Financial health: Skipped", "No student user available")
        return
    
    headers = {"Authorization": f"Bearer {student_user['id']}"}
    
    try:
        resp = requests.get(f"{BASE_URL}/financial-health", headers=headers)
        if resp.status_code == 200:
            data = resp.json()
            
            # Check required fields
            required_fields = ["score", "band", "breakdown", "checklist", "guard"]
            missing = [f for f in required_fields if f not in data]
            
            if not missing:
                # Validate score is 0-100
                if 0 <= data["score"] <= 100:
                    # Validate breakdown has 5 factors
                    if len(data["breakdown"]) == 5:
                        # Validate guard has canBorrow and reasons
                        guard = data.get("guard", {})
                        if "canBorrow" in guard and "reasons" in guard:
                            # Validate checklist
                            checklist = data.get("checklist", {})
                            if "emergency_fund_started" in checklist and "emi_burden_pct" in checklist:
                                results.add_pass("Financial health: GET /financial-health returns complete data")
                            else:
                                results.add_fail("Financial health: GET /financial-health", f"Incomplete checklist: {checklist}")
                        else:
                            results.add_fail("Financial health: GET /financial-health", f"Incomplete guard: {guard}")
                    else:
                        results.add_fail("Financial health: GET /financial-health", f"Breakdown should have 5 factors, got {len(data['breakdown'])}")
                else:
                    results.add_fail("Financial health: GET /financial-health", f"Invalid score: {data['score']}")
            else:
                results.add_fail("Financial health: GET /financial-health", f"Missing fields: {missing}")
        else:
            results.add_fail("Financial health: GET /financial-health", f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        results.add_fail("Financial health: GET /financial-health", str(e))

def test_before_you_borrow(student_user):
    """Test before you borrow endpoint"""
    print("\n" + "="*80)
    print("TESTING BEFORE YOU BORROW")
    print("="*80)
    
    if not student_user:
        results.add_fail("Before you borrow: Skipped", "No student user available")
        return
    
    headers = {"Authorization": f"Bearer {student_user['id']}"}
    
    # Get a goal first
    try:
        resp = requests.get(f"{BASE_URL}/goals", headers=headers)
        goals = resp.json().get("goals", [])
        goal_id = goals[0]["id"] if goals else None
    except:
        goal_id = None
    
    try:
        body = {"goalId": goal_id} if goal_id else {}
        resp = requests.post(f"{BASE_URL}/before-you-borrow", headers=headers, json=body)
        if resp.status_code == 200:
            data = resp.json()
            
            # Check required fields
            required_fields = ["guard", "options"]
            missing = [f for f in required_fields if f not in data]
            
            if not missing:
                # Validate options are ranked
                options = data.get("options", [])
                if len(options) >= 5:
                    # Check if options have required fields
                    first_option = options[0]
                    if all(k in first_option for k in ["rank", "option", "upfront", "monthly_impact", "benefit", "conditions", "next_action"]):
                        results.add_pass("Before you borrow: POST /before-you-borrow returns ranked options")
                    else:
                        results.add_fail("Before you borrow: POST /before-you-borrow", f"Option missing fields: {first_option}")
                else:
                    results.add_fail("Before you borrow: POST /before-you-borrow", f"Expected >=5 options, got {len(options)}")
            else:
                results.add_fail("Before you borrow: POST /before-you-borrow", f"Missing fields: {missing}")
        else:
            results.add_fail("Before you borrow: POST /before-you-borrow", f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        results.add_fail("Before you borrow: POST /before-you-borrow", str(e))

def test_insights(student_user):
    """Test AI insights endpoint"""
    print("\n" + "="*80)
    print("TESTING AI INSIGHTS")
    print("="*80)
    
    if not student_user:
        results.add_fail("AI insights: Skipped", "No student user available")
        return
    
    headers = {"Authorization": f"Bearer {student_user['id']}"}
    
    try:
        resp = requests.post(f"{BASE_URL}/insights/generate", headers=headers, json={})
        if resp.status_code == 200:
            data = resp.json()
            
            # Check required fields
            if "insight" in data and "source" in data:
                insight = data.get("insight", {})
                source = data.get("source")
                
                # Validate source is llm or fallback
                if source in ["llm", "fallback"]:
                    # Validate insight structure
                    required_insight_fields = ["insight", "suggested_action", "estimated_monthly_saving"]
                    missing = [f for f in required_insight_fields if f not in insight]
                    
                    if not missing:
                        results.add_pass(f"AI insights: POST /insights/generate returns insight (source={source})")
                    else:
                        results.add_fail("AI insights: POST /insights/generate", f"Missing insight fields: {missing}")
                else:
                    results.add_fail("AI insights: POST /insights/generate", f"Invalid source: {source}")
            else:
                results.add_fail("AI insights: POST /insights/generate", f"Missing insight or source: {data}")
        else:
            results.add_fail("AI insights: POST /insights/generate", f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        results.add_fail("AI insights: POST /insights/generate", str(e))

def test_schemes(student_user):
    """Test schemes endpoints"""
    print("\n" + "="*80)
    print("TESTING SCHEMES")
    print("="*80)
    
    if not student_user:
        results.add_fail("Schemes: Skipped", "No student user available")
        return
    
    headers = {"Authorization": f"Bearer {student_user['id']}"}
    
    # Test GET /api/schemes
    try:
        resp = requests.get(f"{BASE_URL}/schemes", headers=headers)
        if resp.status_code == 200:
            data = resp.json()
            schemes = data.get("schemes", [])
            if len(schemes) >= 10:
                results.add_pass(f"Schemes: GET /schemes returns {len(schemes)} schemes")
            else:
                results.add_fail("Schemes: GET /schemes", f"Expected >=10 schemes, got {len(schemes)}")
        else:
            results.add_fail("Schemes: GET /schemes", f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        results.add_fail("Schemes: GET /schemes", str(e))
    
    # Test GET /api/schemes/match
    try:
        resp = requests.get(f"{BASE_URL}/schemes/match", headers=headers)
        if resp.status_code == 200:
            data = resp.json()
            matches = data.get("matches", [])
            if len(matches) > 0:
                # Check first match has required fields
                first_match = matches[0]
                if "eligibility_status" in first_match:
                    if first_match["eligibility_status"] == "Potentially relevant":
                        results.add_pass("Schemes: GET /schemes/match returns matches with eligibility_status")
                    else:
                        results.add_warning("Schemes: GET /schemes/match", f"Unexpected eligibility_status: {first_match['eligibility_status']}")
                else:
                    results.add_fail("Schemes: GET /schemes/match", "Missing eligibility_status")
            else:
                results.add_warning("Schemes: GET /schemes/match", "No matches returned (may be expected)")
        else:
            results.add_fail("Schemes: GET /schemes/match", f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        results.add_fail("Schemes: GET /schemes/match", str(e))

def test_my_data(email_user):
    """Test my data export and delete"""
    print("\n" + "="*80)
    print("TESTING MY DATA")
    print("="*80)
    
    if not email_user:
        results.add_fail("My data: Skipped", "No email user available")
        return
    
    headers = {"Authorization": f"Bearer {email_user['id']}"}
    
    # Test GET /api/my-data/export
    try:
        resp = requests.get(f"{BASE_URL}/my-data/export", headers=headers)
        if resp.status_code == 200:
            data = resp.json()
            export = data.get("export", {})
            
            # Check required fields
            required_fields = ["user", "profile", "receipts", "goals"]
            missing = [f for f in required_fields if f not in export]
            
            if not missing:
                results.add_pass("My data: GET /my-data/export returns complete export")
            else:
                results.add_fail("My data: GET /my-data/export", f"Missing fields: {missing}")
        else:
            results.add_fail("My data: GET /my-data/export", f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        results.add_fail("My data: GET /my-data/export", str(e))
    
    # Test POST /api/my-data/delete
    try:
        resp = requests.post(f"{BASE_URL}/my-data/delete", headers=headers, json={})
        if resp.status_code == 200:
            data = resp.json()
            if data.get("ok") == True:
                # Verify data is deleted - dashboard should fail
                resp2 = requests.get(f"{BASE_URL}/dashboard", headers=headers)
                if resp2.status_code in [400, 403]:
                    # Verify receipts are empty
                    resp3 = requests.get(f"{BASE_URL}/receipts", headers=headers)
                    if resp3.status_code == 200:
                        receipts = resp3.json().get("receipts", [])
                        if len(receipts) == 0:
                            results.add_pass("My data: POST /my-data/delete removes all data")
                        else:
                            results.add_fail("My data: POST /my-data/delete", f"Receipts not deleted: {len(receipts)} remaining")
                    else:
                        results.add_fail("My data: POST /my-data/delete", f"Receipts check failed: {resp3.status_code}")
                else:
                    results.add_fail("My data: POST /my-data/delete", f"Dashboard still accessible: {resp2.status_code}")
            else:
                results.add_fail("My data: POST /my-data/delete", f"Invalid response: {data}")
        else:
            results.add_fail("My data: POST /my-data/delete", f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        results.add_fail("My data: POST /my-data/delete", str(e))

def main():
    print("="*80)
    print("RupeeRizz Backend API Test Suite")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Started at: {datetime.now().isoformat()}")
    
    # Run all tests
    student_user, entrepreneur_user, email_user = test_auth()
    test_consent_gating(email_user)
    test_profile(email_user)
    test_ocr(email_user)
    test_receipts(email_user)
    test_user_isolation(student_user, entrepreneur_user)
    test_dashboard(student_user)
    test_goals(student_user)
    test_financial_health(student_user)
    test_before_you_borrow(student_user)
    test_insights(student_user)
    test_schemes(student_user)
    test_my_data(email_user)
    
    # Print summary
    success = results.summary()
    
    print(f"\nCompleted at: {datetime.now().isoformat()}")
    
    return 0 if success else 1

if __name__ == "__main__":
    exit(main())
