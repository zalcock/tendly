-- Allow APIFY as a valid source type
alter table public.opportunity_sources
  drop constraint opportunity_sources_type_check;

alter table public.opportunity_sources
  add constraint opportunity_sources_type_check
  check (type in ('SAM','STATE','LOCAL','APIFY'));

-- Seed the Apify source row
insert into public.opportunity_sources (type, name, base_url)
values ('APIFY', 'Apify SAM Scraper', 'https://apify.com');
