// Создание или обновление учётной записи.
// Использование: node add-user.js <логин> <пароль> "<Имя>" [viewer|admin|developer]
'use strict';

const bcrypt = require('bcryptjs');
const { Client } = require('pg');

const [, , username, password, displayName, roleArg] = process.argv;

if (!username || !password || !displayName) {
  console.log('Использование:');
  console.log('  node add-user.js <логин> <пароль> "<Имя Фамилия>" [viewer|admin|developer]');
  console.log('');
  console.log('Примеры:');
  console.log('  node add-user.js ivanov Str0ngP@ss "Иванов И.И." admin');
  console.log('  node add-user.js petrov Vi3wOnly! "Петров П.П." viewer');
  console.log('  node add-user.js vmaimistov D3vP@ss "Владислав Маймистов" developer');
  console.log('');
  console.log('Параметры подключения берутся из тех же переменных окружения,');
  console.log('что и у сервера: PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD');
  console.log('либо DATABASE_URL целиком.');
  process.exit(1);
}

const VALID_ROLES = ['viewer', 'admin', 'developer'];
const role = VALID_ROLES.includes(roleArg) ? roleArg : 'admin';

const client = new Client(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.PGHOST || '127.0.0.1',
        port: Number(process.env.PGPORT || 5432),
        database: process.env.PGDATABASE || 'switch_inventory',
        user: process.env.PGUSER || 'switch_inventory',
        password: process.env.PGPASSWORD,
      }
);

(async () => {
  try {
    await client.connect();
  } catch (e) {
    console.error('Не удалось подключиться к базе: ' + e.message);
    console.error('Проверьте переменные PGHOST, PGDATABASE, PGUSER, PGPASSWORD либо DATABASE_URL.');
    process.exit(1);
  }

  try {
    // Таблица создаётся сервером при старте. Дублируем на случай, если
    // пользователя заводят до первого запуска приложения.
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        auth_provider TEXT NOT NULL DEFAULT 'local',
        password_hash TEXT,
        external_id TEXT UNIQUE,
        display_name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'admin',
        created_at BIGINT NOT NULL,
        CONSTRAINT users_auth_check CHECK (
          (auth_provider = 'local'    AND password_hash IS NOT NULL) OR
          (auth_provider = 'external' AND external_id   IS NOT NULL)
        )
      )
    `);

    const hash = bcrypt.hashSync(password, 10);
    const existing = await client.query('SELECT id FROM users WHERE username = $1', [username]);

    if (existing.rows.length) {
      await client.query(
        'UPDATE users SET password_hash = $1, display_name = $2, role = $3 WHERE username = $4',
        [hash, displayName, role, username]
      );
      console.log('✓ Пользователь обновлён: ' + username + ' (' + role + ')');
    } else {
      await client.query(
        `INSERT INTO users (username, auth_provider, password_hash, display_name, role, created_at)
         VALUES ($1, 'local', $2, $3, $4, $5)`,
        [username, hash, displayName, role, Date.now()]
      );
      console.log('✓ Пользователь создан: ' + username + ' (' + role + ')');
    }

    const total = await client.query('SELECT COUNT(*) as c FROM users');
    console.log('Всего пользователей в базе: ' + total.rows[0].c);
  } catch (e) {
    console.error('Ошибка: ' + e.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})();
