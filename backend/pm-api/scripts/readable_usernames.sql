-- Demo only: give every sample person without a fixed username a short, readable one (first four letters of the first
-- name plus 01, 02, ...), so nothing has to be copied from a one-time dialog. The people with fixed names are skipped.
WITH others AS (
    SELECT id, left(lower(regexp_replace(split_part(name, ' ', 1), '[^A-Za-z]', '', 'g')), 4) AS prefix
    FROM users
    WHERE email LIKE '%@demo.acme.example'
      AND username NOT IN ('maria1', 'james1', 'alex01', 'priya1', 'tom001', 'lena01', 'omar01', 'sofia1', 'nina01')
), numbered AS (
    SELECT id, prefix, row_number() OVER (PARTITION BY prefix ORDER BY id) AS n FROM others
)
UPDATE users u SET username = numbered.prefix || lpad(numbered.n::text, 2, '0')
FROM numbered WHERE u.id = numbered.id;
