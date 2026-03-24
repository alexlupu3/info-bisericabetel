-- Migrate legacy data.date field to data.startDate for card items.
-- Cards that already have startDate keep it; cards with only the legacy date
-- field get it promoted to startDate. Either way, the legacy date key is removed.

UPDATE content_items
SET data =
  CASE
    WHEN data->>'startDate' IS NULL
      THEN jsonb_set(data, '{startDate}', data->'date') - 'date'
    ELSE
      data - 'date'
  END
WHERE type = 'card'
  AND data ? 'date';
