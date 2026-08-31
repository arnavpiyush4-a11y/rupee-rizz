#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  RupeeRizz - a consent-based financial wellbeing coach for Indian students & micro-entrepreneurs.
  Next.js (App Router) migrated from MongoDB to SUPABASE (Auth + Postgres/RLS + private Storage).
  Auth is now REAL Supabase email/password (email confirmation ON) with persistent sessions, logout,
  protected routes, and a 6-digit OTP forgot-password (recovery) flow. Google Sign-In was REMOVED.
  The client sends the Supabase access_token (JWT) as `Authorization: Bearer <jwt>`; the backend
  (/app/app/api/[[...path]]/route.js) creates a per-request Supabase client scoped to that token so
  Postgres RLS is enforced as the logged-in user. Emergent Universal LLM (gpt-4o-mini) powers insights
  and OCR structuring; OCR.space does live receipt OCR. NEEDS FULL BACKEND RETEST in the Supabase model.

backend:
  - task: "Supabase auth + JWT-scoped RLS on protected /api routes (login/session/protected/RLS)"
    implemented: true
    working: true
    file: "/app/app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "MIGRATED to Supabase. Backend now reads Authorization: Bearer <supabase JWT>; createRequestClient() builds a per-request client scoped to that token so Postgres RLS applies as the user. Unauthenticated -> 401 no_auth. Pre-verified at SDK level: both confirmed users log in, profile trigger fires, receipts/storage RLS isolates users A vs B. NEEDS full retest of all /api routes with a real JWT. NOTE: /api/auth/session no longer exists (auth is client-side via supabase-js)."
        -working: true
        -agent: "testing"
        -comment: "✅ FULL SUPABASE AUTH RETEST COMPLETE - ALL 11 TESTS PASSED. Tested with real Supabase JWT tokens obtained via password grant for both confirmed users (arnavpiyush7@gmail.com and architgupta485@gmail.com). Auth: No/invalid Bearer → 401 no_auth ✓, Valid JWT → GET /api/me returns user data ✓. Consent gating: All 7 protected routes (dashboard, ocr/receipt, receipts POST, insights/generate, before-you-borrow, readiness-report, financial-health) return 403 consent_required before consent ✓, POST /api/consent → active=true ✓, GET /api/me shows consent.active=true ✓. Profile: POST with user_type='student' creates profile ✓, GET returns profile ✓. Receipts+Storage: Phone masking works (merchant 'Store Call 9876543210' → 'Store Call ••••• masked', sensitive_masked=['phone']) ✓, Image upload to Supabase Storage ✓, GET /receipts/:id/image returns signed URL ✓, CRUD operations (list/get/update/delete) all working ✓. OCR: Validation errors (missing image → 400 bad_image, text/plain → 400 bad_mime) ✓, Valid PNG → 200 with extraction mode='live' ✓. Goals: CRUD + contribute (5000 + 500 = 5500) all working ✓. Dashboard/Health/BYB/Insights/Report: All endpoints return complete data structures (health score: 86, BYB returns 6 options, insights source='llm') ✓. Schemes: Public GET /schemes (no auth) returns 12 schemes ✓, GET /schemes/match returns 5 matches ✓. RLS Isolation: User B cannot access User A's receipt by ID (404) ✓, User B's receipts list excludes User A's data ✓. My Data: Export returns complete data ✓, Delete (User B only) wipes data and withdraws consent (verified by 403 on dashboard) ✓. The Supabase migration is FULLY FUNCTIONAL with proper JWT authentication, RLS enforcement, and all backend features working correctly."
  - task: "Consent gate + record/withdraw - /api/consent, /api/consent/withdraw, /api/me"
    implemented: true
    working: true
    file: "/app/app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "hasActiveConsent gates ocr/receipts/dashboard/insights/before-you-borrow with 403 code consent_required. /me returns active + history."
        -working: true
        -agent: "testing"
        -comment: "✅ All consent gating tests passed: Fresh email user without consent receives 403 consent_required for GET /dashboard, POST /ocr/receipt, POST /receipts, POST /insights/generate, POST /before-you-borrow. POST /consent returns active=true. GET /me shows consent.active=true. POST /consent/withdraw returns active=false and history is recorded."
  - task: "Profile onboarding - GET/POST /api/profile"
    implemented: true
    working: true
    file: "/app/app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "Upserts profile (user_type, finance snapshot, pathway, state) and optional initial_goal."
        -working: true
        -agent: "testing"
        -comment: "✅ Profile tests passed: POST /profile with user_type, finance, and initial_goal creates profile. GET /profile returns profile. Initial goal was successfully created and appears in goals list."
  - task: "OCR receipt (LIVE OCR.space + Emergent LLM) - POST /api/ocr/receipt"
    implemented: true
    working: true
    file: "/app/app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "Validates data-url mime (jpg/png/webp) + <=10MB, consent-gated, rate-limited. Returns deterministic demo extraction + sensitive_found. Architected so a live vision adapter can replace demo without UI change."
        -working: true
        -agent: "testing"
        -comment: "✅ OCR validation tests passed: Missing image returns 400 code bad_image. Non-image data URL (text/plain) returns 400 code bad_mime. Valid PNG data URL returns 200 with extraction containing merchant, date, currency, total, total_confidence, items, needs_user_verification and mode=demo."
        -working: true
        -agent: "main"
        -comment: "LIVE OCR now enabled (OCR_MODE=live, OCR.space + Emergent LLM structuring, Zod-validated, demo fallback). Diagnostic with a generated receipt PNG returned mode='live' and correctly parsed merchant/date/total 234/4 items. Please RETEST OCR: (a) generate a small receipt-like PNG with PIL (pillow is installed) and POST it -> expect mode 'live' or 'demo_fallback' (both acceptable) with valid extraction shape; (b) validation errors still 400; (c) consent gating still 403; (d) saving a receipt still masks phone numbers."
        -working: true
        -agent: "testing"
        -comment: "✅ LIVE OCR FULLY TESTED AND WORKING: Generated receipt PNG with PIL (merchant 'FRESH MART GROCERY', date 2025-06-20, 4 items, total Rs 405). OCR.space successfully extracted text and Emergent LLM structured it correctly. Response mode='live' with all required fields (merchant, date, currency, total, total_confidence, items array with 4 items, needs_user_verification). Validation regressions passed: missing image → 400 bad_image, text/plain data URL → 400 bad_mime. Consent gating regression passed: fresh email user without consent → 403 consent_required. Save-masking regression passed: receipt with phone '9876543210' correctly masked to '••••• masked' and sensitive_masked=['phone']. Insights/generate sanity check passed: returns insight with source='llm'. All 7 test scenarios passed successfully."
  - task: "Receipts CRUD + private image - /api/receipts, /api/receipts/:id, /api/receipts/:id/image"
    implemented: true
    working: true
    file: "/app/app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "Masks sensitive text (phone/UPI/card) before storage. Stores sanitised base64 in receipt_images (owner-only). User-scoped by Bearer user_id."
        -working: true
        -agent: "testing"
        -comment: "✅ Receipts CRUD and masking tests passed: POST /receipts with merchant containing phone number 'Cafe Call 98765 43210' correctly masks the phone and returns sensitive_masked including 'phone'. GET /receipts lists receipts. GET /receipts/:id returns specific receipt. PUT /receipts/:id updates receipt. DELETE /receipts/:id removes receipt and subsequent GET returns 404."
  - task: "Goals + contributions - /api/goals, /api/goals/:id, /api/goals/:id/contribute"
    implemented: true
    working: true
    file: "/app/app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "Create/update/delete goals, contribute increments current_saved_amount + logs goal_contributions."
        -working: true
        -agent: "testing"
        -comment: "✅ Goals and contributions tests passed: GET /goals returns goals list. POST /goals creates new goal. POST /goals/:id/contribute with amount 500 correctly increments current_saved_amount by 500 (from 5000 to 5500). PUT /goals/:id updates goal. DELETE /goals/:id removes goal."
  - task: "Dashboard aggregation - GET /api/dashboard"
    implemented: true
    working: true
    file: "/app/app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "Deterministic finance.js: snapshot, allocation (60/40 or 70/30 rules), goal metrics, spending-by-category, income-vs-expenses, nudge, readiness. Verified: safe_saving 3500, health 79."
        -working: true
        -agent: "testing"
        -comment: "✅ Dashboard aggregation test passed: GET /dashboard returns complete dashboard with snapshot (including safe_monthly_saving), health (score 0-100), goals with metrics and recommended_monthly, spending_by_category, income_vs_expenses, nudge, and schemes_preview."
  - task: "Financial health + readiness score + borrow guard - GET /api/financial-health"
    implemented: true
    working: true
    file: "/app/app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "Score out of 100 w/ 5-factor breakdown + checklist + borrowGuard (surplus<=0, emergency<target, EMI>30%)."
        -working: true
        -agent: "testing"
        -comment: "✅ Financial health test passed: GET /financial-health returns score (0-100), band, breakdown with 5 factors (each with points/max), checklist (emergency_fund_started, estimated_monthly_saving, emi_burden_pct, data_correction_needed), and guard (canBorrow, reasons, emiRatio)."
  - task: "Scheme registry + matcher - GET /api/schemes, /api/schemes/match"
    implemented: true
    working: true
    file: "/app/app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "scheme_registry seeded on connect. Matcher filters by user_type; status always 'Potentially relevant'; never affects score."
        -working: true
        -agent: "testing"
        -comment: "✅ Schemes tests passed: GET /schemes returns 12 seeded schemes. GET /schemes/match returns matches for the user_type with eligibility_status 'Potentially relevant'."
  - task: "Before You Borrow - POST /api/before-you-borrow"
    implemented: true
    working: true
    file: "/app/app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "Ordered options 1..6 with comparison fields + guard; adds 'Do not borrow yet' when guard fails."
        -working: true
        -agent: "testing"
        -comment: "✅ Before You Borrow test passed: POST /before-you-borrow with goalId returns guard (canBorrow, reasons) and ranked options (>=5) with fields: rank, option, upfront, monthly_impact, benefit, conditions, next_action."
  - task: "AI insight (Emergent LLM + fallback) - POST /api/insights/generate"
    implemented: true
    working: true
    file: "/app/app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "Uses emergentintegrations LlmChat gpt-4o-mini with server-computed VERIFIED data only. Verified curl returned source=llm. Deterministic fallback if LLM unavailable. Strict JSON parse+validate."
        -working: true
        -agent: "testing"
        -comment: "✅ AI insight test passed: POST /insights/generate returns insight with fields (insight, suggested_action, estimated_monthly_saving, related_goal_id, safety_note) and source='llm'. LLM integration is working correctly with EMERGENT_LLM_KEY."
  - task: "My Data export/delete - GET /api/my-data/export, POST /api/my-data/delete"
    implemented: true
    working: true
    file: "/app/app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "Export aggregates all user collections. Delete removes all user data + image + withdraws consent + logs deletion_request."
        -working: true
        -agent: "testing"
        -comment: "✅ My Data tests passed: GET /my-data/export returns complete export with user, profile, consents, receipts, goals, contributions, scheme_matches. POST /my-data/delete successfully removes all data - verified by dashboard returning 400/403 (profile/consent gone) and GET /receipts returning empty array."

frontend:
  - task: "Full SPA flow (landing -> demo/auth -> consent -> onboarding -> dashboard -> receipts/plan/goals/health/options/BYB/my-data)"
    implemented: true
    working: true
    file: "/app/app/page.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "Verified via screenshots: landing + demo picker + dashboard render correctly with real data. Frontend testing NOT yet run - awaiting user permission."

metadata:
  created_by: "main_agent"
  version: "2.0"
  test_sequence: 2
  run_ui: false

test_plan:
  current_focus:
    - "Supabase auth + JWT-scoped RLS on protected /api routes (login/session/protected/RLS)"
    - "Consent gate + record/withdraw - /api/consent, /api/consent/withdraw, /api/me"
    - "Profile onboarding - GET/POST /api/profile"
    - "Receipts CRUD + private image (Supabase Storage)"
    - "OCR receipt (LIVE OCR.space + Emergent LLM) - POST /api/ocr/receipt"
    - "Goals + contributions"
    - "Dashboard aggregation - GET /api/dashboard"
    - "Financial health + readiness score + borrow guard - GET /api/financial-health"
    - "Readiness Report - GET /api/readiness-report"
    - "AI insight (Emergent LLM + fallback) - POST /api/insights/generate"
    - "My Data export/delete"
  stuck_tasks: []
  test_all: true
  test_priority: "high_first"

agent_communication:
    -agent: "main"
    -message: |
      Please test ALL backend endpoints. Auth model: obtain a token by POST /api/auth/session with
      {"demo":true,"demo_profile":"student"} (or "entrepreneur"); use the returned user.id as
      Authorization: Bearer <user_id> on all other calls. Also test email login {"email":"x@y.com"}.
      Key checks:
      1) Consent gating: without consent (fresh email user, before POST /api/consent), calls to
         /api/ocr/receipt, /api/receipts (POST), /api/dashboard, /api/insights/generate,
         /api/before-you-borrow must return 403 code consent_required.
      2) User isolation (RLS-equivalent): a token must never see another user's receipts/goals.
      3) OCR validation: reject bad mime / >10MB / missing image (400). Accept a small valid PNG data URL.
      4) Receipts: POST verified receipt with a merchant containing a phone number -> stored merchant must be masked; sensitive_masked should include 'phone'.
      5) Full flow: demo login -> dashboard has snapshot/health/goals; contribute to a goal increments saved; financial-health returns score+breakdown+checklist+guard; before-you-borrow returns ordered options; insights/generate returns insight (source llm or fallback); my-data/export returns data; my-data/delete clears it.
      Do NOT hardcode DB name; app uses env. All routes are under /api prefix.
    -agent: "testing"
    -message: |
      ✅ BACKEND TESTING COMPLETE - ALL 40 TESTS PASSED
      
      Comprehensive backend API testing completed successfully. All endpoints are working correctly:
      
      1. Auth (6 tests): Demo student/entrepreneur login, email login, validation errors (missing email → 400 email_required, no auth → 401 no_auth, invalid token → 401 no_auth)
      
      2. Consent Gating (8 tests): Fresh email user without consent correctly receives 403 consent_required for all protected endpoints (dashboard, ocr/receipt, receipts POST, insights/generate, before-you-borrow). Consent flow works: POST /consent → active=true, GET /me shows consent, POST /consent/withdraw → active=false with history.
      
      3. Profile (3 tests): POST /profile creates profile with user_type, finance, and initial_goal. GET /profile returns profile. Initial goal successfully created.
      
      4. OCR (3 tests): Validation working correctly - missing image → 400 bad_image, bad mime → 400 bad_mime, valid PNG → 200 with extraction and mode=demo.
      
      5. Receipts CRUD (5 tests): POST with phone number in merchant correctly masks sensitive data. GET /receipts lists, GET /receipts/:id retrieves, PUT updates, DELETE removes (verified with 404).
      
      6. User Isolation (2 tests): User B cannot access User A's receipts by ID (404) and User B's receipts list excludes User A's data.
      
      7. Dashboard (1 test): Returns complete dashboard with snapshot, health score, goals with metrics, spending_by_category, income_vs_expenses, nudge, schemes_preview.
      
      8. Goals (5 tests): GET lists, POST creates, POST /contribute increments saved amount correctly (5000 + 500 = 5500), PUT updates, DELETE removes.
      
      9. Financial Health (1 test): Returns score (0-100), band, 5-factor breakdown, checklist, and guard with canBorrow/reasons.
      
      10. Before You Borrow (1 test): Returns guard and ranked options (>=5) with all required fields.
      
      11. AI Insights (1 test): Returns insight with source='llm' (Emergent LLM integration working), includes all required fields.
      
      12. Schemes (2 tests): GET /schemes returns 12 seeded schemes. GET /schemes/match returns matches with eligibility_status 'Potentially relevant'.
      
      13. My Data (2 tests): GET /my-data/export returns complete export. POST /my-data/delete successfully removes all data (verified by dashboard 400/403 and empty receipts).
      
      NO CRITICAL ISSUES FOUND. All endpoints return correct status codes, error codes, and data structures as specified.

    -agent: "testing"
    -message: |
      ✅ LIVE OCR RE-TEST COMPLETE - ALL 7 TESTS PASSED
      
      Focused re-test of OCR receipt endpoint after enabling LIVE OCR mode (OCR_MODE=live, OCR_PROVIDER=ocrspace, OCR_API_KEY set):
      
      1. ✅ LIVE OCR Integration: Generated receipt PNG using PIL with merchant "FRESH MART GROCERY", date "2025-06-20", 4 items (Milk, Bread, Eggs, Rice), total Rs 405.00. OCR.space successfully extracted text and Emergent LLM (gpt-4o-mini) structured it into valid JSON. Response mode='live' (not fallback!).
      
      2. ✅ Extraction Structure: All required fields present and valid - merchant: "FRESH MARTGROCERY" (OCR spacing issue but readable), date: "2025-06-20", currency: "INR", total: 405, total_confidence: 1, items: array with 4 items, needs_user_verification: [].
      
      3. ✅ Validation Regression: Missing image → 400 bad_image ✓, text/plain data URL → 400 bad_mime ✓
      
      4. ✅ Consent Gating Regression: Fresh email user (ocrtest+h3v3rjei@example.com) without consent → 403 consent_required ✓
      
      5. ✅ Save-Masking Regression: Receipt with merchant "Store Call 9876543210" correctly masked to "Store Call ••••• masked", sensitive_masked=['phone'] ✓
      
      6. ✅ Insights Sanity Check: POST /api/insights/generate returns insight with source='llm' (Emergent LLM working) ✓
      
      OBSERVED MODE: 'live' (OCR.space + LLM structuring working correctly)
      NO 500 ERRORS, NO TIMEOUTS, NO CRASHES
      
      The LIVE OCR integration is fully functional. OCR.space extracts text from receipt images, Emergent LLM structures it into Zod-validated JSON, and the system gracefully falls back to demo data on any failure. All validation, consent gating, and masking features remain intact.

    -agent: "main"
    -message: |
      SUPABASE MIGRATION - FULL AUTHENTICATED BACKEND RETEST REQUESTED (test_all: true).
      The whole backend was migrated from MongoDB to Supabase. AUTH MODEL CHANGED:
      - There is NO /api/auth/session anymore. Auth is real Supabase email/password (client-side).
      - To test protected /api routes you MUST obtain a real Supabase JWT and send it as
        `Authorization: Bearer <access_token>`.

      HOW TO GET A JWT (do this at test start; tokens expire ~1h):
        POST {NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password
          headers: { apikey: <NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY>, Content-Type: application/json }
          body: {"email":"...","password":"..."}
        Use response.access_token as the Bearer for all /api calls.
        (NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are in /app/.env)

      CONFIRMED TEST USERS (both can log in; see /app/memory/test_credentials.md):
        A: arnavpiyush7@gmail.com / arnav@21
        B: architgupta485@gmail.com / archit@21

      BASE URL: call routes at {NEXT_PUBLIC_BASE_URL}/api/... (from /app/.env). All routes are /api-prefixed.

      WHAT TO TEST (as user A unless noted):
      1) AUTH/PROTECTED: No/invalid Bearer -> 401 code no_auth for a protected route (e.g. GET /api/me).
         Valid JWT -> GET /api/me returns {user:{id,email}, profile, consent}.
      2) CONSENT GATING: BEFORE recording consent, protected data routes must return 403 consent_required:
         GET /api/dashboard, POST /api/ocr/receipt, POST /api/receipts, POST /api/insights/generate,
         POST /api/before-you-borrow, GET /api/readiness-report, GET /api/financial-health.
         Then POST /api/consent -> {active:true}; GET /api/me shows consent.active true.
         (Optional at end: POST /api/consent/withdraw -> active:false. NOTE withdrawing consent re-gates routes.)
      3) PROFILE: POST /api/profile with {full_name,user_type:'student'|'micro_entrepreneur',finance:{...},
         optional initial_goal} then GET /api/profile returns it. user_type must be 'student' or
         'micro_entrepreneur' (DB CHECK constraint).
      4) RECEIPTS + STORAGE: POST /api/receipts with a merchant containing a phone number (e.g.
         "Store Call 9876543210") -> stored merchant masked, sensitive_masked includes 'phone'.
         Include a small valid base64 image data URL (jpg/png/webp) so it uploads to private Storage;
         then GET /api/receipts/:id/image returns a signed url. GET list, GET one, PUT, DELETE.
      5) OCR: POST /api/ocr/receipt validation: missing image -> 400 bad_image; text/plain data URL -> 400
         bad_mime. A small valid PNG data URL -> 200 with extraction (mode 'live' or 'demo_fallback' both OK).
      6) GOALS: GET list, POST create, POST /api/goals/:id/contribute {amount} increments
         current_saved_amount, PUT update, DELETE.
      7) DASHBOARD/HEALTH/BYB/INSIGHTS/REPORT: GET /api/dashboard (snapshot, health, goals, spending,
         schemes_preview). GET /api/financial-health (score/band/breakdown/checklist/guard). POST
         /api/before-you-borrow (guard + ranked options). POST /api/insights/generate (insight, source
         'llm' or 'fallback'). GET /api/readiness-report (report with score, band, breakdown, snapshot,
         strengths, improvements, suggestions).
      8) SCHEMES: GET /api/schemes (public, no auth) returns list; GET /api/schemes/match returns matches.
      9) RLS ISOLATION (two users): As user B, ensure B cannot read a receipt created by A (by id -> 404
         via API, and B's GET /api/receipts excludes A's data). Pre-verified true at SDK level; confirm via API.
      10) MY DATA: GET /api/my-data/export returns all user data. (Only call POST /api/my-data/delete LAST
          for a throwaway state - it wipes the user's data + withdraws consent; prefer running it as a
          separate final step or skip if you want to preserve A's data. If you run it, do it on user A
          after all other A tests, or note it.)

      IMPORTANT: Do NOT change the Supabase auth config. Do NOT use a service_role key. Use only the
      publishable key + the two confirmed users above. Env vars must come from process.env (no hardcoding).

    -agent: "testing"
    -message: |
      ✅ SUPABASE MIGRATION BACKEND RETEST COMPLETE - ALL 11 TESTS PASSED (100% SUCCESS RATE)
      
      Executed comprehensive backend test suite with real Supabase JWT authentication using both confirmed test users:
      - User A: arnavpiyush7@gmail.com / arnav@21
      - User B: architgupta485@gmail.com / archit@21
      
      TEST RESULTS SUMMARY:
      
      1. ✅ Auth and Protected Routes (3 tests)
         - No auth header → 401 no_auth
         - Invalid Bearer token → 401 no_auth
         - Valid Supabase JWT → 200 with user data (id, email)
      
      2. ✅ Consent Gating (10 tests)
         - All 7 protected routes return 403 consent_required before consent:
           GET /api/dashboard, POST /api/ocr/receipt, POST /api/receipts,
           POST /api/insights/generate, POST /api/before-you-borrow,
           GET /api/readiness-report, GET /api/financial-health
         - POST /api/consent → active=true
         - GET /api/me shows consent.active=true
      
      3. ✅ Profile Onboarding (2 tests)
         - POST /api/profile with user_type='student' creates profile
         - GET /api/profile returns profile data
      
      4. ✅ Receipts CRUD + Supabase Storage + Masking (6 tests)
         - Phone number masking: 'Store Call 9876543210' → 'Store Call ••••• masked'
         - sensitive_masked=['phone'] returned correctly
         - Image upload to private Supabase Storage bucket
         - GET /api/receipts/:id/image returns signed URL
         - CRUD operations: list, get by id, update, delete (verified with 404)
      
      5. ✅ OCR Validation and Processing (3 tests)
         - Missing image → 400 bad_image
         - Invalid mime (text/plain) → 400 bad_mime
         - Valid PNG → 200 with extraction, mode='live' (OCR.space + Emergent LLM working)
      
      6. ✅ Goals CRUD and Contributions (5 tests)
         - GET /api/goals returns goals list
         - POST /api/goals creates new goal
         - POST /api/goals/:id/contribute correctly increments: 5000 + 500 = 5500
         - PUT /api/goals/:id updates goal
         - DELETE /api/goals/:id removes goal
      
      7. ✅ Dashboard, Health, BYB, Insights, Report (5 tests)
         - GET /api/dashboard returns complete dashboard (snapshot, health, goals, spending, schemes_preview)
         - GET /api/financial-health returns score=86, band, 5-factor breakdown, checklist, guard
         - POST /api/before-you-borrow returns guard + 6 ranked options
         - POST /api/insights/generate returns insight with source='llm' (Emergent LLM integration working)
         - GET /api/readiness-report returns complete report with score, band, breakdown, snapshot
      
      8. ✅ Schemes (2 tests)
         - GET /api/schemes (public, no auth) returns 12 schemes
         - GET /api/schemes/match (authenticated) returns 5 matches
      
      9. ✅ RLS Isolation - Two Users (3 tests)
         - User A creates receipt
         - User B cannot access User A's receipt by ID → 404 (RLS enforced)
         - User B's GET /api/receipts list excludes User A's data (RLS enforced)
      
      10. ✅ My Data Export (1 test)
          - GET /api/my-data/export returns complete export (user, profile, consents, receipts, goals, contributions)
      
      11. ✅ My Data Delete (1 test - User B only)
          - POST /api/my-data/delete successfully wipes all data
          - Verified: GET /api/dashboard → 403 (profile/consent gone)
      
      CRITICAL FINDINGS:
      - Supabase JWT authentication is FULLY FUNCTIONAL
      - Postgres RLS is properly enforced (user isolation confirmed)
      - Supabase Storage private bucket working with signed URLs
      - All consent gating working correctly
      - OCR.space + Emergent LLM integration working (mode='live')
      - Phone number masking working correctly
      - All CRUD operations working
      - No 500 errors, no crashes, no RLS violations
      
      The Supabase migration is PRODUCTION-READY. All backend APIs are working correctly with the new authentication model.
