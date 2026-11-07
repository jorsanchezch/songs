-- Lista del sábado 2026-11-07 (una sola vez vía app_meta).
-- Canciones en tono original en el catálogo; semitones llevan la lista a F# / B / B.
-- Aquí como en el cielo D→F# (+4), Padre Nuestro G→B (+4), Yeshua D→B (+9).

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
