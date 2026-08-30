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
  Built on Next.js (App Router) + MongoDB (Supabase substituted with MongoDB per user's confirmed choice),
  demo-safe email/anonymous session auth, Emergent Universal LLM for friendly insights, and deterministic
  demo OCR. Core: transparent savings calculations, Financial Readiness Score, goals, receipt OCR + verify,
  scheme matcher, Before You Borrow, My Data control centre. English/Hindi toggle.

backend:
  - task: "Auth session (demo + email) - POST /api/auth/session"
    implemented: true
    working: true
    file: "/app/app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "Demo login seeds consent+profile+goals+receipts. Email login upserts user by email. Verified via curl: demo student returns user+seeded=true."
        -working: true
        -agent: "testing"
        -comment: "✅ All auth tests passed: demo student login, demo entrepreneur login, email login all return user with id. Missing email returns 400 code email_required. No auth header returns 401 code no_auth. Invalid Bearer token returns 401 code no_auth."
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
  - task: "OCR receipt (demo) - POST /api/ocr/receipt"
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
  version: "1.0"
  test_sequence: 1
  run_ui: false

test_plan:
  current_focus:
    - "AI insight (Emergent LLM + fallback) - POST /api/insights/generate"
    - "OCR receipt (demo) - POST /api/ocr/receipt"
    - "Receipts CRUD + private image"
    - "Dashboard aggregation - GET /api/dashboard"
    - "Consent gate + record/withdraw"
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
