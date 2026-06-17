UPDATE sm2_generations
SET generation_confidence_score = ROUND(
  (LENGTH(pipeline_data->>'review') - LENGTH(REPLACE(pipeline_data->>'review', '"verdict": "PASS"', '')))::numeric
  / NULLIF(LENGTH('"verdict": "PASS"'), 0)
  / 12.0 * 100
)
WHERE id = '6b6d6120-0c4b-4270-8884-bb6d00b87488'
  AND generation_confidence_score = 0
  AND pipeline_data->>'review' LIKE '%verdict%';