-- ═══════════════════════════════════════════════════════════════════════
-- Ограничения целостности
--
-- ВНИМАНИЕ: выполнять ТОЛЬКО после проверки данных запросами из
-- файла 04-check-before-constraints.sql. Если в базе есть записи,
-- ссылающиеся на несуществующие, команды завершатся ошибкой.
--
-- Сейчас целостность поддерживается только кодом приложения. При
-- нескольких репликах и прямом доступе к базе этого недостаточно.
-- ═══════════════════════════════════════════════════════════════════════

-- Позиции удаляются вместе со шкафом
ALTER TABLE cabinet_items
  ADD CONSTRAINT cabinet_items_cabinet_fk
  FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE CASCADE;

-- Зона ответственности исчезает вместе с пользователем или дивизионом
ALTER TABLE user_divisions
  ADD CONSTRAINT user_divisions_user_fk
  FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE;

ALTER TABLE user_divisions
  ADD CONSTRAINT user_divisions_division_fk
  FOREIGN KEY (div_name) REFERENCES divisions(name) ON DELETE CASCADE;

ALTER TABLE division_mags
  ADD CONSTRAINT division_mags_division_fk
  FOREIGN KEY (div_name) REFERENCES divisions(name) ON DELETE CASCADE;

-- Заметки и отметки удаляются вместе с коммутатором
ALTER TABLE notes
  ADD CONSTRAINT notes_switch_fk
  FOREIGN KEY (mag, sw) REFERENCES switches(mag, sw) ON DELETE CASCADE;

ALTER TABLE statuses
  ADD CONSTRAINT statuses_switch_fk
  FOREIGN KEY (mag, sw) REFERENCES switches(mag, sw) ON DELETE CASCADE;

-- ── Проверки значений ─────────────────────────────────────────────────
-- Сейчас корректность роли проверяется только в коде приложения.

ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('viewer', 'admin', 'developer'));

ALTER TABLE cabinet_items
  ADD CONSTRAINT cabinet_items_unit_check
  CHECK (unit > 0);

ALTER TABLE oauth_states
  ADD CONSTRAINT oauth_states_status_check
  CHECK (status IN ('pending', 'processing', 'done', 'error'));
