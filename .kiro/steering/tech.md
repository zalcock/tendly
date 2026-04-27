# Tech Steering: Tendly

## Stack Selection & Rationale
* **Frontend:** Next.js (App Router). Chosen for SEO (landing pages) and high-performance dashboarding via React Server Components.
* **Backend:** FastAPI (Python).
    * *Rationale:* Government data often requires heavy cleaning and NLP processing. Python's `pandas` and `scikit-learn` ecosystems are better suited for matching logic than Node.js.
* **Database & Auth:** Supabase (PostgreSQL).
    * *Rationale:* Provides robust Auth and Row Level Security (RLS), allowing for rapid scaling while maintaining strict data isolation between competing businesses.
* **Search/Vector:** pgvector (via Supabase). Used for semantic search across contract descriptions.

## Data Ingestion Strategy
* **Resilience:** All API calls to government endpoints must be wrapped in exponential backoff retry logic (using `tenacity` in Python).
* **Caching:** Contract data is cached in Redis for 1 hour to reduce latency and API rate-limiting hits.

## Security & Compliance
* **PII Encryption:** Business owner data must be encrypted at rest.
* **Audit Logs:** Every "Bid Download" or "Profile Change" must be logged for compliance tracking.
* **Sanitization:** Strict input validation on search queries to prevent injection in complex SQL/Vector filters.

## Performance Targets
* **Search Latency:** < 500ms for keyword queries.
* **Mobile Score:** > 90 on Lighthouse (critical for busy owners on the go).