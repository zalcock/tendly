Plan: Implement daily digest emails and scheduling

Problem
- Provide a daily digest email to small-business users summarizing new matches and urgent deadlines so Tendly delivers tangible, recurring value.

Approach
- Build a server-side job that computes per-user digests from match_scores and opportunities, sends emails via a provider (Resend) or mock mode, and records delivery status.
- Expose a manual POST endpoint to run the digest and an admin UI button for manual runs.
- Schedule a daily cron (Vercel or host) to POST the endpoint with CRON_SECRET.

Todos
1. Add plan and tracking (this file).
2. Create src/lib/email/sender.ts that supports mock and Resend (env: RESEND_API_KEY, RESEND_FROM).
3. Create src/lib/digest/generateDigest.ts that:
   - Queries users with profiles and unread/new match_scores since last_digest_at (or last 24h)
   - Compiles digest summary (new matches, upcoming deadlines within 7 days, count totals)
   - Writes digest entries to notifications table and updates users' last_digest_at
4. Create app/api/digest/run/route.ts (POST) protected by CRON_SECRET to run the digest for all users or a single user (query param user_id)
5. Add admin UI component src/components/RunDigestButton.tsx and page app/admin/digest/page.tsx to view runs and trigger manual runs.
6. Add supabase/migrations/003_digest_runs.sql to create digest_runs table for auditing (run_id, started_at, finished_at, status, total_users, emails_sent, error_json).
7. Add tests for generateDigest logic (unit test for matching->digest mapping) and an integration test running API endpoint in mock mode.
8. Document environment vars and deployment steps in README.md (RESEND_API_KEY, RESEND_FROM, CRON_SECRET).

Notes & considerations
- Use service role key for DB writes only on server — keep secrets out of client bundles.
- Support mock mode if RESEND_API_KEY absent for local testing; log emails to ingestion_runs/email_logs.
- For scaling, compute digests in batches and queue emails (future work: background worker with Bull/Redis or serverless queues).

Next step after confirm: implement migrations, email sender, digest generator, run endpoint, admin UI, and tests.
