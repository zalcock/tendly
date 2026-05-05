-- Add EU_TENDER and US_SAM as explicit source types
-- US_SAM replaces the generic APIFY for the SAM.gov actor
ALTER TABLE public.opportunity_sources
  DROP CONSTRAINT opportunity_sources_type_check;

ALTER TABLE public.opportunity_sources
  ADD CONSTRAINT opportunity_sources_type_check
  CHECK (type IN ('SAM', 'STATE', 'LOCAL', 'APIFY', 'US_SAM', 'EU_TENDER'));

-- Add region column to opportunities for filtering US vs EU
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'US'
  CHECK (region IN ('US', 'EU', 'OTHER'));

-- Add cpv_code column for EU Common Procurement Vocabulary codes (analogous to NAICS for EU)
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS cpv_code text;

-- Add buyer_country for EU tenders
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS buyer_country text;

-- Index for region filtering on dashboard
CREATE INDEX IF NOT EXISTS idx_opportunities_region ON public.opportunities(region);

-- Seed the EU Tenders source (TED — Tenders Electronic Daily via Apify)
INSERT INTO public.opportunity_sources (type, name, base_url, api_endpoint)
VALUES (
  'EU_TENDER',
  'TED EU Tenders (Apify)',
  'https://ted.europa.eu',
  'https://api.apify.com/v2/acts/eprocurement~eu-tenders-scraper/run-sync-get-dataset-items'
)
ON CONFLICT DO NOTHING;

-- Rename the existing APIFY source to US_SAM for clarity
UPDATE public.opportunity_sources
  SET type = 'US_SAM', name = 'SAM.gov (Apify)'
  WHERE type = 'APIFY';
