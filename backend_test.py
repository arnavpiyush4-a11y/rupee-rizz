#!/usr/bin/env python3
"""
RupeeRizz Backend API Test Suite - Supabase Auth Model
Tests all backend endpoints with real Supabase JWT authentication
"""
import os
import sys
import json
import requests
import base64
from io import BytesIO
from PIL import Image, ImageDraw, ImageFont

# Load environment variables
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://rupeerizz-preview.preview.emergentagent.com')
SUPABASE_URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL', 'https://ipetunytunmyfdqpojnr.supabase.co')
SUPABASE_KEY = os.getenv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_sG4rejJ6sI_kZZdE5DK1CQ_s3Iqiune')

# Test users
USER_A = {'email': 'arnavpiyush7@gmail.com', 'password': 'arnav@21'}
USER_B = {'email': 'architgupta485@gmail.com', 'password': 'archit@21'}

def get_supabase_jwt(email, password):
    """Get Supabase JWT token via password grant"""
    url = f"{SUPABASE_URL}/auth/v1/token?grant_type=password"
    headers = {
        'apikey': SUPABASE_KEY,
        'Content-Type': 'application/json'
    }
    body = {'email': email, 'password': password}
    
    try:
        response = requests.post(url, headers=headers, json=body, timeout=10)
        if response.status_code == 200:
            data = response.json()
            return data.get('access_token')
        else:
            print(f"❌ Failed to get JWT for {email}: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"❌ Exception getting JWT for {email}: {str(e)}")
        return None

def create_receipt_image():
    """Create a small receipt-like PNG image"""
    img = Image.new('RGB', (400, 600), color='white')
    draw = ImageDraw.Draw(img)
    
    # Draw receipt content
    y = 20
    lines = [
        "FRESH MART GROCERY",
        "123 Main Street, Mumbai",
        "Tel: 022-12345678",
        "================================",
        "Date: 2025-06-20",
        "Receipt #: 12345",
        "================================",
        "Milk (1L)           Rs  65.00",
        "Bread               Rs  40.00",
        "Eggs (12)           Rs 120.00",
        "Rice (1kg)          Rs 180.00",
        "================================",
        "TOTAL:              Rs 405.00",
        "================================",
        "Thank you for shopping!",
    ]
    
    for line in lines:
        draw.text((20, y), line, fill='black')
        y += 30
    
    # Convert to base64 data URL
    buffer = BytesIO()
    img.save(buffer, format='PNG')
    img_bytes = buffer.getvalue()
    b64 = base64.b64encode(img_bytes).decode('utf-8')
    return f"data:image/png;base64,{b64}"

def test_auth_protected(token_a):
    """Test 1: Auth and protected routes"""
    print("\n=== TEST 1: Auth and Protected Routes ===")
    
    # Test 1a: No auth header -> 401
    print("1a. Testing GET /api/me without auth...")
    response = requests.get(f"{BASE_URL}/api/me", timeout=10)
    if response.status_code == 401:
        data = response.json()
        if data.get('code') == 'no_auth':
            print("✅ No auth -> 401 no_auth")
        else:
            print(f"❌ Expected code 'no_auth', got: {data.get('code')}")
    else:
        print(f"❌ Expected 401, got: {response.status_code}")
    
    # Test 1b: Invalid token -> 401
    print("1b. Testing GET /api/me with invalid token...")
    headers = {'Authorization': 'Bearer invalid_token_12345'}
    response = requests.get(f"{BASE_URL}/api/me", headers=headers, timeout=10)
    if response.status_code == 401:
        data = response.json()
        if data.get('code') == 'no_auth':
            print("✅ Invalid token -> 401 no_auth")
        else:
            print(f"❌ Expected code 'no_auth', got: {data.get('code')}")
    else:
        print(f"❌ Expected 401, got: {response.status_code}")
    
    # Test 1c: Valid token -> 200 with user data
    print("1c. Testing GET /api/me with valid token...")
    headers = {'Authorization': f'Bearer {token_a}'}
    response = requests.get(f"{BASE_URL}/api/me", headers=headers, timeout=10)
    if response.status_code == 200:
        data = response.json()
        if 'user' in data and 'id' in data['user'] and 'email' in data['user']:
            print(f"✅ Valid token -> 200 with user data (email: {data['user']['email']})")
            return True
        else:
            print(f"❌ Response missing user data: {data}")
            return False
    else:
        print(f"❌ Expected 200, got: {response.status_code} - {response.text}")
        return False

def test_consent_gating(token_a):
    """Test 2: Consent gating before consent is recorded"""
    print("\n=== TEST 2: Consent Gating (Before Consent) ===")
    
    headers = {'Authorization': f'Bearer {token_a}', 'Content-Type': 'application/json'}
    
    # First, check if consent already exists and withdraw it
    print("2a. Checking existing consent...")
    response = requests.get(f"{BASE_URL}/api/consent", headers=headers, timeout=10)
    if response.status_code == 200:
        data = response.json()
        if data.get('active'):
            print("   Withdrawing existing consent...")
            requests.post(f"{BASE_URL}/api/consent/withdraw", headers=headers, timeout=10)
    
    # Test protected routes without consent
    protected_routes = [
        ('GET', '/api/dashboard', None),
        ('POST', '/api/ocr/receipt', {'image': 'data:image/png;base64,test'}),
        ('POST', '/api/receipts', {'merchant': 'Test', 'total': 100}),
        ('POST', '/api/insights/generate', {}),
        ('POST', '/api/before-you-borrow', {}),
        ('GET', '/api/readiness-report', None),
        ('GET', '/api/financial-health', None),
    ]
    
    all_gated = True
    for method, route, body in protected_routes:
        print(f"2b. Testing {method} {route} without consent...")
        if method == 'GET':
            response = requests.get(f"{BASE_URL}{route}", headers=headers, timeout=10)
        else:
            response = requests.post(f"{BASE_URL}{route}", headers=headers, json=body, timeout=10)
        
        if response.status_code == 403:
            data = response.json()
            if data.get('code') == 'consent_required':
                print(f"   ✅ {route} -> 403 consent_required")
            else:
                print(f"   ❌ Expected code 'consent_required', got: {data.get('code')}")
                all_gated = False
        else:
            print(f"   ❌ Expected 403, got: {response.status_code} - {response.text}")
            all_gated = False
    
    # Test 2c: Record consent
    print("2c. Recording consent with POST /api/consent...")
    response = requests.post(f"{BASE_URL}/api/consent", headers=headers, timeout=10)
    if response.status_code == 200:
        data = response.json()
        if data.get('active') == True:
            print("   ✅ POST /api/consent -> active=true")
        else:
            print(f"   ❌ Expected active=true, got: {data}")
            return False
    else:
        print(f"   ❌ Expected 200, got: {response.status_code} - {response.text}")
        return False
    
    # Test 2d: Verify consent in GET /api/me
    print("2d. Verifying consent in GET /api/me...")
    response = requests.get(f"{BASE_URL}/api/me", headers=headers, timeout=10)
    if response.status_code == 200:
        data = response.json()
        if data.get('consent', {}).get('active') == True:
            print("   ✅ GET /api/me shows consent.active=true")
            return all_gated
        else:
            print(f"   ❌ Expected consent.active=true, got: {data.get('consent')}")
            return False
    else:
        print(f"   ❌ Expected 200, got: {response.status_code}")
        return False

def test_profile(token_a):
    """Test 3: Profile onboarding"""
    print("\n=== TEST 3: Profile Onboarding ===")
    
    headers = {'Authorization': f'Bearer {token_a}', 'Content-Type': 'application/json'}
    
    # Test 3a: POST profile with valid user_type
    print("3a. Testing POST /api/profile with user_type='student'...")
    profile_data = {
        'full_name': 'Arnav Test User',
        'user_type': 'student',
        'state': 'Maharashtra',
        'finance': {
            'reliable_monthly_income': 15000,
            'essential_expenses': 8000,
            'non_essential_expenses': 3000,
            'compulsory_emi': 1000,
            'business_operating_costs': 0,
            'emergency_fund_amount': 5000
        },
        'initial_goal': {
            'goal_name': 'Laptop Fund',
            'goal_amount': 50000,
            'current_saved_amount': 5000,
            'target_date': '2025-12-31'
        }
    }
    
    response = requests.post(f"{BASE_URL}/api/profile", headers=headers, json=profile_data, timeout=10)
    if response.status_code == 200:
        data = response.json()
        if data.get('profile', {}).get('user_type') == 'student':
            print("   ✅ POST /api/profile -> profile created with user_type='student'")
        else:
            print(f"   ❌ Expected user_type='student', got: {data.get('profile', {}).get('user_type')}")
            return False
    else:
        print(f"   ❌ Expected 200, got: {response.status_code} - {response.text}")
        return False
    
    # Test 3b: GET profile
    print("3b. Testing GET /api/profile...")
    response = requests.get(f"{BASE_URL}/api/profile", headers=headers, timeout=10)
    if response.status_code == 200:
        data = response.json()
        if data.get('profile', {}).get('user_type') == 'student':
            print("   ✅ GET /api/profile -> returns profile")
            return True
        else:
            print(f"   ❌ Profile data incorrect: {data}")
            return False
    else:
        print(f"   ❌ Expected 200, got: {response.status_code}")
        return False

def test_receipts_storage(token_a):
    """Test 4: Receipts CRUD + Storage + Masking"""
    print("\n=== TEST 4: Receipts CRUD + Storage + Masking ===")
    
    headers = {'Authorization': f'Bearer {token_a}', 'Content-Type': 'application/json'}
    
    # Test 4a: POST receipt with phone number in merchant
    print("4a. Testing POST /api/receipts with phone number in merchant...")
    receipt_image = create_receipt_image()
    receipt_data = {
        'merchant': 'Store Call 9876543210',
        'receipt_date': '2025-06-20',
        'currency': 'INR',
        'total': 405,
        'category': 'Food & Drinks',
        'image': receipt_image,
        'items': [
            {'item_name': 'Milk', 'price': 65, 'category': 'Food & Drinks'},
            {'item_name': 'Bread', 'price': 40, 'category': 'Food & Drinks'},
        ]
    }
    
    response = requests.post(f"{BASE_URL}/api/receipts", headers=headers, json=receipt_data, timeout=15)
    if response.status_code == 200:
        data = response.json()
        receipt_id = data.get('receipt', {}).get('id')
        merchant = data.get('receipt', {}).get('merchant')
        sensitive_masked = data.get('sensitive_masked', [])
        
        if 'masked' in merchant.lower() and 'phone' in sensitive_masked:
            print(f"   ✅ POST /api/receipts -> phone masked (merchant: {merchant}, sensitive_masked: {sensitive_masked})")
        else:
            print(f"   ❌ Phone not masked properly. merchant: {merchant}, sensitive_masked: {sensitive_masked}")
            return False, None
    else:
        print(f"   ❌ Expected 200, got: {response.status_code} - {response.text}")
        return False, None
    
    # Test 4b: GET receipts list
    print("4b. Testing GET /api/receipts...")
    response = requests.get(f"{BASE_URL}/api/receipts", headers=headers, timeout=10)
    if response.status_code == 200:
        data = response.json()
        if len(data.get('receipts', [])) > 0:
            print(f"   ✅ GET /api/receipts -> returns {len(data['receipts'])} receipts")
        else:
            print("   ❌ No receipts returned")
            return False, None
    else:
        print(f"   ❌ Expected 200, got: {response.status_code}")
        return False, None
    
    # Test 4c: GET single receipt
    print(f"4c. Testing GET /api/receipts/{receipt_id}...")
    response = requests.get(f"{BASE_URL}/api/receipts/{receipt_id}", headers=headers, timeout=10)
    if response.status_code == 200:
        data = response.json()
        if data.get('receipt', {}).get('id') == receipt_id:
            print(f"   ✅ GET /api/receipts/{receipt_id} -> returns receipt")
        else:
            print(f"   ❌ Receipt ID mismatch")
            return False, receipt_id
    else:
        print(f"   ❌ Expected 200, got: {response.status_code}")
        return False, receipt_id
    
    # Test 4d: GET receipt image (signed URL)
    print(f"4d. Testing GET /api/receipts/{receipt_id}/image...")
    response = requests.get(f"{BASE_URL}/api/receipts/{receipt_id}/image", headers=headers, timeout=10)
    if response.status_code == 200:
        data = response.json()
        if 'url' in data and 'supabase' in data['url']:
            print(f"   ✅ GET /api/receipts/{receipt_id}/image -> returns signed URL")
        else:
            print(f"   ❌ No signed URL in response: {data}")
            return False, receipt_id
    else:
        print(f"   ❌ Expected 200, got: {response.status_code}")
        return False, receipt_id
    
    # Test 4e: PUT update receipt
    print(f"4e. Testing PUT /api/receipts/{receipt_id}...")
    update_data = {
        'merchant': 'Updated Store',
        'total': 500,
        'category': 'Shopping',
        'items': []
    }
    response = requests.put(f"{BASE_URL}/api/receipts/{receipt_id}", headers=headers, json=update_data, timeout=10)
    if response.status_code == 200:
        data = response.json()
        if data.get('receipt', {}).get('merchant') == 'Updated Store':
            print(f"   ✅ PUT /api/receipts/{receipt_id} -> receipt updated")
        else:
            print(f"   ❌ Receipt not updated properly: {data}")
            return False, receipt_id
    else:
        print(f"   ❌ Expected 200, got: {response.status_code}")
        return False, receipt_id
    
    # Test 4f: DELETE receipt
    print(f"4f. Testing DELETE /api/receipts/{receipt_id}...")
    response = requests.delete(f"{BASE_URL}/api/receipts/{receipt_id}", headers=headers, timeout=10)
    if response.status_code == 200:
        print(f"   ✅ DELETE /api/receipts/{receipt_id} -> receipt deleted")
        
        # Verify deletion
        response = requests.get(f"{BASE_URL}/api/receipts/{receipt_id}", headers=headers, timeout=10)
        if response.status_code == 404:
            print(f"   ✅ Verified: GET /api/receipts/{receipt_id} -> 404")
            return True, receipt_id
        else:
            print(f"   ❌ Receipt still exists after deletion")
            return False, receipt_id
    else:
        print(f"   ❌ Expected 200, got: {response.status_code}")
        return False, receipt_id

def test_ocr(token_a):
    """Test 5: OCR validation and processing"""
    print("\n=== TEST 5: OCR Validation and Processing ===")
    
    headers = {'Authorization': f'Bearer {token_a}', 'Content-Type': 'application/json'}
    
    # Test 5a: Missing image -> 400 bad_image
    print("5a. Testing POST /api/ocr/receipt without image...")
    response = requests.post(f"{BASE_URL}/api/ocr/receipt", headers=headers, json={}, timeout=10)
    if response.status_code == 400:
        data = response.json()
        if data.get('code') == 'bad_image':
            print("   ✅ Missing image -> 400 bad_image")
        else:
            print(f"   ❌ Expected code 'bad_image', got: {data.get('code')}")
            return False
    else:
        print(f"   ❌ Expected 400, got: {response.status_code}")
        return False
    
    # Test 5b: Invalid mime type -> 400 bad_mime
    print("5b. Testing POST /api/ocr/receipt with text/plain data URL...")
    response = requests.post(f"{BASE_URL}/api/ocr/receipt", headers=headers, 
                           json={'image': 'data:text/plain;base64,dGVzdA=='}, timeout=10)
    if response.status_code == 400:
        data = response.json()
        if data.get('code') == 'bad_mime':
            print("   ✅ Invalid mime -> 400 bad_mime")
        else:
            print(f"   ❌ Expected code 'bad_mime', got: {data.get('code')}")
            return False
    else:
        print(f"   ❌ Expected 400, got: {response.status_code}")
        return False
    
    # Test 5c: Valid PNG -> 200 with extraction
    print("5c. Testing POST /api/ocr/receipt with valid PNG...")
    receipt_image = create_receipt_image()
    response = requests.post(f"{BASE_URL}/api/ocr/receipt", headers=headers, 
                           json={'image': receipt_image}, timeout=30)
    if response.status_code == 200:
        data = response.json()
        extraction = data.get('extraction', {})
        mode = data.get('mode')
        
        if mode in ['live', 'demo', 'demo_fallback'] and 'merchant' in extraction:
            print(f"   ✅ Valid PNG -> 200 with extraction (mode: {mode})")
            return True
        else:
            print(f"   ❌ Invalid extraction or mode: {data}")
            return False
    else:
        print(f"   ❌ Expected 200, got: {response.status_code} - {response.text}")
        return False

def test_goals(token_a):
    """Test 6: Goals CRUD and contributions"""
    print("\n=== TEST 6: Goals CRUD and Contributions ===")
    
    headers = {'Authorization': f'Bearer {token_a}', 'Content-Type': 'application/json'}
    
    # Test 6a: GET goals list
    print("6a. Testing GET /api/goals...")
    response = requests.get(f"{BASE_URL}/api/goals", headers=headers, timeout=10)
    if response.status_code == 200:
        data = response.json()
        print(f"   ✅ GET /api/goals -> returns {len(data.get('goals', []))} goals")
    else:
        print(f"   ❌ Expected 200, got: {response.status_code}")
        return False, None
    
    # Test 6b: POST create goal
    print("6b. Testing POST /api/goals...")
    goal_data = {
        'goal_name': 'Emergency Fund',
        'goal_amount': 30000,
        'current_saved_amount': 5000,
        'target_date': '2025-12-31'
    }
    response = requests.post(f"{BASE_URL}/api/goals", headers=headers, json=goal_data, timeout=10)
    if response.status_code == 200:
        data = response.json()
        goal_id = data.get('goal', {}).get('id')
        print(f"   ✅ POST /api/goals -> goal created (id: {goal_id})")
    else:
        print(f"   ❌ Expected 200, got: {response.status_code}")
        return False, None
    
    # Test 6c: POST contribute to goal
    print(f"6c. Testing POST /api/goals/{goal_id}/contribute...")
    contribute_data = {'amount': 500, 'note': 'Monthly savings'}
    response = requests.post(f"{BASE_URL}/api/goals/{goal_id}/contribute", 
                           headers=headers, json=contribute_data, timeout=10)
    if response.status_code == 200:
        data = response.json()
        new_saved = data.get('goal', {}).get('current_saved_amount')
        if new_saved == 5500:
            print(f"   ✅ POST /api/goals/{goal_id}/contribute -> amount incremented (5000 + 500 = 5500)")
        else:
            print(f"   ❌ Expected 5500, got: {new_saved}")
            return False, goal_id
    else:
        print(f"   ❌ Expected 200, got: {response.status_code}")
        return False, goal_id
    
    # Test 6d: PUT update goal
    print(f"6d. Testing PUT /api/goals/{goal_id}...")
    update_data = {'goal_name': 'Updated Emergency Fund', 'goal_amount': 35000}
    response = requests.put(f"{BASE_URL}/api/goals/{goal_id}", headers=headers, json=update_data, timeout=10)
    if response.status_code == 200:
        data = response.json()
        if data.get('goal', {}).get('goal_name') == 'Updated Emergency Fund':
            print(f"   ✅ PUT /api/goals/{goal_id} -> goal updated")
        else:
            print(f"   ❌ Goal not updated properly")
            return False, goal_id
    else:
        print(f"   ❌ Expected 200, got: {response.status_code}")
        return False, goal_id
    
    # Test 6e: DELETE goal
    print(f"6e. Testing DELETE /api/goals/{goal_id}...")
    response = requests.delete(f"{BASE_URL}/api/goals/{goal_id}", headers=headers, timeout=10)
    if response.status_code == 200:
        print(f"   ✅ DELETE /api/goals/{goal_id} -> goal deleted")
        return True, goal_id
    else:
        print(f"   ❌ Expected 200, got: {response.status_code}")
        return False, goal_id

def test_dashboard_health_byb_insights_report(token_a):
    """Test 7: Dashboard, Health, BYB, Insights, Report"""
    print("\n=== TEST 7: Dashboard, Health, BYB, Insights, Report ===")
    
    headers = {'Authorization': f'Bearer {token_a}', 'Content-Type': 'application/json'}
    
    # Test 7a: GET dashboard
    print("7a. Testing GET /api/dashboard...")
    response = requests.get(f"{BASE_URL}/api/dashboard", headers=headers, timeout=10)
    if response.status_code == 200:
        data = response.json()
        dashboard = data.get('dashboard', {})
        if 'snapshot' in dashboard and 'health' in dashboard and 'goals' in dashboard:
            print("   ✅ GET /api/dashboard -> returns complete dashboard")
        else:
            print(f"   ❌ Dashboard missing required fields: {list(dashboard.keys())}")
            return False
    else:
        print(f"   ❌ Expected 200, got: {response.status_code} - {response.text}")
        return False
    
    # Test 7b: GET financial-health
    print("7b. Testing GET /api/financial-health...")
    response = requests.get(f"{BASE_URL}/api/financial-health", headers=headers, timeout=10)
    if response.status_code == 200:
        data = response.json()
        if 'score' in data and 'band' in data and 'breakdown' in data and 'checklist' in data and 'guard' in data:
            print(f"   ✅ GET /api/financial-health -> returns health data (score: {data['score']})")
        else:
            print(f"   ❌ Health data missing required fields: {list(data.keys())}")
            return False
    else:
        print(f"   ❌ Expected 200, got: {response.status_code}")
        return False
    
    # Test 7c: POST before-you-borrow
    print("7c. Testing POST /api/before-you-borrow...")
    response = requests.post(f"{BASE_URL}/api/before-you-borrow", headers=headers, 
                           json={'amount': 10000}, timeout=10)
    if response.status_code == 200:
        data = response.json()
        if 'guard' in data and 'options' in data and len(data['options']) >= 5:
            print(f"   ✅ POST /api/before-you-borrow -> returns guard and {len(data['options'])} options")
        else:
            print(f"   ❌ BYB data missing required fields or insufficient options")
            return False
    else:
        print(f"   ❌ Expected 200, got: {response.status_code}")
        return False
    
    # Test 7d: POST insights/generate
    print("7d. Testing POST /api/insights/generate...")
    response = requests.post(f"{BASE_URL}/api/insights/generate", headers=headers, json={}, timeout=15)
    if response.status_code == 200:
        data = response.json()
        if 'insight' in data and 'source' in data:
            print(f"   ✅ POST /api/insights/generate -> returns insight (source: {data['source']})")
        else:
            print(f"   ❌ Insight data missing required fields")
            return False
    else:
        print(f"   ❌ Expected 200, got: {response.status_code}")
        return False
    
    # Test 7e: GET readiness-report
    print("7e. Testing GET /api/readiness-report...")
    response = requests.get(f"{BASE_URL}/api/readiness-report", headers=headers, timeout=10)
    if response.status_code == 200:
        data = response.json()
        report = data.get('report', {})
        if 'score' in report and 'band' in report and 'breakdown' in report and 'snapshot' in report:
            print(f"   ✅ GET /api/readiness-report -> returns complete report (score: {report['score']})")
            return True
        else:
            print(f"   ❌ Report missing required fields")
            return False
    else:
        print(f"   ❌ Expected 200, got: {response.status_code}")
        return False

def test_schemes(token_a):
    """Test 8: Schemes (public and match)"""
    print("\n=== TEST 8: Schemes ===")
    
    # Test 8a: GET schemes (public, no auth)
    print("8a. Testing GET /api/schemes (public, no auth)...")
    response = requests.get(f"{BASE_URL}/api/schemes", timeout=10)
    if response.status_code == 200:
        data = response.json()
        schemes = data.get('schemes', [])
        if len(schemes) > 0:
            print(f"   ✅ GET /api/schemes -> returns {len(schemes)} schemes")
        else:
            print("   ❌ No schemes returned")
            return False
    else:
        print(f"   ❌ Expected 200, got: {response.status_code}")
        return False
    
    # Test 8b: GET schemes/match (authenticated)
    print("8b. Testing GET /api/schemes/match (authenticated)...")
    headers = {'Authorization': f'Bearer {token_a}'}
    response = requests.get(f"{BASE_URL}/api/schemes/match", headers=headers, timeout=10)
    if response.status_code == 200:
        data = response.json()
        matches = data.get('matches', [])
        print(f"   ✅ GET /api/schemes/match -> returns {len(matches)} matches")
        return True
    else:
        print(f"   ❌ Expected 200, got: {response.status_code}")
        return False

def test_rls_isolation(token_a, token_b):
    """Test 9: RLS isolation between users"""
    print("\n=== TEST 9: RLS Isolation (Two Users) ===")
    
    headers_a = {'Authorization': f'Bearer {token_a}', 'Content-Type': 'application/json'}
    headers_b = {'Authorization': f'Bearer {token_b}', 'Content-Type': 'application/json'}
    
    # User A creates a receipt
    print("9a. User A creating a receipt...")
    receipt_data = {
        'merchant': 'User A Store',
        'receipt_date': '2025-06-20',
        'total': 100,
        'category': 'Shopping',
        'items': []
    }
    response = requests.post(f"{BASE_URL}/api/receipts", headers=headers_a, json=receipt_data, timeout=10)
    if response.status_code == 200:
        data = response.json()
        receipt_id_a = data.get('receipt', {}).get('id')
        print(f"   ✅ User A created receipt (id: {receipt_id_a})")
    else:
        print(f"   ❌ Failed to create receipt for User A: {response.status_code}")
        return False
    
    # User B tries to access User A's receipt by ID
    print(f"9b. User B trying to access User A's receipt (id: {receipt_id_a})...")
    response = requests.get(f"{BASE_URL}/api/receipts/{receipt_id_a}", headers=headers_b, timeout=10)
    if response.status_code == 404:
        print("   ✅ User B cannot access User A's receipt -> 404")
    else:
        print(f"   ❌ Expected 404, got: {response.status_code} (RLS violation!)")
        return False
    
    # User B gets their receipts list (should not include User A's receipt)
    print("9c. User B getting their receipts list...")
    response = requests.get(f"{BASE_URL}/api/receipts", headers=headers_b, timeout=10)
    if response.status_code == 200:
        data = response.json()
        receipts_b = data.get('receipts', [])
        receipt_ids_b = [r['id'] for r in receipts_b]
        
        if receipt_id_a not in receipt_ids_b:
            print(f"   ✅ User B's receipts list excludes User A's receipt (User B has {len(receipts_b)} receipts)")
            return True
        else:
            print(f"   ❌ User B's receipts list includes User A's receipt (RLS violation!)")
            return False
    else:
        print(f"   ❌ Expected 200, got: {response.status_code}")
        return False

def test_my_data(token_a):
    """Test 10: My Data export (non-destructive)"""
    print("\n=== TEST 10: My Data Export ===")
    
    headers = {'Authorization': f'Bearer {token_a}'}
    
    # Test 10a: GET my-data/export
    print("10a. Testing GET /api/my-data/export...")
    response = requests.get(f"{BASE_URL}/api/my-data/export", headers=headers, timeout=10)
    if response.status_code == 200:
        data = response.json()
        export_data = data.get('export', {})
        if 'user' in export_data and 'profile' in export_data and 'receipts' in export_data:
            print(f"   ✅ GET /api/my-data/export -> returns complete export")
            return True
        else:
            print(f"   ❌ Export missing required fields: {list(export_data.keys())}")
            return False
    else:
        print(f"   ❌ Expected 200, got: {response.status_code}")
        return False

def test_my_data_delete(token_b):
    """Test 10b: My Data delete (DESTRUCTIVE - only on User B)"""
    print("\n=== TEST 10b: My Data Delete (User B ONLY) ===")
    
    headers = {'Authorization': f'Bearer {token_b}', 'Content-Type': 'application/json'}
    
    print("10b. Testing POST /api/my-data/delete (User B)...")
    response = requests.post(f"{BASE_URL}/api/my-data/delete", headers=headers, timeout=10)
    if response.status_code == 200:
        data = response.json()
        if data.get('ok') == True:
            print("   ✅ POST /api/my-data/delete -> data deleted")
            
            # Verify deletion by checking dashboard (should fail without profile/consent)
            print("   Verifying deletion...")
            response = requests.get(f"{BASE_URL}/api/dashboard", headers=headers, timeout=10)
            if response.status_code in [400, 403]:
                print(f"   ✅ Verified: GET /api/dashboard -> {response.status_code} (profile/consent gone)")
                return True
            else:
                print(f"   ❌ Dashboard still accessible after deletion: {response.status_code}")
                return False
        else:
            print(f"   ❌ Delete response not ok: {data}")
            return False
    else:
        print(f"   ❌ Expected 200, got: {response.status_code}")
        return False

def main():
    """Run all backend tests"""
    print("=" * 70)
    print("RupeeRizz Backend API Test Suite - Supabase Auth Model")
    print("=" * 70)
    
    # Get JWT tokens for both users
    print("\n=== Getting Supabase JWT Tokens ===")
    print(f"User A: {USER_A['email']}")
    token_a = get_supabase_jwt(USER_A['email'], USER_A['password'])
    if not token_a:
        print("❌ FATAL: Failed to get JWT for User A")
        sys.exit(1)
    print(f"✅ User A token obtained (length: {len(token_a)})")
    
    print(f"\nUser B: {USER_B['email']}")
    token_b = get_supabase_jwt(USER_B['email'], USER_B['password'])
    if not token_b:
        print("❌ FATAL: Failed to get JWT for User B")
        sys.exit(1)
    print(f"✅ User B token obtained (length: {len(token_b)})")
    
    # Run all tests
    results = {}
    
    results['auth_protected'] = test_auth_protected(token_a)
    results['consent_gating'] = test_consent_gating(token_a)
    results['profile'] = test_profile(token_a)
    results['receipts_storage'], _ = test_receipts_storage(token_a)
    results['ocr'] = test_ocr(token_a)
    results['goals'], _ = test_goals(token_a)
    results['dashboard_health_byb_insights_report'] = test_dashboard_health_byb_insights_report(token_a)
    results['schemes'] = test_schemes(token_a)
    results['rls_isolation'] = test_rls_isolation(token_a, token_b)
    results['my_data_export'] = test_my_data(token_a)
    results['my_data_delete'] = test_my_data_delete(token_b)
    
    # Print summary
    print("\n" + "=" * 70)
    print("TEST SUMMARY")
    print("=" * 70)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} - {test_name}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED!")
        sys.exit(0)
    else:
        print(f"\n❌ {total - passed} test(s) failed")
        sys.exit(1)

if __name__ == '__main__':
    main()
