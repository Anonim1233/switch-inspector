-- ═══════════════════════════════════════════════════════════════════════
-- Индексы
--
-- На текущем объёме (около 1650 коммутаторов) выигрыш незаметен, но
-- cabinet_items выбирается при каждом открытии шкафа, а division_mags —
-- при каждой проверке зоны ответственности. Это задел, который дешевле
-- сделать сразу, чем искать причину замедления потом.
-- ═══════════════════════════════════════════════════════════════════════

-- Коммутаторы объекта — самый частый запрос в приложении
CREATE INDEX IF NOT EXISTS switches_mag_idx ON switches (mag);

-- Шкафы объекта и их содержимое
CREATE INDEX IF NOT EXISTS cabinets_mag_idx ON cabinets (mag);
CREATE INDEX IF NOT EXISTS cabinet_items_cabinet_idx ON cabinet_items (cabinet_id);

-- Проверка зоны ответственности — выполняется при каждом запросе
CREATE INDEX IF NOT EXISTS division_mags_mag_idx ON division_mags (mag);
CREATE INDEX IF NOT EXISTS user_divisions_user_idx ON user_divisions (username);

-- Уборка устаревших записей раз в час
CREATE INDEX IF NOT EXISTS oauth_states_expires_idx ON oauth_states (expires_at);
CREATE INDEX IF NOT EXISTS login_attempts_reset_idx ON login_attempts (reset_at);

-- Журнал читается «последние действия» и «действия пользователя»
CREATE INDEX IF NOT EXISTS audit_log_ts_idx ON audit_log (ts DESC);
CREATE INDEX IF NOT EXISTS audit_log_user_idx ON audit_log (username, ts DESC);
