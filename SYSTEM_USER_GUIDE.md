# KhLan (ខ្លាន) — System Features & User Operations Manual
*Cambodia's AI-Powered Trusted Vehicle Marketplace & Dealership Management Platform*

---

## 1. System Overview & Core Architecture

KhLan (ខ្លាន) is a dual-tier automotive ecosystem engineered specifically for the Cambodian marketplace. It solves the critical challenges of trust, transparency, and payment fraud in used and new car transactions through:
- **Evidence-Based AI Vehicle Inspection Reports** (scoring odometer tampering, accident history, title authenticity, and fair market valuation).
- **Automated NBC Bakong KHQR & Bank Slip OCR Verification** (instant activation for same-day payments and Telegram bot review for interbank/manual payments).
- **Strict 2-Party Verified Private Messaging** (direct end-to-end communication between vehicle owner and buyer with zero leaks and zero automated bot masquerades).
- **Multi-Tenant Dealership Management** (inventory distribution, staff permissions, and customer inquiry CRM).

---

## 2. Role-Based Feature Guides & Workflows

### 2.1 Role: Buyer (អ្នកទិញ)

#### A. Vehicle Search & Filter Navigation
1. **Browse Marketplace**: Navigate to the **Marketplace (ទិញឡាន)** tab.
2. **Multi-Parameter Filtering**:
   - Filter by **Make** (Toyota, Lexus, Honda, Ford, etc.), **Model**, and **Year Range**.
   - Set **Price Range** (USD) and **Mileage / Odometer**.
   - Filter by **Body Type** (SUV, Sedan, Pickup, EV, Hybrid) and **Transmission**.
   - Filter by **Seller Type**: Verified Dealership (`DEALER`) vs. Private Owner (`PRIVATE`).
3. **Sorting**: Sort by Newest, Price (Low to High / High to Low), or AI Inspection Score.

#### B. Reviewing AI Vehicle History & Inspection Reports
1. Open any vehicle detail card.
2. Click **"View AI Vehicle Report" (របាយការណ៍ AI)**:
   - **Overall Confidence Score (0-100%)**: Aggregated trust metric based on vehicle images, seller history, and document verification.
   - **Accident & Structural Damage Check**: AI visual inspection for chassis alignment, paint overspray, and panel gaps.
   - **Odometer Consistency Check**: Comparison of declared mileage against model age and wear heuristics.
   - **Price Evaluation**: Comparison against recent Cambodian market transaction data.

#### C. Contacting Sellers via Secure 2-Party Chat
1. On the vehicle page, click **"Contact Seller" (ទាក់ទងអ្នកលក់)**.
2. Enter your initial inquiry message (minimum 2 characters).
3. The conversation opens in **Messages (សារ)**:
   - Built-in Khmer/English safety notice warns against wire transfer deposits before in-person inspection.
   - Auto-polling keeps the thread live in real-time.
   - **Privacy Guarantee**: Only you and the vehicle listing owner can see and participate in the thread.

---

### 2.2 Role: Private Individual Seller (អ្នកលក់ផ្ទាល់ខ្លួន)

#### A. Free Trial & Seller Subscription
1. New registered sellers receive a **14-day Free Trial** upon account creation.
2. When the trial expires, complete your subscription to unlock vehicle listings:
   - **Basic / Pro Seller Plan**: Select your billing cycle (Monthly or Annual).
   - **Bakong KHQR Instant Scan**: Scan with any Cambodian banking app (ABA, ACLEDA, Wing, Canadia, Sathapana, etc.) for instant automated account activation.
   - **Manual Slip Upload & OCR**: Upload your payment screenshot. The system runs real-time OCR to match amount, currency, and date.
   - **Review Submission**: If paying from a different bank or earlier date, submit for review; our Telegram admin team verifies and approves within minutes.

#### B. Publishing a Vehicle Listing
1. Navigate to **"Sell a Car" (លក់ឡាន)**.
2. Provide vehicle specifications: Make, Model, Year, Plate Number / Tax Type, Price (USD), Fuel type, and Location (Phnom Penh, Siem Reap, Battambang, etc.).
3. Upload high-resolution vehicle photos (exterior 360, interior, engine bay, odometer).
4. Save and publish. Listings from active subscribers appear instantly on the live marketplace.

#### C. Responding to Buyer Leads
1. Navigate to **Messages (សារ)**.
2. Switch to the **"Selling" (ការលក់)** tab to filter conversations where you are the seller.
3. Chat directly with genuine buyers. You can negotiate prices, share location pins, or schedule viewing appointments.

---

### 2.3 Role: Dealership Owner & Staff (ម្ចាស់យានដ្ឋាន និងបុគ្គលិក)

#### A. Multi-Tenant Dealership Dashboard
1. Access the **Dealer Portal (គ្រប់គ្រងយានដ្ឋាន)**.
2. **Team Member Management**:
   - Invite sales managers and associates via phone numbers.
   - Assign roles: `OWNER`, `MANAGER`, `SALES`.
3. **Inventory Management**:
   - Bulk upload dealership inventory.
   - Track status: *Draft*, *Active*, *Reserved*, *Sold*.
4. **Lead & Inquiry Tracking**:
   - Monitor inquiries generated per vehicle.
   - Track customer response times and sales conversions.

#### B. Dealership Verification Badge
- Submit dealership registration documents, business license, and physical showroom address to earn the **Verified Dealer (យានដ្ឋានមានការបញ្ជាក់)** checkmark badge for elevated buyer trust.

---

### 2.4 Role: System Administrator (អ្នកគ្រប់គ្រងប្រព័ន្ធ)

#### A. Admin Control Center
1. Navigate to `/admin`.
2. **Platform Metrics**: View live total active listings, registered users, total transacted volume, and daily active chat sessions.
3. **User & Dealer Moderation**:
   - Review reported listings or suspicious seller accounts.
   - Blacklist fraudulent users or unverified duplicate accounts.

#### B. Subscription & Payment Auditing
1. Review pending payment submissions routed from the Telegram review pipeline.
2. Match bank transaction ID, customer reference, and payment timestamp.
3. Approve subscription requests with one click to immediately activate seller capabilities.

---

## 3. Security, Privacy & Integrity Policies

1. **Strict 2-Party Chat Isolation**:
   - Unauthenticated visitors are blocked with `401 Unauthorized`.
   - Access to any conversation ID is restricted strictly to the conversation buyer and the vehicle listing seller. All third parties receive `404 Not Found` to prevent account ID probing.
2. **No Automated Bot Impersonation**:
   - Automated canned messages masquerading as sellers have been completely removed.
3. **Cambodian Date & Interbank Guard**:
   - Automated payment correlation enforces same-day Phnom Penh calendar dates (UTC+7) to prevent fraudulent submissions of historical bank receipts.
