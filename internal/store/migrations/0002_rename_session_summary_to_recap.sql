-- +goose Up
UPDATE sessions
SET metadata = json_remove(
    CASE
        WHEN json_type(metadata, '$.recap') IS NULL
            THEN json_set(metadata, '$.recap', json_extract(metadata, '$.summary'))
        ELSE metadata
    END,
    '$.summary'
)
WHERE metadata IS NOT NULL
  AND json_valid(metadata)
  AND json_type(metadata, '$.summary') IS NOT NULL;

-- +goose Down
UPDATE sessions
SET metadata = json_remove(
    CASE
        WHEN json_type(metadata, '$.summary') IS NULL
            THEN json_set(metadata, '$.summary', json_extract(metadata, '$.recap'))
        ELSE metadata
    END,
    '$.recap'
)
WHERE metadata IS NOT NULL
  AND json_valid(metadata)
  AND json_type(metadata, '$.recap') IS NOT NULL;
