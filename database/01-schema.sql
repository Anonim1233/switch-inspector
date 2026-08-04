-- ═══════════════════════════════════════════════════════════════════════
-- Switch Inspector — схема базы данных
--
-- Приложение создаёт схему само при первом запуске, поэтому выполнять
-- этот файл вручную не обязательно. Он нужен для:
--   • понимания структуры без чтения кода;
--   • ручной подготовки базы до запуска;
--   • согласования с администраторами баз данных.
--
-- Требуется PostgreSQL 13 или новее.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Учётные записи ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  username        TEXT UNIQUE NOT NULL,

  -- Способ входа: local — собственный пароль, external — корпоративный
  -- поставщик учётных записей. Оба варианта сосуществуют: переход
  -- выполняется постепенно, а не одномоментно для всех.
  auth_provider   TEXT NOT NULL DEFAULT 'local',

  -- Пароль НЕ обязателен: у записей с внешним входом его нет вовсе.
  -- Обязательность обеспечивается ограничением users_auth_check ниже.
  password_hash   TEXT,

  -- Постоянный идентификатор из внешнего поставщика. Именно он, а не
  -- логин: логин может измениться (смена фамилии, перевод), а этот
  -- остаётся неизменным на всё время существования учётной записи.
  external_id     TEXT UNIQUE,

  display_name    TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'admin',
  created_at      BIGINT NOT NULL,
  avatar          TEXT,          -- изображение в виде base64
  yandex_uid      TEXT,          -- второй фактор при собственном входе

  -- Учётная запись должна иметь ровно один рабочий способ входа:
  -- либо пароль, либо привязку к внешнему поставщику. Запись без
  -- того и другого войти не может и появляться не должна.
  CONSTRAINT users_auth_check CHECK (
    (auth_provider = 'local'    AND password_hash IS NOT NULL) OR
    (auth_provider = 'external' AND external_id   IS NOT NULL)
  )
);

COMMENT ON COLUMN users.auth_provider IS 'local | external';
COMMENT ON COLUMN users.external_id IS 'Постоянный идентификатор пользователя у внешнего поставщика';

COMMENT ON COLUMN users.role IS 'viewer | admin | developer';
COMMENT ON COLUMN users.avatar IS 'Хранится прямо в базе: файлов немного и они малы';

-- ── Зона ответственности ──────────────────────────────────────────────
-- Ограничение доступа по дивизионам, независимое от роли.
-- Пустой список означает доступ ко всем объектам.
CREATE TABLE IF NOT EXISTS user_divisions (
  username   TEXT NOT NULL,
  div_name   TEXT NOT NULL,
  PRIMARY KEY (username, div_name)
);

-- ── Коммутаторы ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS switches (
  mag               TEXT NOT NULL,   -- объект БЕЗ префикса: «134», не «MAG134»
  sw                TEXT NOT NULL,   -- имя С префиксом: «MAG134_70»
  shkaf             TEXT,            -- короткий код шкафа: «S3»
  ip                TEXT,
  up                TEXT,
  down_             TEXT,            -- с подчёркиванием: down — служебное слово
  location          TEXT,
  sn_netbox         TEXT,
  sn_lyra           TEXT,
  model             TEXT,
  comment           TEXT,
  comment_lyra      TEXT,
  updated_by        TEXT,
  updated_by_name   TEXT,
  updated_at        BIGINT NOT NULL,
  PRIMARY KEY (mag, sw)
);

COMMENT ON COLUMN switches.mag IS 'Объект без префикса — полный вид собирается приложением';
COMMENT ON COLUMN switches.sw IS 'Разделитель непостоянен: встречаются и MAG134_70, и MAG134-70';

-- ── Совместная работа ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notes (
  mag            TEXT NOT NULL,
  sw             TEXT NOT NULL,
  text           TEXT,
  username       TEXT,
  display_name   TEXT,
  updated_at     BIGINT,
  PRIMARY KEY (mag, sw)
);

CREATE TABLE IF NOT EXISTS statuses (
  mag            TEXT NOT NULL,
  sw             TEXT NOT NULL,
  done           INTEGER NOT NULL DEFAULT 1,
  username       TEXT,
  display_name   TEXT,
  updated_at     BIGINT,
  PRIMARY KEY (mag, sw)
);

COMMENT ON TABLE statuses IS 'Отметка «обработано». Наличие строки и есть отметка';

-- ── Дивизионы ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS divisions (
  name         TEXT PRIMARY KEY,
  created_at   BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS division_mags (
  div_name   TEXT NOT NULL,
  mag        TEXT NOT NULL,
  PRIMARY KEY (div_name, mag)
);

-- ── Шкафы ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cabinets (
  id               SERIAL PRIMARY KEY,
  mag              TEXT NOT NULL,
  name             TEXT NOT NULL,
  characteristic   TEXT,           -- обычно высота: «22U»
  location         TEXT,
  created_at       BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS cabinet_items (
  id           SERIAL PRIMARY KEY,
  cabinet_id   INTEGER NOT NULL,
  unit         INTEGER NOT NULL,
  name         TEXT,
  comment      TEXT
);

COMMENT ON TABLE cabinet_items IS 'Сохранение заменяет содержимое шкафа целиком';

-- ── Состояние входа ───────────────────────────────────────────────────
-- Хранится в базе, а не в памяти процесса: при нескольких репликах
-- переход к провайдеру и возврат от него попадают на разные реплики.
CREATE TABLE IF NOT EXISTS oauth_states (
  state               TEXT PRIMARY KEY,
  purpose             TEXT NOT NULL,   -- link | verify | login

  -- Может быть пустым: при входе через корпоративного поставщика
  -- пользователь неизвестен до возврата — именно поставщик и сообщает,
  -- кто вошёл. Для link и verify заполняется всегда.
  username            TEXT,

  status              TEXT NOT NULL,   -- pending | processing | done | error
  result              TEXT,
  expires_at          BIGINT NOT NULL,
  result_expires_at   BIGINT
);

-- Счётчик неудачных попыток входа — тоже общий для всех реплик,
-- иначе допустимое число попыток умножалось бы на их количество.
CREATE TABLE IF NOT EXISTS login_attempts (
  ip         TEXT PRIMARY KEY,
  count      INTEGER NOT NULL,
  reset_at   BIGINT NOT NULL
);
