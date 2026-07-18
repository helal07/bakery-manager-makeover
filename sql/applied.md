# Applied Migrations Checklist

সেলফ-হোস্টেড Supabase-এ কোন ফাইলগুলো চালানো হয়েছে সেটা এখানে tick করে রাখুন।

## Baseline

- [x] `sql/00_baseline.sql` — কোডের সাথে aligned schema (units.code+is_active + user_profiles bio/language/timezone/software included)
- [ ] `sql/01_seed.sql` — (optional) demo data

## Incremental patches

`00_baseline.sql`-এর পরে যদি নতুন patch ফাইল যোগ হয়, এখানে line add করুন।

<!-- format:
- [ ] sql/NN_slug.sql — সংক্ষিপ্ত বর্ণনা
-->

- [ ] _(নতুন patch এখানে যোগ করুন)_
