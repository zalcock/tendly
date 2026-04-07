# Requirements Document

## Introduction

Tendly is a government contract matching platform for small businesses. The MVP delivers a focused pilot experience: a business owner signs up, enters their profile once, and Tendly continuously surfaces relevant federal contract opportunities from SAM.gov (via the `fortuitous_pirate/sam-gov-scraper` Apify actor) matched to their NAICS codes, certifications, and location. Users access their matches through a personalized dashboard and receive a daily email digest. The pilot is time-limited to 24 hours of access per user to validate value before a paid tier is introduced.

The codebase already contains: Supabase schema (profiles, companies, opportunities, match_scores, notifications), SAM.gov ingestion via Apify, a matching engine (`lib/matching.ts`), and a digest email system. This spec defines the complete user-facing product layer on top of that infrastructure.

---

## Glossary

- **System**: The Tendly web application (Next.js + Supabase)
- **User**: An authenticated small business owner using Tendly
- **Company_Profile**: The record in the `companies` table associated with a User, containing NAICS codes, certifications, location, and keywords
- **Opportunity**: A government contract posting ingested from SAM.gov or the Apify scraper, stored in the `opportunities` table
- **Match**: A record in `match_scores` linking a Company_Profile to an Opportunity with a computed relevance score (0–100)
- **Dashboard**: The authenticated web page at `/dashboard` where a User views their personalized Matches
- **Digest**: A daily email summarizing new Matches and upcoming deadlines sent to a User
- **Pilot_Window**: The 24-hour period starting from a User's first login during which the User has full access to the System
- **Trial_Expiry**: The moment a User's Pilot_Window ends
- **Ingestion_Run**: A scheduled or manually triggered execution of the SAM.gov scraper that fetches new Opportunities and computes Matches
- **Score_Threshold**: The minimum Match score (default: 40) below which Matches are not surfaced to the User
- **Set_Aside**: A contract restriction targeting specific socio-economic categories (e.g. SDVOSB, 8(a), WOSB, HUBZone)
- **NAICS**: North American Industry Classification System code identifying a business's industry
- **UEI**: Unique Entity Identifier used in SAM.gov registration

---

## Requirements

### Requirement 1: User Registration and Authentication

**User Story:** As a small business owner, I want to create an account and log in securely, so that my profile and matches are private to me.

#### Acceptance Criteria

1. THE System SHALL provide a sign-up page that accepts an email address and password.
2. WHEN a User submits valid sign-up credentials, THE System SHALL create an account via Supabase Auth and redirect the User to the onboarding form.
3. WHEN a User submits sign-up credentials with an email already registered, THE System SHALL display an error message indicating the email is already in use.
4. THE System SHALL provide a login page that accepts an email address and password.
5. WHEN a User submits valid login credentials, THE System SHALL authenticate the User and redirect them to `/dashboard`.
6. IF a User submits invalid login credentials, THEN THE System SHALL display an error message and SHALL NOT redirect the User.
7. THE System SHALL support invite-based access by allowing an admin to pre-create user accounts that receive a sign-up email link.
8. WHILE a User is not authenticated, THE System SHALL redirect any request to `/dashboard` or `/onboard` to the login page.

---

### Requirement 2: Business Profile Onboarding

**User Story:** As a new user, I want to enter my business details once, so that Tendly can find contracts that match my company.

#### Acceptance Criteria

1. WHEN a User completes registration and has no Company_Profile, THE System SHALL redirect the User to the onboarding form before showing the Dashboard.
2. THE Onboarding_Form SHALL collect: company name, at least one NAICS code, state/region (location), socio-economic certifications (SDVOSB, 8(a), WOSB, HUBZone, or none), and optional capability keywords.
3. WHEN a User submits the onboarding form with a company name and at least one NAICS code, THE System SHALL create a Company_Profile and redirect the User to `/dashboard`.
4. IF a User submits the onboarding form without a company name or without at least one NAICS code, THEN THE System SHALL display a validation error and SHALL NOT create a Company_Profile.
5. WHEN a Company_Profile is created, THE System SHALL immediately trigger a Match computation for that Company_Profile against all existing Opportunities in the database.
6. THE System SHALL allow a User to update their Company_Profile from the Dashboard settings at any time during their Pilot_Window.
7. WHEN a User updates their Company_Profile, THE System SHALL recompute Match scores for that Company_Profile against all existing Opportunities.

---

### Requirement 3: Contract Ingestion from SAM.gov via Apify

**User Story:** As a user, I want the platform to automatically pull fresh government contracts, so that I always see current opportunities.

#### Acceptance Criteria

1. THE System SHALL ingest Opportunities from SAM.gov using the `fortuitous_pirate/sam-gov-scraper` Apify actor.
2. WHEN an Ingestion_Run completes, THE System SHALL upsert each fetched Opportunity into the `opportunities` table using `external_id` + `source_id` as the conflict key, updating existing records if the source data has changed.
3. THE System SHALL schedule an Ingestion_Run at least once every 24 hours via a cron trigger.
4. WHEN an Ingestion_Run is triggered, THE System SHALL record a row in `ingestion_runs` with status `STARTED`, and update it to `SUCCESS` or `FAILED` upon completion.
5. IF the Apify actor returns an error or times out, THEN THE System SHALL mark the Ingestion_Run as `FAILED`, record the error in `error_json`, and SHALL NOT delete existing Opportunities.
6. THE System SHALL store for each Opportunity: `title`, `agency`, `naics_code`, `set_aside`, `place_of_performance`, `synopsis`, `posted_at`, `proposals_due_at`, and `sam_or_source_url`.
7. WHEN an Opportunity's `proposals_due_at` is in the past, THE System SHALL retain the Opportunity record but SHALL NOT surface it as an active Match on the Dashboard.

---

### Requirement 4: Contract Matching

**User Story:** As a user, I want to see only contracts relevant to my business, so that I don't waste time on irrelevant listings.

#### Acceptance Criteria

1. WHEN a new Opportunity is ingested or a Company_Profile is updated, THE System SHALL compute a Match score for every Company_Profile against every new or changed Opportunity.
2. THE Matching_Engine SHALL compute scores using the weighted formula: NAICS (40%), Set_Aside eligibility (25%), geography (15%), contract value band (10%), capability keywords (10%).
3. WHEN a Company_Profile's NAICS codes include the Opportunity's `naics_code`, THE Matching_Engine SHALL award 40 points to the Match score.
4. WHEN an Opportunity has a Set_Aside value and the Company_Profile's `socio_economic_certs` includes that value, THE Matching_Engine SHALL award 25 points to the Match score.
5. WHEN an Opportunity has no Set_Aside restriction, THE Matching_Engine SHALL award 12 points (partial credit) to the Match score.
6. WHEN the Opportunity's `place_of_performance` matches a geography in the Company_Profile's `target_geographies`, THE Matching_Engine SHALL award 15 points to the Match score.
7. THE System SHALL only surface Matches with a score at or above the Score_Threshold (40) on the Dashboard.
8. THE System SHALL store each Match in `match_scores` with `company_id`, `opportunity_id`, `score`, and `reasons_json` explaining each scoring contribution.
9. WHEN a Match already exists for a company–opportunity pair, THE System SHALL update the existing record rather than insert a duplicate.

---

### Requirement 5: Personalized Dashboard

**User Story:** As a logged-in user, I want a dashboard that shows my matched contracts, so that I can quickly review and act on relevant opportunities.

#### Acceptance Criteria

1. THE Dashboard SHALL display only the Matches belonging to the authenticated User's Company_Profile.
2. THE Dashboard SHALL display Matches sorted by score descending, with the highest-scoring Matches shown first.
3. FOR each Match, THE Dashboard SHALL display: contract title, agency name, NAICS code, set-aside type (if any), place of performance, contract value (if available), proposal due date, match score, and a link to the original SAM.gov listing.
4. THE Dashboard SHALL visually distinguish Matches whose `proposals_due_at` is within 7 days using a deadline urgency indicator.
5. THE Dashboard SHALL exclude Matches for Opportunities whose `proposals_due_at` has passed.
6. WHEN the User has no Matches above the Score_Threshold, THE Dashboard SHALL display a message explaining that no matches were found and prompting the User to update their profile.
7. THE Dashboard SHALL display the User's company name and active certifications in a profile summary section.
8. WHILE the User's Pilot_Window is active, THE Dashboard SHALL display the remaining time in the Pilot_Window.
9. WHEN the User's Trial_Expiry is reached, THE System SHALL display a paywall screen in place of the Dashboard and SHALL NOT show contract matches.

---

### Requirement 6: 24-Hour Pilot Access Window

**User Story:** As a pilot user, I want free access for 24 hours, so that I can evaluate Tendly before committing to a subscription.

#### Acceptance Criteria

1. THE System SHALL record a `trial_started_at` timestamp on the User's profile at the moment of their first successful login.
2. THE System SHALL compute Trial_Expiry as `trial_started_at + 24 hours`.
3. WHILE the current time is before Trial_Expiry, THE System SHALL grant the User full access to the Dashboard and Digest features.
4. WHEN the current time reaches Trial_Expiry, THE System SHALL replace the Dashboard with a paywall screen informing the User that their trial has ended.
5. THE Paywall_Screen SHALL display a clear call-to-action prompting the User to contact Tendly or join a waitlist for paid access.
6. IF a User attempts to access the `/api/feed/my` endpoint after Trial_Expiry, THEN THE System SHALL return a 403 response with a message indicating the trial has expired.
7. THE System SHALL NOT delete the User's Company_Profile or Match data after Trial_Expiry.

---

### Requirement 7: Daily Email Digest

**User Story:** As a user, I want a daily email summarizing my new matches and upcoming deadlines, so that I stay on top of opportunities without logging in every day.

#### Acceptance Criteria

1. THE System SHALL send a Digest email to each User with at least one new Match (created in the last 24 hours) once per day.
2. THE Digest SHALL include: count of new Matches, a list of up to 10 Matches sorted by score descending, each with title, agency, score, and proposal due date.
3. THE Digest SHALL highlight any Matches whose `proposals_due_at` is within 7 days with a deadline warning.
4. THE Digest SHALL include a link to the Dashboard for each listed Match.
5. WHEN a User has no new Matches in the last 24 hours, THE System SHALL NOT send a Digest to that User.
6. THE System SHALL record each Digest delivery in the `notifications` table with `type = 'daily_digest'` and `sent_at` timestamp.
7. WHILE a User's Trial_Expiry has passed, THE System SHALL NOT send Digest emails to that User.
8. IF the email provider returns a delivery error, THEN THE System SHALL log the error and SHALL NOT retry within the same Digest run.

---

### Requirement 8: Admin Controls

**User Story:** As the platform operator, I want admin tools to manage ingestion, digests, and users, so that I can operate the pilot without a full back-office.

#### Acceptance Criteria

1. THE Admin_Panel SHALL be accessible only to users with a `role` of `OWNER` in the `profiles` table.
2. THE Admin_Panel SHALL display a list of recent Ingestion_Runs with status, record counts, and timestamps.
3. THE Admin_Panel SHALL provide a button to manually trigger an Ingestion_Run.
4. THE Admin_Panel SHALL display a list of recent Digest runs with status, user count, and emails sent.
5. THE Admin_Panel SHALL provide a button to manually trigger a Digest run for all active users.
6. THE Admin_Panel SHALL display a list of registered users with their company name, trial start time, and Trial_Expiry.
7. WHEN an admin manually triggers an Ingestion_Run or Digest run, THE System SHALL require a valid `CRON_SECRET` bearer token in the request header.
