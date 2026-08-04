-- ═══════════════════════════════════════════════════════════════════════
-- Проверка перед добавлением ограничений
--
-- Выполнить ДО файла 03-constraints.sql. Если любой запрос вернёт
-- значение больше нуля — эти записи нужно разобрать, иначе добавление
-- связей завершится ошибкой.
--
-- Ничего не изменяет, только показывает.
-- ═══════════════════════════════════════════════════════════════════════

SELECT 'Позиции шкафов без шкафа' AS проверка, COUNT(*) AS найдено
FROM cabinet_items ci
LEFT JOIN cabinets c ON c.id = ci.cabinet_id
WHERE c.id IS NULL

UNION ALL SELECT 'Зона ответственности с несуществующим пользователем', COUNT(*)
FROM user_divisions ud
LEFT JOIN users u ON u.username = ud.username
WHERE u.username IS NULL

UNION ALL SELECT 'Зона ответственности с несуществующим дивизионом', COUNT(*)
FROM user_divisions ud
LEFT JOIN divisions d ON d.name = ud.div_name
WHERE d.name IS NULL

UNION ALL SELECT 'Объекты в несуществующем дивизионе', COUNT(*)
FROM division_mags dm
LEFT JOIN divisions d ON d.name = dm.div_name
WHERE d.name IS NULL

UNION ALL SELECT 'Заметки к несуществующим коммутаторам', COUNT(*)
FROM notes n
LEFT JOIN switches s ON s.mag = n.mag AND s.sw = n.sw
WHERE s.mag IS NULL

UNION ALL SELECT 'Отметки к несуществующим коммутаторам', COUNT(*)
FROM statuses st
LEFT JOIN switches s ON s.mag = st.mag AND s.sw = st.sw
WHERE s.mag IS NULL

UNION ALL SELECT 'Недопустимые роли пользователей', COUNT(*)
FROM users
WHERE role NOT IN ('viewer', 'admin', 'developer')

UNION ALL SELECT 'Позиции с некорректным номером юнита', COUNT(*)
FROM cabinet_items
WHERE unit <= 0;
