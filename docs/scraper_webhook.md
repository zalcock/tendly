Tendly scraper webhook

Overview
This endpoint lets your scraper (Apify or custom) push scraped listings into Tendly's database in real-time.

Endpoint
POST /api/ingest/scraper/webhook

Headers
- Content-Type: application/json
- x-scraper-secret: <shared-secret>  (required if SCRAPER_WEBHOOK_SECRET is set in Tendly env; optional in dev if unset)

Payload
The request body should be JSON. Prefer wrapping items in an "items" array. Minimal recommended fields per item:

{
  "items": [
    {
      "id": "SCRAPER-001",
      "title": "HVAC maintenance services",
      "agency": "Dept of Facilities",
      "naics": "238220",
      "type": "RFP",
      "setAside": "WOSB",
      "placeOfPerformance": "Texas",
      "value_min": 250000,
      "description": "Full description or HTML",
      "posted_at": "2026-04-01T12:00:00Z",
      "proposals_due_at": "2026-04-10T12:00:00Z",
      "url": "https://source.example/opp/SCRAPER-001"
    }
  ]
}

Behavior
- Tendly maps item fields to the opportunities table and upserts by external_id + source_id (so include a stable id to avoid duplicates).
- After inserting opportunities, Tendly runs matching against existing companies and upserts match_scores.
- The API responds with summary: { ok: true, result: { total, inserted, skipped, errorOccurred, errorDetails } }

Testing locally (PowerShell)
$body = @{ items = @(@{ id='SCRAPER-001'; title='Test Title'; agency='City Works'; naics='238220'; type='RFP'; setAside='WOSB'; placeOfPerformance='TX'; value_min=10000; description='x'; posted_at=(Get-Date).ToString('o'); proposals_due_at=(Get-Date).AddDays(7).ToString('o'); url='https://example/1' }) } | ConvertTo-Json -Depth 5
Invoke-RestMethod -Uri 'http://localhost:3000/api/ingest/scraper/webhook' -Method POST -Body $body -ContentType 'application/json' -Headers @{ 'x-scraper-secret'='your_shared_secret' }

Testing with curl
curl -X POST 'https://your-host.example/api/ingest/scraper/webhook' \
  -H 'Content-Type: application/json' \
  -H 'x-scraper-secret: your_shared_secret' \
  -d @sample.json

Production notes
- Always use HTTPS.
- Configure your scraper to retry on non-2xx responses.
- For large outputs, send a storage URL or batch in multiple smaller requests.
- Set SCRAPER_WEBHOOK_SECRET in Tendly env for production and configure the same header in your scraper.

Support
If you want, I can: (a) test with a sample JSON you paste, (b) run a temporary tunnel (ngrok) to test from Apify, or (c) enable HMAC signature verification. Let me know.