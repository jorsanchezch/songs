-- Lista del miércoles 2026-11-11 (una sola vez vía app_meta).
-- Canciones en tono original en el catálogo; semitones llevan la lista a C / Bb / Bb.
-- Nada Más C→C (0), No hay lugar más alto A→Bb (+1), Vine a adorarte D→Bb (-4).

DELETE FROM setlist_items
WHERE setlist_id = 'servicio-3'
  AND NOT EXISTS (SELECT 1 FROM app_meta WHERE key = 'wednesday_list_2026_11_11');

INSERT INTO setlist_items (setlist_id, position, song_id, semitones)
SELECT 'servicio-3', 0, 'charts/Nada Más (Nothing Else) - Cody Carnes', 0
WHERE NOT EXISTS (SELECT 1 FROM app_meta WHERE key = 'wednesday_list_2026_11_11');

INSERT INTO setlist_items (setlist_id, position, song_id, semitones)
SELECT 'servicio-3', 1, 'charts/No hay lugar más alto - Miel San Marcos', 1
WHERE NOT EXISTS (SELECT 1 FROM app_meta WHERE key = 'wednesday_list_2026_11_11');

INSERT INTO setlist_items (setlist_id, position, song_id, semitones)
SELECT 'servicio-3', 2, 'charts/Vine a adorarte - Marcela Gandara', -4
WHERE NOT EXISTS (SELECT 1 FROM app_meta WHERE key = 'wednesday_list_2026_11_11');

UPDATE setlists
SET service_date = '2026-11-11'
WHERE id = 'servicio-3'
  AND NOT EXISTS (SELECT 1 FROM app_meta WHERE key = 'wednesday_list_2026_11_11');

INSERT OR IGNORE INTO app_meta (key, value) VALUES ('wednesday_list_2026_11_11', '1');
