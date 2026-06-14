# Supabase votes setup

This is the lightweight AIDAS shared-password version. The password gate runs in the browser, so it is for internal coordination, not strong authentication.

## 1. Create table and view

Run this in the Supabase SQL editor:

```sql
create table if not exists paper_votes (
  paper_id text not null,
  voter_name text not null,
  created_at timestamptz not null default now(),
  primary key (paper_id, voter_name)
);

create or replace view paper_vote_counts as
select paper_id, count(*)::int as votes
from paper_votes
group by paper_id;

create table if not exists feedback_posts (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  voter_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists paper_comments (
  id uuid primary key default gen_random_uuid(),
  paper_id text not null,
  message text not null,
  voter_name text not null,
  created_at timestamptz not null default now()
);
```

## 2. Enable simple anonymous policies

For the shared-password prototype, the frontend uses the Supabase anon key directly. Enable RLS, then allow public reads and controlled insert/delete shape:

```sql
alter table paper_votes enable row level security;

drop policy if exists "read votes" on paper_votes;
create policy "read votes"
on paper_votes for select
to anon, authenticated
using (true);

drop policy if exists "insert votes" on paper_votes;
create policy "insert votes"
on paper_votes for insert
to anon, authenticated
with check (
  length(paper_id) > 0
  and length(voter_name) between 1 and 80
);

drop policy if exists "delete votes" on paper_votes;
create policy "delete votes"
on paper_votes for delete
to anon, authenticated
using (true);

alter table feedback_posts enable row level security;

drop policy if exists "read feedback" on feedback_posts;
create policy "read feedback"
on feedback_posts for select
to anon, authenticated
using (true);

drop policy if exists "insert feedback" on feedback_posts;
create policy "insert feedback"
on feedback_posts for insert
to anon, authenticated
with check (
  length(message) between 1 and 500
  and length(voter_name) between 1 and 80
);

drop policy if exists "update feedback" on feedback_posts;
create policy "update feedback"
on feedback_posts for update
to anon, authenticated
using (true)
with check (
  length(message) between 1 and 500
  and length(voter_name) between 1 and 80
);

drop policy if exists "delete feedback" on feedback_posts;
create policy "delete feedback"
on feedback_posts for delete
to anon, authenticated
using (true);

alter table paper_comments enable row level security;

drop policy if exists "read paper comments" on paper_comments;
create policy "read paper comments"
on paper_comments for select
to anon, authenticated
using (true);

drop policy if exists "insert paper comments" on paper_comments;
create policy "insert paper comments"
on paper_comments for insert
to anon, authenticated
with check (
  length(paper_id) > 0
  and length(message) between 1 and 500
  and length(voter_name) between 1 and 80
);

drop policy if exists "update paper comments" on paper_comments;
create policy "update paper comments"
on paper_comments for update
to anon, authenticated
using (true)
with check (
  length(paper_id) > 0
  and length(message) between 1 and 500
  and length(voter_name) between 1 and 80
);

drop policy if exists "delete paper comments" on paper_comments;
create policy "delete paper comments"
on paper_comments for delete
to anon, authenticated
using (true);
```

This is intentionally permissive because the prototype has no real user identity. For stronger security, move vote writes behind a Supabase Edge Function or Cloudflare Worker that validates the shared password server-side.

## 3. Configure the site

Edit `papers/supabase-config.js`:

```js
window.AIDAS_SUPABASE_CONFIG = {
  url: "https://YOUR_PROJECT.supabase.co",
  anonKey: "YOUR_SUPABASE_ANON_KEY",
  sharedPassword: "aidas12!@",
};
```

The anon key is safe to publish when RLS policies are correct. Do not put a service-role key in frontend code.
