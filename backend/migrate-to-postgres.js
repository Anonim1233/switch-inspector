// Перенос данных из прежней базы SQLite в PostgreSQL.
//
// Запускается один раз, на машине, где есть файл data.sqlite:
//   node migrate-to-postgres.js ./data.sqlite
//
// Требует Node.js 22.5+ (для чтения исходной базы через встроенный модуль)
// и заполненных переменных подключения к PostgreSQL — тех же, что у сервера.
//
// Скрипт НЕ изменяет исходный файл: он только читает.
// Схема в PostgreSQL должна быть уже создана — то есть сервер нужно
// хотя бы раз запустить до переноса.
'use strict';

const { DatabaseSync } = require('node:sqlite');
const { Client } = require('pg');

const srcPath = process.argv[2] || './data.sqlite';

// Порядок важен: сначала таблицы, на которые ссылаются, затем ссылающиеся.
const TABLES = [
  { name: 'users',          cols: ['username','password_hash','display_name','role','created_at','avatar'] },
  { name: 'user_divisions', cols: ['username','div_name'] },
  { name: 'divisions',      cols: ['name','created_at'] },
  { name: 'division_mags',  cols: ['div_name','mag'] },
  { name: 'switches',       cols: ['mag','sw','shkaf','ip','up','down_','location','sn_netbox','sn_lyra','model','comment','comment_lyra','updated_by','updated_by_name','updated_at'] },
  { name: 'notes',          cols: ['mag','sw','text','username','display_name','updated_at'] },
  { name: 'statuses',       cols: ['mag','sw','username','display_name','updated_at'] },
  { name: 'cabinets',       cols: ['id','mag','name','characteristic','location','created_at'] },
  { name: 'cabinet_items',  cols: ['cabinet_id','unit','name','comment'] },
];

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

function existingColumns(src, table) {
  // В исходной базе часть столбцов могла не появиться (старая версия схемы),
  // поэтому переносим только те, что реально есть.
  try {
    return new Set(src.prepare(`PRAGMA table_info(${table})`).all().map(r => r.name));
  } catch (e) {
    return new Set();
  }
}

(async () => {
  let src;
  try {
    src = new DatabaseSync(srcPath);
  } catch (e) {
    console.error('Не удалось открыть исходную базу ' + srcPath + ': ' + e.message);
    process.exit(1);
  }

  try {
    await client.connect();
  } catch (e) {
    console.error('Не удалось подключиться к PostgreSQL: ' + e.message);
    process.exit(1);
  }

  const report = [];
  try {
    await client.query('BEGIN');

    for (const { name, cols } of TABLES) {
      const have = existingColumns(src, name);
      if (have.size === 0) { report.push([name, 0, 'таблицы нет в исходной базе']); continue; }

      const use = cols.filter(c => have.has(c));
      if (!use.length) { report.push([name, 0, 'нет подходящих столбцов']); continue; }

      const rows = src.prepare(`SELECT ${use.join(', ')} FROM ${name}`).all();
      if (!rows.length) { report.push([name, 0, 'пусто']); continue; }

      // Переносим порциями: одним запросом на тысячи строк упереться в лимит
      // параметров PostgreSQL проще, чем кажется.
      const CHUNK = 200;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const part = rows.slice(i, i + CHUNK);
        const values = [];
        const placeholders = part.map((r, ri) => {
          const ph = use.map((c, ci) => '$' + (ri * use.length + ci + 1));
          use.forEach(c => values.push(r[c] === undefined ? null : r[c]));
          return '(' + ph.join(', ') + ')';
        });
        await client.query(
          `INSERT INTO ${name} (${use.join(', ')}) VALUES ${placeholders.join(', ')} ON CONFLICT DO NOTHING`,
          values
        );
      }
      report.push([name, rows.length, 'перенесено']);
    }

    // Столбцы SERIAL ведут собственный счётчик. После переноса готовых
    // идентификаторов его нужно сдвинуть, иначе следующая вставка попытается
    // занять уже существующий номер и упрётся в нарушение уникальности.
    for (const t of ['users', 'cabinets', 'cabinet_items']) {
      await client.query(
        `SELECT setval(pg_get_serial_sequence('${t}', 'id'),
                       COALESCE((SELECT MAX(id) FROM ${t}), 0) + 1, false)`
      );
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Перенос отменён из-за ошибки: ' + e.message);
    await client.end();
    process.exit(1);
  }

  console.log('');
  console.log('Результат переноса:');
  for (const [name, count, note] of report) {
    console.log('  ' + name.padEnd(16) + String(count).padStart(6) + '  ' + note);
  }
  console.log('');
  console.log('Исходный файл не изменялся. Проверьте данные в приложении,');
  console.log('прежде чем удалять прежнюю базу.');

  await client.end();
})();
