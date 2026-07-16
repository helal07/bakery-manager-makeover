# Legacy Migrations (Archived)

এই ফোল্ডারের `MIGRATIONS_part1.sql` … `MIGRATIONS_part13_stock_onconflict_fix.sql` ফাইলগুলো **আর ব্যবহার হবে না**।

কারণ:
- Cloud-এ schema বেশ কয়েকবার evolve হয়েছে, ফলে পুরনো part-ফাইল-গুলো current schema-এর সাথে আর match করে না (column not found ইত্যাদি error দেয়)।
- Self-hosted setup-এর একমাত্র উৎস এখন `sql/00_baseline.sql`, যেটা current Lovable Cloud DB থেকে সরাসরি generate করা।

## নতুন সেটআপের জন্য কী করবেন?

`sql/README.md` দেখুন — শুধু `sql/00_baseline.sql` (+ optional `sql/01_seed.sql`) চালালেই হবে।

## এখানকার ফাইল রাখা হয়েছে কেন?

শুধু historical reference-এর জন্য — কখন কোন change হয়েছিল সেটা future debugging-এ কাজে লাগতে পারে। **কোনো নতুন environment-এ চালাবেন না।**
