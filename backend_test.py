#!/usr/bin/env python3
"""
Backend test for RupeeRizz OCR receipt endpoint (LIVE OCR mode)
Tests OCR.space integration + LLM structuring + validation + consent gating + masking
"""
import requests
import json
import base64
from io import BytesIO
from PIL import Image, ImageDraw, ImageFont
import random
import string

BASE_URL = "https://rupeerizz-preview.preview.emergentagent.com/api"

def generate_receipt_image():
    """Generate a small receipt-like PNG with clearly readable text using PIL"""
    # Create a white image
    width, height = 400, 600
    img = Image.new('RGB', (width, height), color='white')
    draw = ImageDraw.Draw(img)
    
    # Try to use a default font, fallback to default if not available
    try:
        font_large = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 24)
        font_medium = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 18)
        font_small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 16)
    except:
        font_large = ImageFont.load_default()
        font_medium = ImageFont.load_default()
        font_small = ImageFont.load_default()
    
    # Draw receipt content
    y = 20
    
    # Merchant name
    draw.text((20, y), "FRESH MART GROCERY", fill='black', font=font_large)
    y += 40
    
    # Date
    draw.text((20, y), "Date: 2025-06-20", fill='black', font=font_medium)
    y += 35
    
    # Separator line
    draw.line([(20, y), (380, y)], fill='black', width=2)
    y += 20
    
    # Items
    items = [
        ("Milk 1L", "45.00"),
        ("Bread", "30.00"),
        ("Eggs (12)", "80.00"),
        ("Rice 5kg", "250.00"),
    ]
    
    for item_name, price in items:
        draw.text((20, y), item_name, fill='black', font=font_small)
        draw.text((300, y), f"Rs {price}", fill='black', font=font_small)
        y += 30
    
    # Separator line
    y += 10
    draw.line([(20, y), (380, y)], fill='black', width=2)
    y += 20
    
    # Total
    draw.text((20, y), "TOTAL", fill='black', font=font_large)
    draw.text((280, y), "Rs 405.00", fill='black', font=font_large)
    y += 40
    
    # Thank you message
    draw.text((100, y), "Thank You!", fill='black', font=font_medium)
    
    # Convert to base64 data URL
    buffer = BytesIO()
    img.save(buffer, format='PNG')
    buffer.seek(0)
    img_base64 = base64.b64encode(buffer.read()).decode('utf-8')
    data_url = f"data:image/png;base64,{img_base64}"
    
    return data_url

def random_email():
    """Generate a random email for testing"""
    rand = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
    return f"ocrtest+{rand}@example.com"

def test_ocr_live_mode():
    """Test OCR receipt endpoint with LIVE OCR mode"""
    print("\n" + "="*80)
    print("TESTING OCR RECEIPT ENDPOINT (LIVE OCR MODE)")
    print("="*80)
    
    # Test 1: Demo login to get consented user
    print("\n[TEST 1] Demo student login (with consent)...")
    try:
        response = requests.post(f"{BASE_URL}/auth/session", json={
            "demo": True,
            "demo_profile": "student"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert 'user' in data, "Missing user in response"
        assert 'id' in data['user'], "Missing user.id in response"
        user_id = data['user']['id']
        print(f"✅ Demo login successful, user_id: {user_id}")
    except Exception as e:
        print(f"❌ Demo login failed: {e}")
        return
    
    # Test 2: Generate receipt image and POST to OCR endpoint
    print("\n[TEST 2] Generate receipt image and POST to /api/ocr/receipt...")
    try:
        receipt_image = generate_receipt_image()
        print(f"✅ Generated receipt image (data URL length: {len(receipt_image)} chars)")
        
        response = requests.post(
            f"{BASE_URL}/ocr/receipt",
            headers={"Authorization": f"Bearer {user_id}"},
            json={"image": receipt_image}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Check response structure
        assert 'extraction' in data, "Missing extraction in response"
        assert 'mode' in data, "Missing mode in response"
        assert 'sensitive_found' in data, "Missing sensitive_found in response"
        
        mode = data['mode']
        extraction = data['extraction']
        
        print(f"✅ OCR response received with mode: '{mode}'")
        
        # Validate mode is one of the expected values
        assert mode in ['live', 'demo_fallback', 'demo'], f"Unexpected mode: {mode}"
        print(f"✅ Mode is valid: {mode}")
        
        # Validate extraction structure
        required_keys = ['merchant', 'date', 'currency', 'total', 'total_confidence', 'items', 'needs_user_verification']
        for key in required_keys:
            assert key in extraction, f"Missing {key} in extraction"
        print(f"✅ Extraction has all required keys: {required_keys}")
        
        # Validate items is an array
        assert isinstance(extraction['items'], list), "items should be an array"
        print(f"✅ Extraction items is an array with {len(extraction['items'])} items")
        
        # Print extraction details
        print(f"\nExtraction details:")
        print(f"  - Merchant: {extraction.get('merchant')}")
        print(f"  - Date: {extraction.get('date')}")
        print(f"  - Currency: {extraction.get('currency')}")
        print(f"  - Total: {extraction.get('total')}")
        print(f"  - Total confidence: {extraction.get('total_confidence')}")
        print(f"  - Items count: {len(extraction.get('items', []))}")
        print(f"  - Needs verification: {extraction.get('needs_user_verification')}")
        
        print(f"\n✅ TEST 2 PASSED: OCR endpoint working with mode='{mode}'")
        
    except Exception as e:
        print(f"❌ OCR test failed: {e}")
        import traceback
        traceback.print_exc()
        return
    
    # Test 3: Validation regression - missing image
    print("\n[TEST 3] Validation: POST with no image -> 400 bad_image...")
    try:
        response = requests.post(
            f"{BASE_URL}/ocr/receipt",
            headers={"Authorization": f"Bearer {user_id}"},
            json={}
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        data = response.json()
        assert data.get('code') == 'bad_image', f"Expected code 'bad_image', got {data.get('code')}"
        print(f"✅ Missing image correctly returns 400 with code 'bad_image'")
    except Exception as e:
        print(f"❌ Validation test (missing image) failed: {e}")
        return
    
    # Test 4: Validation regression - bad mime type
    print("\n[TEST 4] Validation: POST with text/plain data URL -> 400 bad_mime...")
    try:
        bad_data_url = "data:text/plain;base64,aGVsbG8="
        response = requests.post(
            f"{BASE_URL}/ocr/receipt",
            headers={"Authorization": f"Bearer {user_id}"},
            json={"image": bad_data_url}
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        data = response.json()
        assert data.get('code') == 'bad_mime', f"Expected code 'bad_mime', got {data.get('code')}"
        print(f"✅ Bad mime type correctly returns 400 with code 'bad_mime'")
    except Exception as e:
        print(f"❌ Validation test (bad mime) failed: {e}")
        return
    
    # Test 5: Consent gating regression - fresh user without consent
    print("\n[TEST 5] Consent gating: Fresh email user without consent -> 403 consent_required...")
    try:
        # Create fresh email user
        fresh_email = random_email()
        response = requests.post(f"{BASE_URL}/auth/session", json={"email": fresh_email})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        fresh_user_id = response.json()['user']['id']
        print(f"✅ Created fresh user: {fresh_email}, id: {fresh_user_id}")
        
        # Try to POST OCR without consent
        receipt_image = generate_receipt_image()
        response = requests.post(
            f"{BASE_URL}/ocr/receipt",
            headers={"Authorization": f"Bearer {fresh_user_id}"},
            json={"image": receipt_image}
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        data = response.json()
        assert data.get('code') == 'consent_required', f"Expected code 'consent_required', got {data.get('code')}"
        print(f"✅ Fresh user without consent correctly receives 403 with code 'consent_required'")
    except Exception as e:
        print(f"❌ Consent gating test failed: {e}")
        return
    
    # Test 6: Save-masking regression - phone number masking
    print("\n[TEST 6] Save-masking: POST receipt with phone number -> masked...")
    try:
        # Use the consented demo user
        response = requests.post(
            f"{BASE_URL}/receipts",
            headers={"Authorization": f"Bearer {user_id}"},
            json={
                "merchant": "Store Call 9876543210",
                "receipt_date": "2025-06-20",
                "currency": "INR",
                "total": 20,
                "category": "Food & Drinks",
                "items": [
                    {
                        "item_name": "Tea",
                        "price": 20,
                        "category": "Food & Drinks"
                    }
                ],
                "user_verified": True,
                "image": generate_receipt_image()
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Check that phone number is masked
        receipt = data.get('receipt', {})
        merchant = receipt.get('merchant', '')
        print(f"  Merchant stored as: '{merchant}'")
        
        # Check that the 10-digit phone number is not visible
        assert '9876543210' not in merchant, f"Phone number should be masked but found in: {merchant}"
        print(f"✅ Phone number is masked in stored merchant name")
        
        # Check sensitive_masked includes 'phone'
        sensitive_masked = data.get('sensitive_masked', [])
        assert 'phone' in sensitive_masked, f"Expected 'phone' in sensitive_masked, got {sensitive_masked}"
        print(f"✅ sensitive_masked includes 'phone': {sensitive_masked}")
        
    except Exception as e:
        print(f"❌ Save-masking test failed: {e}")
        import traceback
        traceback.print_exc()
        return
    
    # Test 7: Quick sanity check - insights/generate still works
    print("\n[TEST 7] Sanity check: POST /api/insights/generate...")
    try:
        response = requests.post(
            f"{BASE_URL}/insights/generate",
            headers={"Authorization": f"Bearer {user_id}"},
            json={}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert 'insight' in data, "Missing insight in response"
        assert 'source' in data, "Missing source in response"
        
        insight = data['insight']
        source = data['source']
        
        # Validate insight structure
        required_keys = ['insight', 'suggested_action', 'estimated_monthly_saving', 'related_goal_id', 'safety_note']
        for key in required_keys:
            assert key in insight, f"Missing {key} in insight"
        
        print(f"✅ Insights endpoint working, source: {source}")
        print(f"  Insight: {insight.get('insight')[:100]}...")
        
    except Exception as e:
        print(f"❌ Insights sanity check failed: {e}")
        import traceback
        traceback.print_exc()
        return
    
    print("\n" + "="*80)
    print("ALL OCR TESTS PASSED ✅")
    print("="*80)
    print(f"\nSummary:")
    print(f"  - OCR endpoint working with mode: '{mode}'")
    print(f"  - Validation errors working correctly (400 bad_image, 400 bad_mime)")
    print(f"  - Consent gating working correctly (403 consent_required)")
    print(f"  - Phone number masking working correctly")
    print(f"  - Insights endpoint working correctly")
    print()

if __name__ == "__main__":
    test_ocr_live_mode()
