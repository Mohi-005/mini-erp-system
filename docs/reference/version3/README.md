# হিসাব — Mini ERP frontend demo

A responsive, Bangla-first shop-management concept. Open `dist/index.html` in a browser, or serve `dist` with a local static HTTP server. No dependency installation or build is required.

Included: dashboard, sample sales with review/confirmation, stock updates, partial-payment customer dues, purchases/restocking, product entry/search, customer payment collection, expense recording, profit reports, live estimator, invoices with browser print/save-to-PDF, language switching, mobile navigation, and reset.

This is a frontend demonstration, not the production ERP. Records are sample data held in browser localStorage; they are not shared across devices. No authentication, server authorization, actual payment processing, refunds/returns, or production accounting engine is connected. The dashboard’s last-seven-day sales chart and daily sales, profit, and expense figures are calculated from dated records saved in this browser. Older records without dates remain in the transaction history but are excluded from day-specific figures. The profile is a sample Owner view. Do not enter real customer or business records.

Fonts use Google Fonts when available and system fallbacks otherwise. The app itself uses no external JavaScript libraries. Sales preserve price/cost values for demo reporting. Customer payments settle demo invoices before remaining opening balances; this simplified behavior is not the production allocation specification.

Suggested walkthrough: switch language → open Sales → add rice → enter partial payment and choose Rahim Store → review and confirm → inspect invoice → visit stock/customer dues/reports → try the estimator → reset demo.
