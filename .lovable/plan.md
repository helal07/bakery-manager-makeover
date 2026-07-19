## সমস্যা
- Customers list-এর **View** এবং **Ledger** action দুটোই একই route `/crm/$id`-এ যায় — তাই "View" চাপলে কিছু নতুন হচ্ছে না বলে মনে হয়।
- বর্তমান detail page একটা সংক্ষিপ্ত ledger + purchase history দেখায়, কিন্তু Ultimate POS-এর মতো পূর্ণ **date-wise ledger** নেই।
- Action menu-তে **Receive Payment** option নেই — due collect করার জন্য আলাদা জায়গায় যেতে হয়।

## যা করব

### ১. Action menu আলাদা করা (`crm.tsx`)
- **View** → নতুন route `/crm/$id` (customer profile + summary + recent activity, বর্তমান পেজের সংক্ষিপ্ত রূপ)।
- **Ledger** → নতুন route `/crm/$id/ledger` (Ultimate POS ধাঁচের পূর্ণ ledger)।
- **Receive Payment** → নতুন dropdown item যা inline dialog খোলে (amount, method, note, optional sale reference)। Save হলে `customer_payments` টেবিলে insert হবে এবং list refresh হবে।

### ২. নতুন Ledger পেজ (`src/routes/_authenticated/crm.$id.ledger.tsx`)
Ultimate POS Customer Ledger style:
- Header: customer name, phone, opening balance, current due, total business, total paid — বড় summary cards।
- Filter bar: date range (from-to), type (All / Sales / Payments / Returns), showroom filter, "Print" ও "Export CSV" button।
- Ledger table columns: **Date · Reference (Invoice # / Payment #) · Type · Details · Debit (charge) · Credit (paid) · Running Balance**।
- প্রতিটি Sale row-এ invoice link (`/invoice/$id`) থাকবে; প্রতিটি Payment row-এ receipt link/print icon।
- Footer: Total Debit, Total Credit, Closing Balance।
- Top-right **Receive Payment** button যা একই dialog reuse করে।

### ৩. Receive Payment dialog (`src/components/receive-payment-dialog.tsx`)
- Fields: Amount (required), Payment method (Cash / Card / bKash / Bank), Paid on (date, default today), Note, Sale reference dropdown (customer-এর due সেলগুলো থেকে optional select)।
- Insert into `customer_payments` with `customer_id`, `customer_phone`, `amount`, `method`, `paid_on`, `note`, `sale_id` (nullable)। যদি একটা নির্দিষ্ট sale-এর against payment হয়, সেই sale-এর `paid`/`due` update হবে।
- Toast + parent refresh।

### ৪. View পেজ trim
বর্তমান `crm.$id.tsx` থেকে ledger table বাদ দিয়ে শুধু profile + stat cards + সর্বশেষ ৫টা invoice রাখব; পূর্ণ ledger দেখতে "Open full ledger" button।

## Technical notes
- Data fetch: sales + customer_payments — phone digits ও `customer_id` দুটো দিয়েই match (বর্তমান pattern অনুযায়ী)।
- কোনো schema change লাগবে না — `customer_payments` টেবিলে ইতিমধ্যেই সব field আছে। তাই এবার কোনো `sql/NN_*.sql` migration file লাগবে না।
- Cache/localStorage settings unchanged।

## Deliverables
- Modified: `src/routes/_authenticated/crm.tsx`, `src/routes/_authenticated/crm.$id.tsx`
- New: `src/routes/_authenticated/crm.$id.ledger.tsx`, `src/components/receive-payment-dialog.tsx`
