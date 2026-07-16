# Applied Migrations Checklist

সেলফ-হোস্টেড Supabase-এ কোন ফাইলগুলো চালানো হয়েছে সেটা এখানে tick করে রাখুন।

## Baseline

- [ ] `sql/00_baseline.sql` — প্রথমবার schema setup
- [ ] `sql/01_seed.sql` — (optional) demo data

## Migrations (chronological)

`supabase/migrations/` ফোল্ডার থেকে নতুন ফাইল যোগ হলে এখানে line add করুন — filename-এর timestamp অনুসারে ascending order-এ।

<!-- ফরম্যাট:
- [ ] supabase/migrations/YYYYMMDDHHMMSS_slug.sql — সংক্ষিপ্ত বর্ণনা
-->

- [ ] _(নতুন migration এখানে যোগ করুন)_
