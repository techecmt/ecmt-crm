-- Backfill college_id on website leads created before ingest set it.
-- Inference order: URL hints (malaysia/lumax/wsq/cert), course catalog, edusphere fallback.

WITH course_college AS (
  SELECT lower(trim(course)) AS course_key, c.id AS college_id, c.name AS college_name
  FROM public.colleges c
  CROSS JOIN LATERAL unnest(coalesce(c.courses, ARRAY[]::text[])) AS course
  WHERE trim(course) <> ''
  UNION
  SELECT lower(trim(l.interested_course)), l.college_id, c.name
  FROM public.leads l
  JOIN public.colleges c ON c.id = l.college_id
  WHERE l.college_id IS NOT NULL
    AND l.interested_course IS NOT NULL
    AND trim(l.interested_course) <> ''
),
lead_context AS (
  SELECT
    l.id,
    l.interested_course,
    l.description,
    concat_ws(
      ' ',
      substring(l.description FROM 'Source URL: (https?://[^\n]+)'),
      (
        SELECT cr.source_url
        FROM public.callback_requests cr
        WHERE cr.lead_id = l.id
        ORDER BY cr.created_at DESC
        LIMIT 1
      ),
      (
        SELECT cv.source_url
        FROM public.conversations cv
        WHERE cv.lead_id = l.id
          AND cv.channel = 'website'
        ORDER BY cv.created_at DESC
        LIMIT 1
      )
    ) AS url_blob
  FROM public.leads l
  WHERE l.source = 'website'
    AND l.college_id IS NULL
),
resolved AS (
  SELECT
    lc.id,
    COALESCE(
      CASE
        WHEN lc.url_blob ~* 'malaysia'
          THEN (SELECT id FROM public.colleges WHERE name = 'Edusphere Academy - Malaysia' LIMIT 1)
      END,
      CASE
        WHEN lc.url_blob ~* 'lumax'
          THEN (SELECT id FROM public.colleges WHERE name = 'Lumax Academy' LIMIT 1)
      END,
      CASE
        WHEN lc.url_blob ~* 'wsq'
          THEN (SELECT id FROM public.colleges WHERE name = 'Edusphere WSQ' LIMIT 1)
      END,
      CASE
        WHEN coalesce(lc.description, '') ~* 'Course Type:\s*Certificate'
          OR lc.url_blob ~* 'certificate-courses-in-singapore|/certificate-'
          THEN (SELECT id FROM public.colleges WHERE name = 'Edusphere College - Cert' LIMIT 1)
      END,
      (
        SELECT cc.college_id
        FROM course_college cc
        WHERE cc.course_key = lower(trim(lc.interested_course))
        ORDER BY
          CASE cc.college_name
            WHEN 'Edusphere College' THEN 1
            WHEN 'Edusphere College - Cert' THEN 2
            WHEN 'Edusphere Academy - Malaysia' THEN 3
            WHEN 'Lumax Academy' THEN 4
            ELSE 5
          END
        LIMIT 1
      ),
      CASE
        WHEN lc.url_blob ~* 'edusphere'
          THEN (SELECT id FROM public.colleges WHERE name = 'Edusphere College' LIMIT 1)
      END
    ) AS new_college_id
  FROM lead_context lc
)
UPDATE public.leads l
SET
  college_id = r.new_college_id,
  updated_at = now()
FROM resolved r
WHERE l.id = r.id
  AND r.new_college_id IS NOT NULL
  AND l.college_id IS NULL;
