MINI ERP — PROJECT REQUIREMENTS
1. PROJECT OVERVIEW
Project Name
Mini ERP — Simple Business Management Platform
Project Type
A simplified ERP (Enterprise Resource Planning) system consisting of:
• Responsive Web Application
• Android-first Mobile Application
• Shared Backend
• Shared Database
• Business Estimation & What-if Calculator
Primary Goal
Build an extremely simple business management system for people who:
• Have limited digital literacy.
• Are not comfortable using computers.
• May barely use smartphones beyond calling and scrolling.
• Currently perform business calculations manually.
• May not understand traditional ERP, accounting software, or spreadsheets.
The system must allow such users to manage basic business operations without
needing to understand technology.
Core Philosophy
Minimum user input → Maximum automatic calculation
The product should behave more like a simple digital business assistant than a
traditional ERP.
2. TARGET USERS
The primary users are:
• Small business owners
• Wholesalers
• Retailers
• Shopkeepers
• Small distributors
• Business investors
• Employees assisting business owners
User Characteristics
The interface must assume that the user may:
• Have difficulty reading complex interfaces.
• Have difficulty typing.
• Not understand accounting terminology.
• Not understand spreadsheets.
• Make mistakes while entering numbers.
• Prefer buttons and dropdowns over typing.
• Prefer Bangla over English.
• Use an Android smartphone with limited technical knowledge.
Therefore:
Do not design the product for technically skilled users first.
Design it for the least technically experienced user.
3. CORE DESIGN PRINCIPLE
Every major operation should follow this pattern:
USER ENTERS MINIMUM INFORMATION
↓
SYSTEM VALIDATES INPUT
↓
SYSTEM CALCULATES EVERYTHING POSSIBLE
↓
USER REVIEWS RESULT
↓
USER CONFIRMS
↓
SYSTEM SAVES TRANSACTION
↓
STOCK / PAYMENT / REPORTS UPDATE AUTOMATICALLY
The user should never be forced to manually calculate:
• Total price
• Profit
• Remaining payment
• Stock balance
• Invoice total
• Purchase cost
• Expected profit
• Monthly totals
• Daily totals
4. LANGUAGE
Primary language:
Bangla
Secondary language:
English
The application must support language switching.
Preferred terminology
Use simple language.
Instead of:
• Revenue → বিক্রির টাকা
• Gross Profit → ম াট লাভ
• Accounts Receivable → মিতার িাবক
• Accounts Payable → সরিরাহকারীকক বিকত হকি
• Inventory → স্টক /  জুি
• Procurement → পণ্য মকনা
• Expense → খরচ
Avoid unnecessary technical accounting terminology.
5. CURRENCY AND LOCALIZATION
Default currency:
Bangladeshi Taka (৳ BDT)
Support:
• kg
• gram
• litre
• piece
• packet
• box
• bag
• dozen
• custom units
Support Bangladeshi date and number formatting where appropriate.
6. CORE APPLICATION MODULES
The system should contain:
1. Dashboard
2. Sales
3. Purchases
4. Products
5. Inventory
6. Business Estimator
7. Expenses
8. Customers
9. Suppliers
10. Payments & Dues
11. Invoices
12. Reports
13. Settings
14. Authentication
15. User & Role Management
7. DASHBOARD
The dashboard is the primary home screen.
It must provide an immediate understanding of the business.
Dashboard cards
Display:
• আজককর বিক্রি
• আজককর মকনাকাটা
• আজককর খরচ
• আজককর আনু াবনক লাভ
• িতত ান স্টক
• কক  যাওয়া স্টক
• মিতার কাছ মেকক পাওনা
• সরিরাহকারীকক বিকত হকি
Quick Actions
Large buttons:
•       বিক্রি করুন
•        পণ্য বকনুন
•   পণ্য মযাগ করুন
•            খরচ মযাগ করুন
•    লাভ বহসাি করুন
•    Invoice ততবর করুন
Time filters
Support:
• Today
• This Week
• This Month
• Custom Date Range
8. SALES MODULE
The sales process must be extremely simple.
User flow
বিক্রি করুন
↓
পণ্য বনিতাচন
↓
পবর াণ্ বনিতাচন
↓
িা
↓
automatically loaded
ম াট বহসাি
↓
Customer বনিতাচন
↓
কত টাকা মপকয়কছ?
↓
িাবক automatically calculated
↓
Confirm Sale
↓
Stock automatically decreases
Sales features
• Product search
• Product categories
• Product selection cards
• Quantity input
• Automatic price retrieval
• Multiple products in one sale
• Discount
• Customer selection
• Cash sale
• Credit sale
• Partial payment
• Payment method
• Invoice generation
• Sales history
• Sale cancellation
• Sale correction
• Stock deduction
Important
A sale must automatically update:
• Inventory
• Customer balance
• Sales reports
• Profit calculations
• Cash/payment records

9. PURCHASE MODULE
User flow
পণ্য বকনুন
      ↓
Supplier বনিতাচন
      ↓
Product বনিতাচন
      ↓
Quantity
      ↓
Purchase Price
      ↓
Total Cost
      ↓
Amount Paid
      ↓
Remaining Payable
      ↓
Confirm Purchase
      ↓
Stock automatically increases
Purchase features
• Supplier selection
• Product selection
• Quantity
• Purchase price
• Multiple products
• Transport cost
• Other purchase cost
• Partial supplier payment
• Purchase history
• Purchase correction
• Purchase return
• Automatic stock increase
10. PRODUCT MODULE
Every product should contain:
• Product name
• Bangla name
• English name (optional)
• Product code / SKU
• Category
• Product image (optional)
• Unit
• Purchase price
• Selling price
• Current stock
• Minimum stock level
• Preferred supplier
• Status
• Optional expiry date
• Optional batch number
• Optional grade/quality
Product operations
• Add
• Edit
• Search
• Delete/archive
• Categorize
• Activate/deactivate
11. INVENTORY MODULE
Inventory must be automated.
Example
Opening stock:
100 kg Rice
Sale:
20 kg
System:
100 - 20 = 80 kg
Purchase:
50 kg
System:
80 + 50 = 130 kg
The user should not manually modify the stock after every transaction.
Inventory features
• Current stock
• Stock movement
• Stock-in
• Stock-out
• Low-stock warning
• Inventory valuation
• Stock history
• Manual adjustment with reason
• Product-wise stock report
Every inventory change should have a traceable source.
12. LOW STOCK ALERT
Each product should have a minimum stock threshold.
Example:
Rice
Current: 12 kg
Minimum: 20 kg
Show:
চাকলর স্টক কক  মগকছ
Optionally show:
Recommended purchase: 50 kg
The recommendation must be clearly labeled as an estimate.
13. BUSINESS ESTIMATOR
This is one of the core differentiating features.
The estimator must allow the user to calculate a potential business transaction without
affecting real business data.
Example
Input:
Product: Rice
Quantity: 500 kg
Purchase Price: ৳60/kg
Selling Price: ৳70/kg
Transport Cost: ৳1,000
Output:
Purchase Cost: ৳30,000
Expected Sales: ৳35,000
Transport: ৳1,000
Estimated Gross Profit: ৳5,000
Estimated Net Profit: ৳4,000
All calculations must update instantly.
14. WHAT-IF CALCULATOR
Allow users to test different business scenarios.
Example:
Selling price = ৳65
Expected profit = ৳1,500
Change:
Selling price = ৳70
System immediately shows:
Expected profit = ৳4,000
Support scenarios
• Different purchase prices
• Different selling prices
• Different quantities
• Transport cost
• Other expenses
• Wastage
• Discounts
• Different sales volumes
Scenario comparison
Support:
• Best case
• Expected case
• Worst case
The estimator must never modify:
• Real stock
• Real sales
• Real purchases
• Real customer balances
• Real supplier balances
15. PROFIT CALCULATION
The application must distinguish between:
Revenue
Money generated from sales.
Purchase Cost
Cost of products purchased/sold.
Gross Profit
Sales Revenue - Cost of Goods Sold
Net Profit
Gross Profit - Operating Expenses
The system must not incorrectly label revenue as profit.
All financial calculations must use consistent rounding and money-safe numeric
handling.
16. EXPENSE MODULE
Users must be able to add expenses easily.
Default categories:
• Rent
• Electricity
• Salary
• Transport
• Packaging
• Repair
• Internet
• Phone
• Other
Expense form
Keep it simple:
Expense Category
Amount
Date
Optional Note
Payment Method
Optional:
• Receipt attachment
17. CUSTOMER MODULE
Customer information:
• Name
• Phone
• Address (optional)
• Total purchases
• Total paid
• Outstanding balance
• Transaction history
Customer page
Show clearly:
Rahim Store
Total Purchase: ৳50,000
Paid: ৳40,000
িাবক: ৳10,000
18. SUPPLIER MODULE
Supplier information:
• Name
• Phone
• Address
• Total purchases
• Total paid
• Outstanding payable
• Purchase history
Example:
Karim Supplier
Total Purchase: ৳80,000
Paid: ৳60,000
বিকত হকি: ৳20,000
19. PAYMENT & DUE MANAGEMENT
Track:
Customer Receivables
Money customers owe the business.
Supplier Payables
Money the business owes suppliers.
Every payment must show:
Original amount
Already paid
New payment
Remaining balance
Prevent accidental duplicate payments.
20. INVOICE SYSTEM
Generate invoices automatically after a completed sale.
Invoice should contain:
• Business name
• Contact details
• Invoice number
• Date
• Customer
• Product
• Quantity
• Unit price
• Line total
• Discount
• Additional charges
• Total
• Paid
• Due
• Payment status
Support:
• Print
• PDF
• Reprint
• Invoice search
• Bangla invoice
• English invoice
Old invoices must preserve their original transaction prices.
Changing today's product price must not change yesterday's invoice.
21. REPORTS
Reports must be generated from actual stored transactions.
Sales reports
• Daily
• Weekly
• Monthly
• Yearly
• Product-wise
• Customer-wise
Purchase reports
• Daily
• Weekly
• Monthly
• Supplier-wise
• Product-wise
Expense reports
• Category-wise
• Daily
• Monthly
Profit reports
• Gross profit
• Net profit
• Product-wise profit
• Monthly profit
Inventory reports
• Current stock
• Low stock
• Stock value
• Stock movement
Payment reports
• Customer dues
• Supplier dues
• Payment history
22. USER INTERFACE REQUIREMENTS
The interface must be designed for people with limited digital literacy.
Mandatory
• Large buttons
• Large text
• Simple icons
• Clear labels
• High contrast
• Simple navigation
• Minimal typing
• Dropdowns
• Search
• Number inputs
• Confirmation screens
• Clear success messages
• Clear error messages
Avoid:
• Dense tables on mobile
• Tiny buttons
• Technical terminology
• Excessive menus
• Complicated charts
• Unnecessary animations
• Long forms
• Hidden important actions
23. MOBILE DESIGN
The mobile application is extremely important.
Design mobile screens around:
• One major task at a time.
• Large touch targets.
• Minimal typing.
• Simple bottom navigation.
• Clear Home button.
• Large product selection cards.
• Numeric input where appropriate.
Primary mobile navigation:
Home
Sales
Stock
Estimator
More
Secondary modules should be inside "More".
24. VOICE INPUT — FUTURE FEATURE
The architecture should allow future voice interaction.
Example:
User says:
"আজকক ২০ মকক্রজ চাল বিক্রি ককরবছ।"
System proposes:
Transaction: Sale
Product: Rice
Quantity: 20 kg
Before saving:
আপবন বক এই বিক্রিটট সংরক্ষণ্ করকত চান?
[হযাাঁ, সংরক্ষণ্ করুন]
[পবরিততন করুন]
[িাবতল]
Never automatically save uncertain voice interpretations.
Voice input is optional for MVP.
25. OFFLINE / LOW INTERNET
Bangladesh users may have unreliable internet.
The application should:
• Show connection status.
• Preserve unfinished forms where practical.
• Avoid losing entered data.
• Handle failed requests.
• Prevent duplicate submissions.
• Retry safely.
Full offline transaction synchronization may be implemented as a future phase.
Do not claim full offline support unless actually implemented and tested.
26. AUTHENTICATION
Support:
• Sign up
• Login
• Logout
• Password reset
• Session management
Users must only see their own business data.
27. USER ROLES
Minimum roles:
Owner/Admin
Can:
• Manage products
• Manage users
• View reports
• Manage settings
• View financial information
• Edit/cancel important transactions
Staff
Can perform assigned operations such as:
• Sales
• Purchases
• Product lookup
• Customer lookup
Permissions must be configurable where practical.
28. SECURITY REQUIREMENTS
Never:
• Store passwords in plain text.
• Expose secret keys in frontend code.
• Trust user-supplied business IDs.
• Allow one business to access another business's records.
Implement:
• Server-side authorization
• Input validation
• Authentication
• Role-based access control
• Audit logs
• Secure sessions
• Database constraints
• Appropriate API security
• Environment variables for secrets
29. DATABASE
Minimum entities:
Users
Businesses
BusinessMembers
Roles
Products
Categories
Customers
Suppliers
Sales
SaleItems
Purchases
PurchaseItems
InventoryMovements
Expenses
Payments
Invoices
AuditLogs
Settings
Use proper relationships and constraints.
Financial data must use appropriate decimal/numeric handling.
Use database transactions for operations that must remain consistent.
30. IMPORTANT DATA CONSISTENCY RULES
When a sale is completed:
Sale saved
+
Sale items saved
+
Inventory reduced
+
Customer balance updated
+
Payment recorded
+
Reports updated
These related operations should be handled safely as one logical transaction.
When a purchase is completed:
Purchase saved
+
Purchase items saved
+
Inventory increased
+
Supplier balance updated
+
Payment recorded
If something fails, the system must avoid leaving partial/inconsistent financial records.
31. AUDIT LOG
Important actions should be recorded.
Examples:
• Sale created
• Sale cancelled
• Purchase created
• Purchase cancelled
• Payment added
• Stock manually adjusted
• Product price changed
• User permissions changed
Audit information should include:
• User
• Action
• Date/time
• Relevant record
• Reason where applicable
32. WEB APPLICATION
The web application must be:
• Responsive
• Mobile-friendly
• Desktop-friendly
• Fast
• Accessible
• Easy to navigate
Preferred technology:
React
TypeScript
Vite
Tailwind CSS
Node.js
Express
PostgreSQL
Alternative technologies are allowed if there is a strong technical reason.
Do not replace an existing working project without inspecting it first.
33. MOBILE APPLICATION
Preferred technology:
React Native
Expo
TypeScript
The mobile application must use the same backend and database as the web
application.
Do not create a separate isolated database for mobile.
34. API
Backend APIs should be organized logically.
Example:
/auth
/products
/categories
/sales
/purchases
/inventory
/customers
/suppliers
/payments
/expenses
/invoices
/reports
/estimator
/users
/settings
API responses must be consistent.
Validate input on the server.
Never trust only frontend validation.
35. ERROR HANDLING
Errors must be understandable to normal users.
Instead of:
500 Internal Server Error
Show:
িুুঃবখত, তেযটট সংরক্ষণ্ করা যায়বন। আিার মচষ্টা করুন।
Technical details should be logged for developers but not unnecessarily exposed to
normal users.
36. EMPTY STATES
If there is no data:
Do not show a confusing blank page.
Example:
এখকনা মকাকনা পণ্য মযাগ করা হয়বন।
[+ পণ্য মযাগ করুন]
For no sales:
আজ এখকনা মকাকনা বিক্রি হয়বন।
[বিক্রি শুরু করুন]
37. DEMO MODE
Because this product will be demonstrated to investors, create a clearly separated
demo mode or seeded demo dataset.
Demo data must be clearly identifiable.
Example:
DEMO BUSINESS
Never mix demo transactions with real business transactions.
Demo mode should demonstrate:
• Product creation
• Sales
• Purchase
• Stock changes
• Customer dues
• Supplier dues
• Expenses
• Profit
• Estimator
• Reports
• Invoice
38. INVESTOR DEMONSTRATION FLOW
The recommended investor demo should follow this story:
Step 1
Open Dashboard.
Show:
Today's Sales
Today's Expenses
Estimated Profit
Stock Alerts
Customer Dues
Step 2
Add a product.
Example:
Rice
Purchase Price: ৳60/kg
Selling Price: ৳70/kg
Stock: 100 kg
Step 3
Make a sale.
Sell:
20 kg
System automatically:
Stock = 80 kg
Sales = ৳1,400
Step 4
Show customer due.
Step 5
Open estimator.
Ask:
What happens if we buy 500 kg?
System calculates:
Investment
Expected Revenue
Expected Profit
Step 6
Change selling price.
Show the profit changing immediately.
Step 7
Generate invoice.
Step 8
Open report.
Show the transaction reflected automatically.
Step 9
Open the same business on mobile.
Show the same information.
This demonstrates that the system is a connected ERP rather than a simple calculator.
39. TESTING
Critical tests must include:
Sales
• Sale reduces stock.
• Sale calculates total correctly.
• Partial payment calculates due correctly.
Purchase
• Purchase increases stock.
• Supplier payable is correct.
Inventory
• Stock movement is traceable.
• Manual adjustments require a reason.
• Negative stock is prevented unless explicitly enabled.
Estimator
• Estimator calculations are correct.
• Estimator never changes real business data.
Invoice
• Invoice preserves historical prices.
• Invoice totals are correct.
Security
• Users cannot access another business's data.
• Staff permissions are respected.
Duplicate prevention
Repeated requests must not accidentally create duplicate financial transactions.
40. MVP PRIORITY
Do not attempt to build every possible ERP feature at once.
MVP — MUST HAVE
Authentication
Dashboard
Products
Sales
Purchases
Inventory
Customers
Suppliers
Payments
Expenses
Business Estimator
Invoices
Basic Reports
Bangla/English
Responsive Web
Android-first Mobile App
Phase 2
Voice Input
Advanced Analytics
Offline Mode
Automated Notifications
Advanced Role Management
Supplier Recommendations
Advanced Business Forecasting
Future
AI Business Assistant
Demand Forecasting
Automated Reordering
Accounting Integrations
Digital Payment Integrations
Logistics Integration
Multi-branch Management
Advanced Financial Analytics
41. DEVELOPMENT PHASES
PHASE 1 — FOUNDATION
Implement:
• Project architecture
• Database
• Authentication
• User/business structure
• Language system
• Base UI
• Navigation
PHASE 2 — CORE BUSINESS
Implement:
• Products
• Categories
• Customers
• Suppliers
• Sales
• Purchases
• Inventory
PHASE 3 — FINANCIAL MANAGEMENT
Implement:
• Payments
• Customer dues
• Supplier payables
• Expenses
• Profit calculations
• Financial consistency
PHASE 4 — SMART FEATURES
Implement:
• Business Estimator
• What-if calculator
• Scenario comparison
• Low-stock recommendations
PHASE 5 — DOCUMENTS & REPORTS
Implement:
• Invoices
• PDF/print
• Sales reports
• Purchase reports
• Expense reports
• Profit reports
• Inventory reports
PHASE 6 — MOBILE
Implement:
• Android-first mobile application
• Shared backend
• Shared authentication
• Essential mobile workflows
PHASE 7 — QUALITY
Perform:
• Security testing
• Business logic testing
• UI testing
• Mobile testing
• Performance testing
• Error handling
• Data consistency testing
PHASE 8 — INVESTOR DEMO
Prepare:
• Demo business
• Demo products
• Demo transactions
• Investor walkthrough
• Presentation flow
• Documentation
42. FILE AND PROJECT ORGANIZATION
Recommended structure:
mini-erp/
│
├── web/
│   ├── src/
│   ├── public/
│   └── package.json
│
├── mobile/
│   ├── src/
│   └── package.json
│
├── backend/
│   ├── src/
│   └── package.json
│
├── database/
│   ├── migrations/
│   └── seeds/
│
├── shared/
│   ├── types/
│   └── validation/
│
├── tests/
│
├── docs/
│
├── .env.example
├── README.md
├── PROJECT_REQUIREMENTS.md
└── DEVELOPMENT_ROADMAP.md
Adjust this structure if the selected framework has a better established architecture.
Do not create unnecessary duplication.
43. DOCUMENTATION
The project must include:
README.md
Explain:
• Project overview
• Features
• Technology stack
• Installation
• Environment variables
• Database setup
• Running locally
• Testing
• Production build
• Deployment
PROJECT_REQUIREMENTS.md
This document.
DEVELOPMENT_ROADMAP.md
Track:
• Completed features
• Current feature
• Upcoming features
• Known issues
• Future enhancements
API_DOCUMENTATION.md
Document:
• Endpoints
• Request formats
• Response formats
• Authentication
• Error responses
44. AI DEVELOPMENT RULES
When an AI coding agent works on this project:
1. Read this file before making changes.
2. Inspect the existing repository first.
3. Do not delete working features without justification.
4. Do not create fake functionality.
5. Do not hardcode financial values.
6. Do not hardcode dashboard statistics.
7. Use real database data.
8. Keep business logic separate from UI where appropriate.
9. Reuse shared validation and types.
10. Test important changes.
11. Fix errors before moving to another major feature.
12. Maintain existing functionality while adding new functionality.
13. Keep the UI simple.
14. Prioritize usability over feature count.
15. Never claim a feature is complete unless it works.
16. Clearly document incomplete functionality.
17. Never expose secrets.
18. Never compromise financial data consistency.
19. Never mix demo data with real business data.
20. Do not ask unnecessary questions when a reasonable technical decision can be
made.
45. DEFINITION OF DONE
A feature is considered complete only when:
• UI exists.
• UI works on desktop.
• UI works on mobile.
• Backend exists where required.
• Database persistence works.
• Validation exists.
• Error handling exists.
• Loading states exist.
• Empty states exist.
• Business rules work.
• Important calculations are tested.
• Existing functionality remains intact.
• The feature has been manually verified.
The entire MVP is complete only when a non-technical business owner can
successfully:
Login
↓
Add Product
↓
Purchase Product
↓
See Stock Increase
↓
Sell Product
↓
See Stock Decrease
↓
Record Payment
↓
See Customer Due
↓
Add Expense
↓
Calculate Profit
↓
Use Business Estimator
↓
Generate Invoice
↓
View Reports
without requiring knowledge of:
• Excel
• Accounting software
• Databases
• Programming
• ERP terminology
46. FINAL PRODUCT PRINCIPLE
This project must NOT become a complicated ERP filled with features that ordinary
users cannot understand.
The goal is:
Make business management feel as easy as using a calculator.
The system should handle the complexity internally while presenting only the
information and actions the user actually needs.
Final priority order
1. Ease of Use
2. Correct Calculations
3. Reliability
4. Data Consistency
5. Security
6. Mobile Accessibility
7. Useful Automation
8. Advanced Features
Do not sacrifice simplicity for feature count.
The final product should feel like:
"A simple digital assistant for running a business."
not:
"A complicated ERP that requires training."