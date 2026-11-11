-- Lista del sábado 2026-11-07 (una sola vez vía app_meta).
-- Canciones en tono original en el catálogo; semitones llevan la lista a F# / B / B.
-- Aquí como en el cielo D→F# (+4), Padre Nuestro G→B (+4), Yeshua D→B (+9).
-- Si la lista anterior ya pasó su service_date, entra al historial antes del replace.

INSERT INTO day_list_history (id, weekday, service_date, position)
SELECT
  'historial-6-' || s.service_date,
  6,
  s.service_date,
  COALESCE((SELECT MAX(position) FROM day_list_history), -1) + 1
FROM setlists s
WHERE s.id = 'servicio-6'
  AND s.service_date IS NOT NULL
  AND date('now') > s.service_date
  AND EXISTS (SELECT 1 FROM setlist_items i WHERE i.setlist_id = s.id)
  AND NOT EXISTS (SELECT 1 FROM day_list_history h WHERE h.id = 'historial-6-' || s.service_date)
  AND NOT EXISTS (SELECT 1 FROM app_meta WHERE key = 'saturday_list_2026_11_07');

INSERT INTO day_list_history_items (history_id, position, song_id, semitones)
SELECT
  'historial-6-' || s.service_date,
  i.position,
  i.song_id,
  i.semitones
FROM setlists s
JOIN setlist_items i ON i.setlist_id = s.id
WHERE s.id = 'servicio-6'
  AND s.service_date IS NOT NULL
  AND date('now') > s.service_date
  AND EXISTS (SELECT 1 FROM day_list_history h WHERE h.id = 'historial-6-' || s.service_date)
  AND NOT EXISTS (
    SELECT 1 FROM day_list_history_items hi WHERE hi.history_id = 'historial-6-' || s.service_date
  )
  AND NOT EXISTS (SELECT 1 FROM app_meta WHERE key = 'saturday_list_2026_11_07');

DELETE FROM setlist_items
WHERE setlist_id = 'servicio-6'
  AND NOT EXISTS (SELECT 1 FROM app_meta WHERE key = 'saturday_list_2026_11_07');

INSERT INTO setlist_items (setlist_id, position, song_id, semitones)
SELECT 'servicio-6', 0, 'charts/Aquí como en el cielo - Elevation Worship', 4
WHERE NOT EXISTS (SELECT 1 FROM app_meta WHERE key = 'saturday_list_2026_11_07');

INSERT INTO setlist_items (setlist_id, position, song_id, semitones)
SELECT 'servicio-6', 1, 'charts/Padre Nuestro - Marcos Brunet', 4
WHERE NOT EXISTS (SELECT 1 FROM app_meta WHERE key = 'saturday_list_2026_11_07');

INSERT INTO setlist_items (setlist_id, position, song_id, semitones)
SELECT 'servicio-6', 2, 'charts/Yeshua - Marcos Brunet', 9
WHERE NOT EXISTS (SELECT 1 FROM app_meta WHERE key = 'saturday_list_2026_11_07');

UPDATE setlists
SET service_date = '2026-11-07'
WHERE id = 'servicio-6'
  AND NOT EXISTS (SELECT 1 FROM app_meta WHERE key = 'saturday_list_2026_11_07');

INSERT OR IGNORE INTO app_meta (key, value) VALUES ('saturday_list_2026_11_07', '1');
