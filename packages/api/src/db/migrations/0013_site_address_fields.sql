-- Structured site address for schema.org Church / Event location markup (spec 03 T8, FR-068).
-- All nullable and backward compatible; the free-text `address` stays the display label
-- and the PostalAddress.streetAddress fallback.
ALTER TABLE sites ADD COLUMN IF NOT EXISTS street_address   TEXT;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS postal_code      TEXT;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS address_locality TEXT;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS address_region   TEXT;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS address_country  TEXT;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS latitude         DOUBLE PRECISION;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS longitude        DOUBLE PRECISION;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS telephone        TEXT;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS email            TEXT;
