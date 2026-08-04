// ═══════════════════════════════════════════════════════════════════════════
// Инвентаризация коммутаторов — backend
// Express + PostgreSQL.
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');
const { PDFDocument, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');

// ── Подключение к базе ───────────────────────────────────────────────────
// Параметры берутся из переменных окружения. DATABASE_URL имеет приоритет:
// если задана строка подключения целиком, остальные переменные игнорируются.
const pool = new Pool(
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

pool.on('error', (err) => {
  // Соединение в пуле может оборваться само (перезапуск базы, обрыв сети).
  // Пул восстановится сам, но событие нужно перехватить — иначе процесс упадёт.
  console.error('Ошибка соединения с базой:', err.message);
});

// Запросы в коде написаны с плейсхолдерами "?" — привычный вид, оставшийся
// от прежней библиотеки. PostgreSQL ждёт нумерованные ($1, $2), поэтому
// перед отправкой они подставляются автоматически.
// Знаки "?" внутри строковых литералов не трогаются.
function toPositional(sql) {
  let out = '', n = 0, quote = null;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (quote) {
      out += c;
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"') { quote = c; out += c; continue; }
    if (c === '?') { out += '$' + (++n); continue; }
    out += c;
  }
  return out;
}

// Тонкая обёртка вокруг пула: сохраняет привычную форму вызовов
// (get — одна строка, all — все строки, run — без результата),
// но каждый вызов теперь асинхронный.
const db = {
  async get(sql, ...params) {
    const r = await pool.query(toPositional(sql), params);
    return r.rows[0];
  },
  async all(sql, ...params) {
    const r = await pool.query(toPositional(sql), params);
    return r.rows;
  },
  async run(sql, ...params) {
    const r = await pool.query(toPositional(sql), params);
    return { rowCount: r.rowCount, rows: r.rows };
  },
  async exec(sql) {
    await pool.query(sql);
  },
  // Транзакция на выделенном соединении: в пуле параллельные запросы могут
  // уйти в разные соединения, и BEGIN/COMMIT по отдельности их не свяжут.
  async tx(fn) {
    const client = await pool.connect();
    const t = {
      async get(sql, ...p) { const r = await client.query(toPositional(sql), p); return r.rows[0]; },
      async all(sql, ...p) { const r = await client.query(toPositional(sql), p); return r.rows; },
      async run(sql, ...p) { const r = await client.query(toPositional(sql), p); return { rowCount: r.rowCount, rows: r.rows }; },
    };
    try {
      await client.query('BEGIN');
      const result = await fn(t);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch (_) { /* соединение уже потеряно */ }
      throw e;
    } finally {
      client.release();
    }
  },
};


// ── PDF-отчёт для руководства ────────────────────────────────────────────
// Фирменные цвета — те же, что и в корпоративной презентации (FDC300/2F3738),
// для визуальной согласованности между разными материалами компании.
const BRAND_YELLOW = rgb(0.992, 0.765, 0);
const BRAND_CHARCOAL = rgb(0.184, 0.216, 0.220);
const BRAND_GRAY = rgb(0.42, 0.45, 0.47);
const BRAND_LIGHT = rgb(0.965, 0.965, 0.960);
const PAGE_W = 595, PAGE_H = 842; // A4 в пунктах, как в примере из справки pdf-lib

// Простой перенос по словам — pdf-lib не переносит текст сам. Оценка ширины
// через встроенный font.widthOfTextAtSize; не проверено вживую в этой
// песочнице (нет доступа к сети для npm install и живого прогона), поэтому
// раскладка ниже намеренно простая — фиксированные колонки, короткие подписи,
// минимальная нагрузка именно на перенос текста.
function wrapText(text, font, size, maxWidth) {
  const words = String(text).split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (font.widthOfTextAtSize(test, size) > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

async function buildManagementReportPdf({ scopeLabel, allowedMags, generatedByName }) {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit); // обязательно до embedFont с произвольным TTF-файлом
  // StandardFonts (Helvetica и т.п.) работают ТОЛЬКО в кодировке WinAnsi —
  // это латиница без кириллицы вообще, любая русская буква валит
  // page.drawText с ошибкой. Нужен реальный встроенный шрифт с кириллицей —
  // пробуем несколько стандартных путей для Debian, первый найденный и
  // используем. Если ни одного нет — понятная ошибка с командой установки,
  // а не глухой WinAnsi-краш где-то внутри pdf-lib.
  const FONT_CANDIDATES = [
    { regular: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', bold: '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' },
    { regular: '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf', bold: '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf' },
  ];
  const fontPaths = FONT_CANDIDATES.find(c => fs.existsSync(c.regular) && fs.existsSync(c.bold));
  if (!fontPaths) {
    throw new Error('На сервере не найден шрифт с поддержкой кириллицы. Установите: sudo apt install fonts-dejavu-core');
  }
  const font = await pdfDoc.embedFont(fs.readFileSync(fontPaths.regular));
  const fontBold = await pdfDoc.embedFont(fs.readFileSync(fontPaths.bold));

  // Условие видимости — тот же общий хелпер magScopeWhere, что и в
  // /api/switches, /api/notes, /api/statuses. Один источник истины на все
  // места, где нужна фильтрация по зоне ответственности.
  const w = magScopeWhere(allowedMags);
  const wJoin = magScopeWhere(allowedMags, 's.mag'); // для запроса с JOIN division_mags dm ON dm.mag = s.mag

  const totals = await db.get(`SELECT COUNT(*) as total, COUNT(DISTINCT mag) as total_objects FROM switches WHERE ${w.clause}`, ...w.params);
  const withIssues = (await db.get(`SELECT COUNT(*) as c FROM switches WHERE (${w.clause}) AND ${ISSUE_COUNT_SQL} > 0`, ...w.params)).c;
  const withoutIssues = totals.total - withIssues;
  const completionPct = totals.total ? Math.round((withoutIssues / totals.total) * 1000) / 10 : 0;

  const issueCategories = await Promise.all([
    { label: 'Без IP-адреса', sql: `ip IS NULL OR ip=''` },
    { label: 'Без расположения', sql: `location IS NULL OR location=''` },
    { label: 'Без шкафа', sql: `shkaf IS NULL OR shkaf=''` },
    { label: 'Без SN Lyra', sql: `sn_lyra IS NULL OR sn_lyra=''` },
    { label: 'Не найден в Лира', sql: `sn_lyra IS NOT NULL AND sn_lyra!='' AND LOWER(sn_lyra) LIKE '%не найден%'` },
    { label: 'Без SN Netbox', sql: `sn_netbox IS NULL OR sn_netbox=''` },
    { label: 'Без модели SW', sql: `model IS NULL OR model=''` },
  ].map(async (c) => {
    const row = await db.get(`SELECT COUNT(*) as n FROM switches WHERE (${w.clause}) AND ${c.sql}`, ...w.params);
    const n = Number(row.n);
    return { label: c.label, count: n, pct: totals.total ? Math.round((n / totals.total) * 1000) / 10 : 0 };
  }));

  const byDivision = await db.all(`
    SELECT dm.div_name as division, COUNT(*) as total,
      SUM(CASE WHEN ${ISSUE_COUNT_SQL} > 0 THEN 1 ELSE 0 END) as with_issues
    FROM switches s JOIN division_mags dm ON dm.mag = s.mag
    WHERE ${wJoin.clause}
    GROUP BY dm.div_name ORDER BY dm.div_name
  `, ...wJoin.params);

  const topProblems = await db.all(`
    SELECT mag, COUNT(*) as total, SUM(CASE WHEN ${ISSUE_COUNT_SQL} > 0 THEN 1 ELSE 0 END) as with_issues
    FROM switches WHERE ${w.clause}
    GROUP BY mag HAVING with_issues > 0
    ORDER BY with_issues DESC LIMIT 10
  `, ...w.params);

  // ── Страница 1 — титул и сводные показатели ──
  let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  page.drawRectangle({ x: 0, y: PAGE_H - 110, width: PAGE_W, height: 110, color: BRAND_CHARCOAL });
  page.drawRectangle({ x: 0, y: PAGE_H - 114, width: PAGE_W, height: 4, color: BRAND_YELLOW });
  page.drawText('Switch Inspector', { x: 40, y: PAGE_H - 50, size: 22, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText('Отчёт для руководства', { x: 40, y: PAGE_H - 75, size: 13, font, color: BRAND_YELLOW });
  page.drawText(scopeLabel, { x: 40, y: PAGE_H - 95, size: 10, font, color: rgb(0.85, 0.85, 0.85) });

  const now = new Date();
  const dateStr = now.toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' });
  page.drawText(`Сформирован ${dateStr} · ${generatedByName}`, { x: 40, y: PAGE_H - 130, size: 9, font, color: BRAND_GRAY });

  // 3 KPI-плашки
  const kpis = [
    [String(totals.total), 'КОММУТАТОРОВ'],
    [String(totals.total_objects), 'ОБЪЕКТОВ'],
    [completionPct + '%', 'ЗАПОЛНЕННОСТЬ'],
  ];
  const kpiW = 165, kpiGap = 15, kpiX0 = 40, kpiY = PAGE_H - 240, kpiH = 90;
  kpis.forEach(([value, label], i) => {
    const x = kpiX0 + i * (kpiW + kpiGap);
    page.drawRectangle({ x, y: kpiY, width: kpiW, height: kpiH, color: BRAND_LIGHT });
    const valSize = 28;
    const valWidth = fontBold.widthOfTextAtSize(value, valSize);
    page.drawText(value, { x: x + (kpiW - valWidth) / 2, y: kpiY + 45, size: valSize, font: fontBold, color: BRAND_CHARCOAL });
    const lblWidth = font.widthOfTextAtSize(label, 9);
    page.drawText(label, { x: x + (kpiW - lblWidth) / 2, y: kpiY + 20, size: 9, font, color: BRAND_GRAY });
  });

  page.drawText(`Без замечаний: ${withoutIssues}  ·  С замечаниями: ${withIssues}`, { x: 40, y: kpiY - 30, size: 11, font, color: BRAND_CHARCOAL });

  // ── Таблица по категориям замечаний ──
  let y = kpiY - 75;
  page.drawText('Замечания по категориям', { x: 40, y, size: 14, font: fontBold, color: BRAND_CHARCOAL });
  y -= 25;
  page.drawRectangle({ x: 40, y: y - 4, width: PAGE_W - 80, height: 22, color: BRAND_CHARCOAL });
  page.drawText('Категория', { x: 48, y, size: 10, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText('Количество', { x: 340, y, size: 10, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText('Доля', { x: 460, y, size: 10, font: fontBold, color: rgb(1, 1, 1) });
  y -= 26;
  issueCategories.forEach((c, i) => {
    if (i % 2 === 1) page.drawRectangle({ x: 40, y: y - 5, width: PAGE_W - 80, height: 20, color: BRAND_LIGHT });
    page.drawText(c.label, { x: 48, y, size: 10, font, color: BRAND_CHARCOAL });
    page.drawText(String(c.count), { x: 340, y, size: 10, font, color: BRAND_CHARCOAL });
    page.drawText(c.pct + '%', { x: 460, y, size: 10, font, color: BRAND_CHARCOAL });
    y -= 20;
  });

  // ── Страница 2 — по дивизионам и топ проблемных объектов ──
  page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  page.drawRectangle({ x: 0, y: PAGE_H - 4, width: PAGE_W, height: 4, color: BRAND_YELLOW });
  y = PAGE_H - 50;
  page.drawText('По дивизионам', { x: 40, y, size: 14, font: fontBold, color: BRAND_CHARCOAL });
  y -= 25;
  page.drawRectangle({ x: 40, y: y - 4, width: PAGE_W - 80, height: 22, color: BRAND_CHARCOAL });
  page.drawText('Дивизион', { x: 48, y, size: 10, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText('Всего', { x: 260, y, size: 10, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText('С замечаниями', { x: 340, y, size: 10, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText('Заполненность', { x: 460, y, size: 10, font: fontBold, color: rgb(1, 1, 1) });
  y -= 26;
  byDivision.forEach((d, i) => {
    const pct = d.total ? Math.round(((d.total - d.with_issues) / d.total) * 1000) / 10 : 0;
    if (i % 2 === 1) page.drawRectangle({ x: 40, y: y - 5, width: PAGE_W - 80, height: 20, color: BRAND_LIGHT });
    page.drawText(d.division, { x: 48, y, size: 10, font, color: BRAND_CHARCOAL });
    page.drawText(String(d.total), { x: 260, y, size: 10, font, color: BRAND_CHARCOAL });
    page.drawText(String(d.with_issues), { x: 340, y, size: 10, font, color: BRAND_CHARCOAL });
    page.drawText(pct + '%', { x: 460, y, size: 10, font, color: BRAND_CHARCOAL });
    y -= 20;
  });

  y -= 35;
  page.drawText('Топ проблемных объектов', { x: 40, y, size: 14, font: fontBold, color: BRAND_CHARCOAL });
  y -= 25;
  page.drawRectangle({ x: 40, y: y - 4, width: PAGE_W - 80, height: 22, color: BRAND_CHARCOAL });
  page.drawText('Объект (Mag)', { x: 48, y, size: 10, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText('Коммутаторов', { x: 300, y, size: 10, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText('С замечаниями', { x: 440, y, size: 10, font: fontBold, color: rgb(1, 1, 1) });
  y -= 26;
  if (topProblems.length === 0) {
    page.drawText('Проблемных объектов нет.', { x: 48, y, size: 10, font, color: BRAND_GRAY });
  }
  topProblems.forEach((o, i) => {
    if (i % 2 === 1) page.drawRectangle({ x: 40, y: y - 5, width: PAGE_W - 80, height: 20, color: BRAND_LIGHT });
    page.drawText(o.mag, { x: 48, y, size: 10, font, color: BRAND_CHARCOAL });
    page.drawText(String(o.total), { x: 300, y, size: 10, font, color: BRAND_CHARCOAL });
    page.drawText(String(o.with_issues), { x: 440, y, size: 10, font, color: BRAND_CHARCOAL });
    y -= 20;
  });

  return pdfDoc.save();
}

// ── Яндекс ID как второй фактор — состояние OAuth-перехода ──────────────
// В памяти процесса, как и loginAttempts: state — разовый случайный токен,
// который мы сами выдаём перед переходом на Яндекс (кнопкой на этом же
// устройстве ИЛИ через QR — камерой другого устройства) и проверяем, когда
// purpose различает два сценария:
// 'link'   — пользователь уже вошёл обычным способом и привязывает свой
//            Яндекс ID из личного кабинета;
// 'verify' — пользователь в процессе входа, пароль уже проверен, и Яндекс ID
//            служит вторым фактором.
// status: 'pending' (ждём Яндекс) -> 'done'/'error' (колбэк отработал).
// Запись НЕ удаляется сразу в колбэке (в отличие от прежней версии) —
// устройство, которое ждёт результат через опрос,
// может быть ДРУГИМ, чем то, что сходило на Яндекс и попало в колбэк, поэтому
// результат должен пережить сам колбэк хотя бы на несколько секунд опроса.
// Состояние хранится в БАЗЕ, а не в памяти процесса: при нескольких репликах
// переход на Яндекс и возврат от него почти наверняка попадут на разные
// реплики, и состояние в памяти одной из них другая просто не увидит.
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;    // сколько ждём подтверждения на стороне Яндекса
const OAUTH_RESULT_GRACE_MS = 2 * 60 * 1000;  // сколько храним готовый результат для опроса

async function createOauthState(purpose, username) {
  const state = crypto.randomBytes(24).toString('hex');
  await db.run(
    'INSERT INTO oauth_states (state, purpose, username, status, expires_at) VALUES (?, ?, ?, ?, ?)',
    state, purpose, username, 'pending', Date.now() + OAUTH_STATE_TTL_MS
  );
  return state;
}

// Забирает состояние в обработку. Проверка и пометка выполняются ОДНИМ
// запросом с условием status='pending': база гарантирует, что только один
// запрос переведёт запись в 'processing'. При повторном обращении с тем же
// state (повтор запроса сетью, две реплики одновременно) второй ничего не
// получит и код не будет обменян дважды.
async function lockOauthStateForProcessing(state) {
  return await db.get(
    `UPDATE oauth_states SET status = 'processing'
     WHERE state = ? AND status = 'pending' AND expires_at > ?
     RETURNING purpose, username`,
    state, Date.now()
  );
}

async function completeOauthState(state, status, result) {
  await db.run(
    'UPDATE oauth_states SET status = ?, result = ?, result_expires_at = ? WHERE state = ?',
    status, result != null ? JSON.stringify(result) : null, Date.now() + OAUTH_RESULT_GRACE_MS, state
  );
}

// Опрос с ожидающего устройства: результат отдаётся один раз, после чего
// запись удаляется. DELETE ... RETURNING делает это одним запросом, поэтому
// две реплики не смогут выдать один результат дважды.
async function pollOauthState(state) {
  const row = await db.get('SELECT status, result FROM oauth_states WHERE state = ?', state);
  if (!row) return { status: 'expired' };
  if (row.status === 'pending' || row.status === 'processing') return { status: 'pending' };
  const taken = await db.get('DELETE FROM oauth_states WHERE state = ? RETURNING status, result', state);
  if (!taken) return { status: 'expired' }; // другая реплика успела забрать
  return { status: taken.status, result: taken.result ? JSON.parse(taken.result) : null };
}


const PORT = process.env.PORT || 3000;

// ── Ключ подписи сессионных токенов ──────────────────────────────────────
// Задаётся переменной окружения и должен быть ОДИНАКОВЫМ у всех реплик:
// токен, выданный одной репликой, обязан приниматься остальными. Прежняя
// схема с генерацией файла при первом запуске здесь не годится — у каждой
// реплики файл получился бы свой, и пользователей разлогинивало бы при
// каждом обращении к «чужой» реплике и при любом перезапуске.
//
// Значение генерируется один раз при развёртывании:
//   openssl rand -hex 48
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('Не задан JWT_SECRET (или он короче 32 символов).');
  console.error('Сгенерируйте значение командой: openssl rand -hex 48');
  console.error('и передайте его приложению через переменную окружения.');
  process.exit(1);
}


// ── Инициализация базы данных ────────────────────────────────────────────
// Все обращения к PostgreSQL асинхронные, поэтому создание схемы и миграции
// вынесены в отдельную функцию: она выполняется один раз при старте, до того
// как сервер начнёт принимать запросы.
// ── Зона ответственности ─────────────────────────────────────────────────

// Пусто для пользователя = доступ без ограничений (как раньше). Привязка к
// одному или нескольким дивизионам сужает право редактировать только до
// коммутаторов магазинов из этих дивизионов — назначается через
// PUT /api/users/:username/divisions, только role='developer'.
async function getUserAllowedMags(username) {
  const rows = await db.all('SELECT div_name FROM user_divisions WHERE username = ?', username);
  if (rows.length === 0) return null; // без ограничений
  const divNames = rows.map(r => r.div_name);
  const placeholders = divNames.map(() => '?').join(',');
  const mags = await db.all(`SELECT DISTINCT mag FROM division_mags WHERE div_name IN (${placeholders})`, ...divNames);
  return new Set(mags.map(m => m.mag));
}
// Возвращает null (можно всё) или сообщение об ошибке, если mag вне зоны.
async function checkMagScope(username, mag) {
  const allowed = await getUserAllowedMags(username);
  if (allowed === null) return null;
  if (!allowed.has(mag)) return 'Этот магазин вне вашей зоны ответственности';
  return null;
}
// Общий SQL-фрагмент видимости по зоне ответственности — используется везде,
// где нужно ОТФИЛЬТРОВАТЬ список (а не проверить одну запись, для этого есть
// checkMagScope выше). column — имя столбца mag в конкретной таблице/запросе
// (по умолчанию 'mag', с префиксом таблицы для запросов с JOIN).
function magScopeWhere(allowedMags, column) {
  column = column || 'mag';
  if (allowedMags === null) return { clause: '1=1', params: [] };
  const list = Array.from(allowedMags);
  if (list.length === 0) return { clause: '0=1', params: [] };
  return { clause: `${column} IN (${list.map(() => '?').join(',')})`, params: list };
}

// Убираем невидимые символы (zero-width space и подобные), которые часто
// прилипают при копировании номеров с ведущим нулём из Excel — иначе
// "005" с невидимым символом внутри не совпадёт с чистым "005" из данных
// коммутаторов, и магазин молча выпадет из дивизиона.
function cleanMag(s) {
  return String(s || '').replace(/[\u200B-\u200D\uFEFF\s]/g, '');
}

async function initDatabase() {
  // ── База данных ──────────────────────────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      avatar TEXT,
      created_at BIGINT NOT NULL
    )
  `);
  // Миграция для уже существующей базы — таблица users была создана раньше
  // без этого столбца.
  await db.exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT`);
  // Привязка Яндекс ID как второго фактора — храним стабильный числовой id
  // аккаунта Яндекса (НЕ email: его можно сменить, id — нет).

  // ── Подготовка к входу через корпоративного поставщика ──
  // Выполняется заранее, до самой интеграции: существующие записи
  // не затрагивает, вход по паролю продолжает работать как прежде.
  await db.exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'local'`);
  await db.exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS external_id TEXT`);

  // Пароль перестаёт быть обязательным: у записей с внешним входом
  // его не будет. Целостность обеспечивается ограничением ниже.
  try {
    await db.exec(`ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL`);
  } catch (e) {
    // Уже снято при прошлом запуске — это ожидаемо.
  }

  // Идентификатор внешней записи уникален: одна учётная запись
  // поставщика не должна вести к нескольким локальным.
  try {
    await db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS users_external_id_idx ON users (external_id) WHERE external_id IS NOT NULL`);
  } catch (e) {
    console.error('Не удалось создать индекс по внешнему идентификатору:', e.message);
  }

  // Ровно один рабочий способ входа у каждой записи.
  try {
    await db.exec(`
      ALTER TABLE users ADD CONSTRAINT users_auth_check CHECK (
        (auth_provider = 'local'    AND password_hash IS NOT NULL) OR
        (auth_provider = 'external' AND external_id   IS NOT NULL)
      )
    `);
  } catch (e) {
    // Ограничение уже существует — обычная ситуация при перезапуске.
  }
  // TOTP полностью убран в пользу единственного механизма — Яндекс ID.
  // Если это обновление с версии, где TOTP уже был включён у кого-то из
  // пользователей — колонки и таблица ниже подчищаются, а не остаются
  // висеть неиспользуемыми.
  await db.exec(`ALTER TABLE users DROP COLUMN IF EXISTS totp_secret`);
  await db.exec(`ALTER TABLE users DROP COLUMN IF EXISTS totp_enabled`);
  await db.exec(`DROP TABLE IF EXISTS backup_codes`);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS cabinets (
      id SERIAL PRIMARY KEY,
      mag TEXT NOT NULL,
      name TEXT NOT NULL,
      characteristic TEXT,
      location TEXT,
      created_at BIGINT NOT NULL
    )
  `);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS cabinet_items (
      id SERIAL PRIMARY KEY,
      cabinet_id INTEGER NOT NULL,
      unit INTEGER NOT NULL,
      name TEXT,
      comment TEXT
    )
  `);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      mag TEXT NOT NULL,
      sw TEXT NOT NULL,
      text TEXT NOT NULL,
      username TEXT NOT NULL,
      display_name TEXT NOT NULL,
      updated_at BIGINT NOT NULL,
      PRIMARY KEY (mag, sw)
    )
  `);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS statuses (
      mag TEXT NOT NULL,
      sw TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 1,
      username TEXT NOT NULL,
      display_name TEXT NOT NULL,
      updated_at BIGINT NOT NULL,
      PRIMARY KEY (mag, sw)
    )
  `);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS switches (
      mag TEXT NOT NULL,
      sw TEXT NOT NULL,
      shkaf TEXT,
      ip TEXT,
      up TEXT,
      down_ TEXT,
      location TEXT,
      sn_netbox TEXT,
      sn_lyra TEXT,
      model TEXT,
      comment TEXT,
      comment_lyra TEXT,
      updated_by TEXT,
      updated_by_name TEXT,
      updated_at BIGINT NOT NULL,
      PRIMARY KEY (mag, sw)
    )
  `);
  // Миграция для уже существующей базы (таблица switches была создана раньше
  // без этого столбца) — CREATE TABLE IF NOT EXISTS новые столбцы не добавляет.
  // try/catch на случай повторного запуска — тогда столбец уже есть, и ALTER
  // закономерно упадёт с "duplicate column", это ожидаемо и не является сбоем.
  await db.exec(`ALTER TABLE switches ADD COLUMN IF NOT EXISTS updated_by_name TEXT`);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS divisions (
      name TEXT PRIMARY KEY,
      created_at BIGINT NOT NULL
    )
  `);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS division_mags (
      div_name TEXT NOT NULL,
      mag TEXT NOT NULL,
      PRIMARY KEY (div_name, mag)
    )
  `);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS user_divisions (
      username TEXT NOT NULL,
      div_name TEXT NOT NULL,
      PRIMARY KEY (username, div_name)
    )
  `);

  // Состояние перехода на Яндекс ID. Раньше хранилось в памяти процесса —
  // при нескольких репликах переход и возврат попадают на разные реплики,
  // поэтому состояние должно быть общим.
  await db.exec(`
    CREATE TABLE IF NOT EXISTS oauth_states (
      state TEXT PRIMARY KEY,
      purpose TEXT NOT NULL,
      username TEXT NOT NULL,
      status TEXT NOT NULL,
      result TEXT,
      expires_at BIGINT NOT NULL,
      result_expires_at BIGINT
    )
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS oauth_states_expires_idx ON oauth_states (expires_at)`);

  // При входе через корпоративного поставщика пользователь неизвестен
  // до возврата — состояние создаётся раньше, чем становится ясно,
  // кто именно входит.
  try {
    await db.exec(`ALTER TABLE oauth_states ALTER COLUMN username DROP NOT NULL`);
  } catch (e) {
    // Уже снято при прошлом запуске.
  }

  // Счётчик неудачных попыток входа — тоже общий для всех реплик, иначе
  // допустимое число попыток умножалось бы на их количество.
  await db.exec(`
    CREATE TABLE IF NOT EXISTS login_attempts (
      ip TEXT PRIMARY KEY,
      count INTEGER NOT NULL,
      reset_at BIGINT NOT NULL
    )
  `);

  // Разовый перенос текущих 12 дивизионов (были захардкожены в HTML) — только
  // если таблица ещё пуста. На следующих запусках не сработает повторно.
  const divCount = (await db.get('SELECT COUNT(*) c FROM divisions')).c;
  if (divCount === 0) {
    const SEED_DIVISIONS = {
      'DIV 1': ['010','011','041','042','078','079','083','134','135','136','137','138','139','140','141','156','253'],
      'DIV 2': ['002','004','028','252','049','153','169','257','262','065'],
      'DIV 3': ['006','020','022','026','043','086','114','117','143','062','912'],
      'DIV 4': ['016','025','031','038','053','087','088','109','110','131','261'],
      'DIV 5': ['019','021','047','048','057','111','119','127','142','155','159','181'],
      'DIV 6': ['018','052','058','059','091','093','126','164'],
      'DIV 7': ['012','030','036','044','067','089','113','124','129','256','906'],
      'DIV 8': ['007','008','014','024','069','070','073','090','092','094','254','147','255','150','165'],
      'DIV 9': ['009','013','017','027','033','034','039','046','071','074','077','080','115','163','259','264','908'],
      'DIV 10': ['003','005','032','035','040','051','056','118','122','125','251','922','267'],
      'DIV 11': ['023','037','055','068','075','081','082','123','128','913','263','260'],
      'HDCO': ['001'],
    };
    const now = Date.now();
    let seededMags = 0;
    for (const [name, mags] of Object.entries(SEED_DIVISIONS)) {
      await db.run('INSERT INTO divisions (name, created_at) VALUES (?, ?)', name, now);
      for (const m of mags) {
        await db.run('INSERT INTO division_mags (div_name, mag) VALUES (?, ?) ON CONFLICT DO NOTHING', name, cleanMag(m));
        seededMags++;
      }
    }
    console.log('Перенесено дивизионов: ' + Object.keys(SEED_DIVISIONS).length + ', магазинов: ' + seededMags);
  }
}

// ── Публичный адрес приложения ───────────────────────────────────────────
// Единая точка настройки при переносе на другой домен: от него зависят
// разрешённый источник запросов и адрес возврата при входе через
// внешнего поставщика учётных записей.
const APP_URL = (process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');

// ── О резервном копировании ──────────────────────────────────────────────
// В контейнере копирование средствами приложения не выполняется: файлы
// исчезли бы вместе с подом, а при нескольких репликах каждая делала бы
// свою копию. Резервное копирование базы обеспечивается на стороне
// инфраструктуры — расписанием в кластере либо средствами самой СУБД.
// Соответствующий эндпоинт отдаёт признак того, что копирование ведётся
// снаружи, чтобы интерфейс не показывал ложную тревогу.
function getBackupStatus() {
  return { external: true, backups: [], lastBackup: null, hoursSinceLastBackup: null, healthy: true };
}

// ── Приложение ───────────────────────────────────────────────────────────
const app = express();

// ── Перехват ошибок в обработчиках ───────────────────────────────────────
// Express 4 не перехватывает исключения из асинхронных обработчиков сам:
// при сбое запрос повисал бы без ответа, а необработанный отказ завершал
// бы весь процесс. Обёртка направляет такие ошибки в общий обработчик.
function wrap(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

// ── Перехват ошибок в обработчиках ───────────────────────────────────────
// Express 4 не перехватывает исключения из асинхронных обработчиков сам:
// при сбое (обрыв связи с базой, неожиданный тип данных) запрос повисал бы
// без ответа, а необработанный отказ завершал бы весь процесс — одним
// запросом можно было бы вывести из строя копию приложения.
//
// Вместо правки каждого обработчика по отдельности подменяем сами методы
// регистрации: любой возвращающий обещание обработчик автоматически
// получает перехват. Новые обработчики защищены с момента написания —
// про обёртку невозможно забыть.
for (const method of ['get', 'post', 'put', 'delete', 'patch', 'use']) {
  const original = app[method].bind(app);
  app[method] = (...args) => {
    const wrapped = args.map((arg) => {
      // Обработчик ошибок принимает четыре аргумента — его не трогаем,
      // иначе он перестанет распознаваться как обработчик ошибок.
      if (typeof arg !== 'function' || arg.length === 4) return arg;
      const handler = (req, res, next) =>
        Promise.resolve(arg(req, res, next)).catch(next);
      // Сохраняем число аргументов: Express различает обработчики по нему.
      Object.defineProperty(handler, 'length', { value: arg.length });
      return handler;
    });
    return original(...wrapped);
  };
}

app.use(cors({ origin: [APP_URL] }));
app.use(express.json({ limit: '1mb' }));
app.use('/api', apiRateLimit);

// ── Требования к паролю ──────────────────────────────────────────────────
// Проверка выполняется на сервере, а не только в интерфейсе: запрос
// можно отправить и в обход него.
const PASSWORD_MIN_LENGTH = 8;

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
    return `Пароль должен быть не короче ${PASSWORD_MIN_LENGTH} символов`;
  }
  // Пароль целиком из одинаковых символов или простая последовательность —
  // формально проходит по длине, но подбирается мгновенно.
  if (/^(.)\1+$/.test(password)) {
    return 'Пароль не должен состоять из одного повторяющегося символа';
  }
  if (/^(?:0123456789|1234567890|qwertyuiop|password|пароль)/i.test(password)) {
    return 'Пароль слишком простой';
  }
  return null;
}

// ── Заголовки безопасности ───────────────────────────────────────────────
// Ставятся вручную, без дополнительной библиотеки: их немного, и так
// видно, что именно включено и зачем.
app.disable('x-powered-by'); // не сообщаем, на чём работает сервер

app.use((req, res, next) => {
  // Запрещаем встраивание приложения в чужую страницу: иначе поверх
  // него можно наложить прозрачный слой и заставить нажимать не то.
  res.setHeader('X-Frame-Options', 'DENY');

  // Браузер обязан доверять указанному типу содержимого, а не угадывать
  // его: угадывание позволяет выдать загруженный файл за сценарий.
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Адрес нашей страницы не передаётся внешним сайтам при переходе.
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Возможности устройства приложению не нужны.
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  // Откуда разрешено загружать содержимое. Главное здесь — script-src:
  // даже если в страницу попадёт чужой сценарий, браузер его не выполнит.
  //
  // 'unsafe-inline' для стилей нужен, пока приложение задаёт часть
  // оформления прямо в разметке; для сценариев он НЕ разрешён, что и
  // даёт основную защиту.
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    // Подключения — только к себе; отдельно разрешён вход через
    // внешнего поставщика учётных записей.
    "connect-src 'self'",
    // Встраивание в чужую страницу запрещено — дублирует X-Frame-Options
    // для браузеров, которые его больше не поддерживают.
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; '));

  // Требование работать только по защищённому соединению — год.
  // Ставится лишь при защищённом запросе: иначе при локальной
  // разработке браузер запомнит требование и перестанет открывать
  // приложение по обычному протоколу.
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  next();
});

// ── Общее ограничение частоты запросов ───────────────────────────────────
// Отдельно от защиты входа: та считает неудачные попытки пароля, а эта
// ограничивает общий поток. Без неё имеющий действующий токен может
// выкачивать данные или создавать нагрузку без всяких препятствий.
//
// Счётчик в памяти процесса — намеренно: при нескольких репликах
// фактический предел умножается на их число, но для защиты от грубого
// перебора этого достаточно, а обращение к базе на каждый запрос
// стоило бы дороже самой защиты.
const API_RATE_WINDOW_MS = 60 * 1000;
const API_RATE_MAX = 300;            // запросов в минуту с одного адреса
const apiHits = new Map();

function apiRateLimit(req, res, next) {
  const now = Date.now();
  const entry = apiHits.get(req.ip);

  if (!entry || entry.resetAt <= now) {
    apiHits.set(req.ip, { count: 1, resetAt: now + API_RATE_WINDOW_MS });
    return next();
  }

  entry.count++;
  if (entry.count > API_RATE_MAX) {
    const waitSec = Math.ceil((entry.resetAt - now) / 1000);
    res.setHeader('Retry-After', String(waitSec));
    return res.status(429).json({ error: 'Слишком много запросов. Повторите позже.' });
  }

  next();
}

// Уборка устаревших записей, чтобы таблица не росла бесконечно.
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of apiHits) {
    if (entry.resetAt <= now) apiHits.delete(ip);
  }
}, 5 * 60 * 1000).unref();

// ── Ограничение частоты запросов ─────────────────────────────────────────
// Помимо защиты входа ограничиваем общее число запросов с одного адреса:
// без этого можно выгрузить всю базу перебором или создать нагрузку,
// от которой приложение станет недоступно остальным.
//
// Счётчик в памяти процесса: при нескольких репликах ограничение
// умножается на их количество, но и такой предел на порядки ниже того,
// что нужно для перебора. Точный учёт потребовал бы отдельного
// хранилища, что для нашего масштаба избыточно.
const REQUEST_WINDOW_MS = 60 * 1000;
const REQUEST_LIMIT = 300; // с запасом: обычная работа даёт единицы запросов в минуту
const requestCounts = new Map();

app.use('/api', (req, res, next) => {
  // Поток живых обновлений держит соединение открытым и в счёт не идёт.
  if (req.path === '/events') return next();

  const now = Date.now();
  const ip = req.ip;
  const entry = requestCounts.get(ip);

  if (!entry || entry.resetAt <= now) {
    requestCounts.set(ip, { count: 1, resetAt: now + REQUEST_WINDOW_MS });
    return next();
  }

  entry.count++;
  if (entry.count > REQUEST_LIMIT) {
    return res.status(429).json({ error: 'Слишком много запросов. Подождите минуту.' });
  }
  next();
});

// Уборка устаревших счётчиков, иначе таблица росла бы без предела.
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of requestCounts) {
    if (entry.resetAt <= now) requestCounts.delete(ip);
  }
}, 5 * 60 * 1000);
// Ни один /api/ ответ не должен кэшироваться браузером — это персональные,
// постоянно меняющиеся данные (профиль, аватар, статусы). Без этого
// заголовка браузер/ОС теоретически мог бы отдать устаревший закэшированный
// ответ вместо свежего запроса на сервер, причём этот кэш живёт отдельно от
// самого приложения — переустановка PWA его не обязательно чистит.
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
// Кому доверять заголовок с настоящим адресом клиента.
//
// Значение зависит от способа развёртывания и потому задаётся снаружи:
//   • прокси на том же хосте (Raspberry Pi)  → loopback
//   • кластер, обращение через входной контроллер → подсеть его подов
//
// Если оставить loopback в кластере, обращение приходит не с локального
// адреса, заголовок игнорируется, и req.ip у ВСЕХ клиентов становится
// одинаковым — адресом входного контроллера. Тогда ограничение частоты
// превращается в общий предел на всю компанию, а не на клиента: обычная
// одновременная работа нескольких сотрудников начнёт упираться в отказ.
app.set('trust proxy', process.env.TRUSTED_PROXY || 'loopback');

// ── Защита входа от перебора паролей ────────────────────────────────────
// Счётчик хранится в БАЗЕ, а не в памяти: при нескольких репликах у каждой
// был бы свой счётчик, и фактическое число допустимых попыток умножалось бы
// на количество реплик.
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 минут

// Ключ счётчика — пара «адрес и логин», а не только адрес.
//
// Если считать по одному адресу, ограничение обходится: имея любую
// действующую учётную запись, нападающий чередует подбор чужого пароля
// с входом под своей — успешный вход сбрасывал бы счётчик, и число
// попыток становилось бы неограниченным.
//
// Логин приводится к нижнему регистру: иначе счётчик обходится сменой
// регистра в написании одного и того же имени.
function loginAttemptKey(ip, username) {
  return `${ip}|${String(username || '').toLowerCase()}`;
}

async function checkLoginRateLimit(req, res, next) {
  try {
    const now = Date.now();
    const key = loginAttemptKey(req.ip, req.body && req.body.username);
    const row = await db.get('SELECT count, reset_at FROM login_attempts WHERE ip = ?', key);
    if (row && Number(row.reset_at) > now && Number(row.count) >= LOGIN_MAX_ATTEMPTS) {
      const waitMin = Math.ceil((Number(row.reset_at) - now) / 60000);
      return res.status(429).json({ error: `Слишком много неудачных попыток входа. Попробуйте через ${waitMin} мин.` });
    }
    next();
  } catch (e) {
    // Сбой при проверке счётчика не должен закрывать вход совсем —
    // записываем в журнал и пропускаем дальше.
    console.error('Не удалось проверить счётчик попыток входа:', e.message);
    next();
  }
}

// Счётчик увеличивается одним запросом: при одновременных попытках с двух
// реплик обе будут учтены, а не перезапишут друг друга.
async function recordLoginFailure(ip, username) {
  const now = Date.now();
  const key = loginAttemptKey(ip, username);
  try {
    await db.run(
      `INSERT INTO login_attempts (ip, count, reset_at) VALUES (?, 1, ?)
       ON CONFLICT (ip) DO UPDATE SET
         count = CASE WHEN login_attempts.reset_at <= ? THEN 1 ELSE login_attempts.count + 1 END,
         reset_at = CASE WHEN login_attempts.reset_at <= ? THEN ? ELSE login_attempts.reset_at END`,
      key, now + LOGIN_WINDOW_MS, now, now, now + LOGIN_WINDOW_MS
    );
  } catch (e) {
    console.error('Не удалось записать неудачную попытку входа:', e.message);
  }
}

// Сбрасывается счётчик ТОЛЬКО для этой пары «адрес и логин»: успешный
// вход под одной учётной записью не должен снимать ограничение,
// накопленное при подборе пароля к другой.
async function recordLoginSuccess(ip, username) {
  try { await db.run('DELETE FROM login_attempts WHERE ip = ?', loginAttemptKey(ip, username)); }
  catch (e) { console.error('Не удалось сбросить счётчик попыток входа:', e.message); }
}

// Уборка устаревших записей — раз в час, чтобы таблицы не росли бесконечно.
async function cleanupLoginAttempts() {
  try { await db.run('DELETE FROM login_attempts WHERE reset_at <= ?', Date.now()); }
  catch (e) { console.error('Не удалось подчистить счётчики попыток:', e.message); }
}

async function cleanupOauthStates() {
  try {
    const now = Date.now();
    await db.run(
      `DELETE FROM oauth_states
       WHERE (status IN ('pending','processing') AND expires_at <= ?)
          OR (status NOT IN ('pending','processing') AND COALESCE(result_expires_at, expires_at) <= ?)`,
      now, now
    );
  } catch (e) {
    console.error('Не удалось подчистить состояния OAuth:', e.message);
  }
}

async function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Требуется вход в систему' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Роль (и сам факт существования аккаунта) — свежим запросом к базе на
    // каждый запрос, а не из самого токена. Токен живёт 30 дней; без этой
    // проверки понижение в правах или удаление аккаунта не подействовало бы
    // до истечения токена или следующего входа — человек продолжал бы
    // работать со старыми правами всё это время.
    const row = await db.get('SELECT username, display_name, role FROM users WHERE username = ?', decoded.username);
    if (!row) return res.status(401).json({ error: 'Аккаунт больше не существует, войдите заново' });
    req.user = { username: row.username, displayName: row.display_name, role: row.role };
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Сессия истекла, войдите заново' });
  }
}

function requireEdit(req, res, next) {
  if (req.user.role === 'viewer') {
    return res.status(403).json({ error: 'Доступно только с правами редактирования' });
  }
  next();
}

// ── Живые обновления (Server-Sent Events) ───────────────────────────────
// Браузерный EventSource не умеет слать свои заголовки (Authorization),
// поэтому здесь токен передаётся через query-параметр, а не Bearer-заголовок
// — это обычная, широко принятая практика именно для SSE-подключений.
//
// Сами соединения держит конкретная реплика, поэтому рассылка идёт через
// штатный механизм уведомлений PostgreSQL: реплика, обработавшая изменение,
// публикует событие, а все реплики его получают и передают своим клиентам.
// Отдельное хранилище для этого заводить не требуется — база уже есть.
const sseClients = new Set();
const EVENT_CHANNEL = 'switch_inventory_events';

// Отдельное постоянное соединение под приём уведомлений: соединение из пула
// для этого не годится, оно возвращается в пул и подписка теряется.
let notifyClient = null;

async function startEventListener() {
  const { Client } = require('pg');
  const cfg = process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.PGHOST || '127.0.0.1',
        port: Number(process.env.PGPORT || 5432),
        database: process.env.PGDATABASE || 'switch_inventory',
        user: process.env.PGUSER || 'switch_inventory',
        password: process.env.PGPASSWORD,
      };
  notifyClient = new Client(cfg);

  notifyClient.on('notification', (msg) => {
    if (msg.channel !== EVENT_CHANNEL || !msg.payload) return;
    let message;
    try { message = JSON.parse(msg.payload); }
    catch (e) { return; } // повреждённое уведомление пропускаем

    for (const client of sseClients) {
      sendToClient(client, message, msg.payload);
    }
  });

  // Соединение может оборваться (перезапуск базы, обрыв сети) — тогда
  // подписка теряется молча, и живые обновления просто перестают приходить.
  // Поэтому переподключаемся с задержкой.
  notifyClient.on('error', (err) => {
    console.error('Обрыв соединения для уведомлений:', err.message);
    setTimeout(() => { startEventListener().catch(() => {}); }, 5000);
  });

  await notifyClient.connect();
  await notifyClient.query('LISTEN ' + EVENT_CHANNEL);
  console.log('Подписка на уведомления установлена');
}

// Публикация события. Уведомление получат ВСЕ реплики, включая ту, что его
// отправила, — своим клиентам она передаст его тем же путём, что и остальные.
function broadcastEvent(type, payload) {
  const body = JSON.stringify(Object.assign({ type }, payload));
  // pg_notify вместо NOTIFY: принимает текст параметром, поэтому не требует
  // подстановки значения в текст запроса.
  db.run('SELECT pg_notify(?, ?)', EVENT_CHANNEL, body)
    .catch((e) => console.error('Не удалось разослать событие:', e.message));
}

// К какому объекту относится событие. Нужно, чтобы не отправлять его тем,
// у кого этот объект вне зоны ответственности: иначе изменения по чужим
// дивизионам были бы видны в потоке обновлений, хотя обычные запросы их
// не отдают.
function eventMag(message) {
  if (message.mag) return message.mag;
  // Событие об изменении коммутатора несёт всю строку целиком.
  if (message.row && message.row['Mag']) return message.row['Mag'];
  return null;
}

// Отправка события одному подключению с учётом его зоны ответственности.
function sendToClient(client, message, body) {
  const mag = eventMag(message);

  // Событие без привязки к объекту (например, массовый импорт) получают
  // все: оно не раскрывает содержимое, а лишь сообщает, что данные
  // изменились и список стоит перечитать. Перечитывание уже вернёт
  // только доступное.
  if (mag && client.allowedMags && !client.allowedMags.has(mag)) return;

  try {
    client.res.write('data: ' + body + '\n\n');
  } catch (e) {
    sseClients.delete(client);
  }
}

app.get('/api/events', async (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(401).end();

  let decoded;
  try { decoded = jwt.verify(token, JWT_SECRET); }
  catch (e) { return res.status(401).end(); }

  // Пользователь перечитывается из базы, как и в authMiddleware: без
  // этого удалённая учётная запись могла бы открывать новые подключения
  // и получать поток изменений до истечения токена, хотя обычные
  // запросы ей уже недоступны.
  const row = await db.get('SELECT username FROM users WHERE username = ?', decoded.username);
  if (!row) return res.status(401).end();

  // Зона ответственности запоминается на момент подключения и дальше
  // определяет, какие события этому клиенту отправлять.
  const allowedMags = await getUserAllowedMags(row.username);

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  res.flushHeaders();
  res.write('data: {"type":"connected"}\n\n');

  const client = { res, allowedMags, username: row.username };
  sseClients.add(client);

  // Пинг раз в 25с — держим соединение живым (иначе прокси/браузер могут
  // закрыть его как неактивное на долгом простое между реальными событиями).
  const keepAlive = setInterval(() => {
    try { res.write(': keepalive\n\n'); } catch (e) { clearInterval(keepAlive); sseClients.delete(client); }
  }, 25000);

  req.on('close', () => {
    clearInterval(keepAlive);
    sseClients.delete(client);
  });
});

// Управление пользователями — сознательно отдельный, более узкий уровень,
// чем requireEdit. admin умеет редактировать коммутаторы, но НЕ управляет
// учётками — это исключительно у role='developer'.
function requireDeveloper(req, res, next) {
  if (req.user.role !== 'developer') {
    return res.status(403).json({ error: 'Доступно только разработчику' });
  }
  next();
}

// Управление учётными записями и дивизионами дополнительно требует
// ОТСУТСТВИЯ ограничения по зоне ответственности у самого вызывающего.
//
// Без этой проверки роль «разработчик» с ограниченной зоной позволяла
// снять ограничение самому себе: достаточно было назначить себе пустой
// список дивизионов, который означает «доступ ко всему». Заявленная
// изоляция по дивизионам обходилась одним запросом.
//
// Сузить эти операции до собственной зоны нельзя: изменение состава
// дивизиона по определению затрагивает границы зон. Поэтому такие
// операции доступны только тому, у кого ограничений нет.
async function requireUnrestrictedDeveloper(req, res, next) {
  if (req.user.role !== 'developer') {
    return res.status(403).json({ error: 'Доступно только разработчику' });
  }
  const allowed = await getUserAllowedMags(req.user.username);
  if (allowed !== null) {
    return res.status(403).json({
      error: 'Управление пользователями и дивизионами недоступно при ограниченной зоне ответственности',
    });
  }
  next();
}

// ── Health check ─────────────────────────────────────────────────────────
// /api/health — используйте этот путь для проверки через Caddy: он всегда
// проксируется на backend, в отличие от "/", который в проде отдаёт статику
// фронтенда (см. Caddyfile). "/" оставлен как есть — удобно для проверки
// backend напрямую на localhost:3000, в обход Caddy.
app.get('/', async (req, res) => {
  res.json({ status: 'ok', service: 'switch-inventory-backend' });
});
app.get('/api/health', async (req, res) => {
  res.json({ status: 'ok', service: 'switch-inventory-backend' });
});

// ── Авторизация ──────────────────────────────────────────────────────────
// Общая функция выдачи настоящего сеансового токена — используется и обычным
// после подтверждения через Яндекс.
async function issueSessionToken(row) {
  const payload = { username: row.username, displayName: row.display_name, role: row.role };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
  // scopeDivisions/avatar — только в теле ответа, не в самом токене: токен
  // живёт 30 дней, а эти данные могут поменяться в любой момент, и клиент
  // должен видеть актуальное значение при каждом новом входе.
  const divRows = await db.all('SELECT div_name FROM user_divisions WHERE username = ?', row.username);
  return Object.assign({ token: token, scopeDivisions: divRows.map(r => r.div_name), avatar: row.avatar || null }, payload);
}

// Хеш-заглушка для случая, когда пользователь не найден. Значение
// произвольное: важно лишь, чтобы сравнение с ним занимало столько же
// времени, сколько с настоящим хешем.
const DUMMY_HASH = bcrypt.hashSync('несуществующий-пароль-для-выравнивания-времени', 10);

// ── Проверка личности ────────────────────────────────────────────────────
// Собрано в одном месте намеренно: при переходе на вход через
// корпоративного поставщика заменяется только этот участок, а выдача
// сессии, роли и зона ответственности остаются нетронутыми.
//
// Возвращает запись пользователя либо null. Причину неудачи наружу
// не сообщает — вызывающий отвечает одинаково для несуществующего
// логина и неверного пароля.
async function verifyCredentials(username, password) {
  const row = await db.get('SELECT * FROM users WHERE username = ?', username);

  // Сравнение выполняется ВСЕГДА, даже когда сравнивать не с чем:
  // иначе ответ для несуществующего логина приходил бы заметно
  // быстрее, и по времени ответа можно было бы выяснить, какие
  // учётные записи существуют.
  //
  // Заглушка нужна и для записей с внешним входом: у них пароля нет
  // вовсе, и без неё сравнение завершилось бы ошибкой.
  const storedHash = (row && row.auth_provider === 'local' && row.password_hash)
    ? row.password_hash
    : DUMMY_HASH;

  const passwordOk = bcrypt.compareSync(password, storedHash);

  if (!row) return null;
  // Запись с внешним входом по паролю не пускаем, даже если пароль
  // когда-то был задан: способ входа определяется полем auth_provider.
  if (row.auth_provider !== 'local') return null;
  if (!passwordOk) return null;

  return row;
}

app.post('/api/login', checkLoginRateLimit, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Укажите логин и пароль' });
  }

  const row = await verifyCredentials(username, password);
  if (!row) {
    await recordLoginFailure(req.ip, username);
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  }
  await recordLoginSuccess(req.ip, username);
  res.json(await issueSessionToken(row));
});

app.get('/api/me', authMiddleware, async (req, res) => {
  const divRows = await db.all('SELECT div_name FROM user_divisions WHERE username = ?', req.user.username);
  const row = await db.get('SELECT avatar FROM users WHERE username = ?', req.user.username);
  res.json(Object.assign({}, req.user, { scopeDivisions: divRows.map(r => r.div_name), avatar: (row && row.avatar) || null }));
});

// Фото профиля — сам себе, сжатое/обрезанное до квадрата ещё в браузере
// (см. compressAvatarFile на фронтенде), так что здесь просто разумный
// потолок на случай, если кто-то пришлёт запрос напрямую в обход интерфейса.
// Настоящие "подписи" форматов — первые байты файла, которые ни с чем не
// перепутать. Раскодированное содержимое сверяется с этим, а не с тем, что
// человек ЗАЯВИЛ в текстовом префиксе строки — иначе можно было бы прислать
// data:image/jpeg;base64,... с произвольными байтами внутри, и заявленный
// формат никто бы не перепроверил.
function detectImageFormat(buf){
  if(buf.length>=3 && buf[0]===0xFF && buf[1]===0xD8 && buf[2]===0xFF) return 'jpeg';
  if(buf.length>=8 && buf[0]===0x89 && buf[1]===0x50 && buf[2]===0x4E && buf[3]===0x47
     && buf[4]===0x0D && buf[5]===0x0A && buf[6]===0x1A && buf[7]===0x0A) return 'png';
  if(buf.length>=12 && buf.toString('ascii',0,4)==='RIFF' && buf.toString('ascii',8,12)==='WEBP') return 'webp';
  return null;
}

app.put('/api/me/avatar', authMiddleware, async (req, res) => {
  const { avatar } = req.body || {};
  // Только конкретные растровые форматы, не data:image/* вообще — этим
  // отдельно исключается SVG: он тоже "картинка" по MIME-типу, но может
  // содержать <script> внутри себя как штатный, валидный элемент формата
  // (не полиглот — обычный SVG-скрипт, срабатывающий в некоторых контекстах
  // отображения). Сейчас аватар используется только как CSS background-image,
  // самый инертный способ показать картинку браузеру — но проверка формата
  // всё равно должна смотреть на реальные байты, а не верить текстовому
  // префиксу строки на слово.
  let validAvatar = avatar === null;
  if (avatar !== null) {
    const m = typeof avatar === 'string' && avatar.match(/^data:image\/(jpeg|png|webp);base64,(.+)$/);
    if (m) {
      try {
        const buf = Buffer.from(m[2], 'base64');
        const realFormat = detectImageFormat(buf);
        validAvatar = realFormat === m[1];
      } catch (e) { validAvatar = false; }
    }
  }
  if (!validAvatar) {
    return res.status(400).json({ error: 'Ожидался настоящий JPEG/PNG/WEBP в виде data:image/... строки, или null для удаления' });
  }
  if (avatar && avatar.length > 300000) {
    return res.status(400).json({ error: 'Изображение слишком большое даже после сжатия' });
  }
  const result = await db.run('UPDATE users SET avatar = ? WHERE username = ?', avatar, req.user.username);
  // UPDATE в SQLite не бросает исключение, если WHERE ничего не нашёл — он
  // просто молча не делает ничего. Без явной проверки changes клиент получил бы
  // "успех" даже когда по факту в базу ничего не записалось.
  // Обёртка над драйвером возвращает rowCount — прежнее имя changes
  // осталось от другой библиотеки и всегда было бы неопределённым,
  // из-за чего проверка никогда не срабатывала.
  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Пользователь не найден в базе — обновление не применено' });
  }
  // Перечитываем из базы, а не отдаём обратно то, что прислал клиент —
  // так ответ всегда отражает то, что реально сохранилось.
  const saved = await db.get('SELECT avatar FROM users WHERE username = ?', req.user.username);
  res.json({ username: req.user.username, avatar: (saved && saved.avatar) || null });
});

// Смена ПАРОЛЯ САМОМУ СЕБЕ — обязательно с проверкой текущего пароля.
// Это принципиально другая вещь, чем developer, меняющий чужой пароль через
// PUT /api/users/:username (там текущий пароль знать не нужно — это сброс
// администратором, а не сознательная смена самим владельцем аккаунта).
app.put('/api/me/password', authMiddleware, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Укажите текущий и новый пароль' });
  }
  const passwordError = validatePassword(newPassword);
  if (passwordError) {
    return res.status(400).json({ error: passwordError });
  }
  const row = await db.get('SELECT password_hash FROM users WHERE username = ?', req.user.username);
  if (!row || !bcrypt.compareSync(currentPassword, row.password_hash)) {
    return res.status(401).json({ error: 'Текущий пароль указан неверно' });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  await db.run('UPDATE users SET password_hash = ? WHERE username = ?', hash, req.user.username);
  res.json({ username: req.user.username, changed: true });
});





// ── Управление пользователями (только role='developer') ────────────────────
const VALID_ROLES = ['viewer', 'admin', 'developer'];

// Статус бэкапов — для панели в личном кабинете разработчика.
app.get('/api/backup-status', authMiddleware, requireDeveloper, async (req, res) => {
  res.json(getBackupStatus());
});

app.get('/api/users', authMiddleware, requireUnrestrictedDeveloper, async (req, res) => {
  const rows = await db.all('SELECT username, display_name, role, created_at FROM users ORDER BY created_at');
  const allScopes = await db.all('SELECT username, div_name FROM user_divisions');
  const scopeByUser = {};
  for (const s of allScopes) { (scopeByUser[s.username] = scopeByUser[s.username] || []).push(s.div_name); }
  res.json(rows.map(u => Object.assign({}, u, { scopeDivisions: scopeByUser[u.username] || [] })));
});

// Назначение зоны ответственности — полностью заменяет список дивизионов
// пользователя переданным массивом (пустой массив = снять ограничение).
app.put('/api/users/:username/divisions', authMiddleware, requireUnrestrictedDeveloper, async (req, res) => {
  const { username } = req.params;

  // Собственную зону ответственности менять нельзя — по той же причине,
  // по которой нельзя понизить себе роль: это позволяло бы снять с себя
  // ограничение в обход того, кто его назначил.
  if (username === req.user.username) {
    return res.status(400).json({
      error: 'Нельзя менять зону ответственности самому себе — попросите другого разработчика',
    });
  }

  const divisions = (req.body && req.body.divisions) || [];
  if (!Array.isArray(divisions)) return res.status(400).json({ error: 'divisions должен быть массивом' });
  const user = await db.get('SELECT username FROM users WHERE username = ?', username);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  await db.run('DELETE FROM user_divisions WHERE username = ?', username);
  for (const d of divisions) {
    await db.run('INSERT INTO user_divisions (username, div_name) VALUES (?, ?) ON CONFLICT DO NOTHING', username, String(d));
  }
  res.json({ username, scopeDivisions: divisions });
});

app.post('/api/users', authMiddleware, requireUnrestrictedDeveloper, async (req, res) => {
  const { username, password, displayName, role } = req.body || {};
  if (!username || !password || !displayName) {
    return res.status(400).json({ error: 'Логин, пароль и имя обязательны' });
  }
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: 'Роль должна быть одной из: ' + VALID_ROLES.join(', ') });
  }
  const passwordError = validatePassword(password);
  if (passwordError) {
    return res.status(400).json({ error: passwordError });
  }
  const existing = await db.get('SELECT id FROM users WHERE username = ?', username);
  if (existing) {
    return res.status(409).json({ error: 'Пользователь с таким логином уже есть' });
  }
  const hash = bcrypt.hashSync(password, 10);
  await db.run('INSERT INTO users (username, password_hash, display_name, role, created_at) VALUES (?, ?, ?, ?, ?)', username, hash, displayName, role, Date.now());
  res.json({ username, displayName, role });
});

app.put('/api/users/:username', authMiddleware, requireUnrestrictedDeveloper, async (req, res) => {
  const { username } = req.params;
  const { displayName, role, password } = req.body || {};
  const existing = await db.get('SELECT * FROM users WHERE username = ?', username);
  if (!existing) return res.status(404).json({ error: 'Пользователь не найден' });

  if (role && !VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: 'Роль должна быть одной из: ' + VALID_ROLES.join(', ') });
  }
  // Не даём разработчику случайно понизить самого себя — иначе легко
  // остаться совсем без role='developer' и потерять доступ к этой же панели.
  if (username === req.user.username && role && role !== 'developer') {
    return res.status(400).json({ error: 'Нельзя понизить роль самому себе — попросите другого разработчика' });
  }

  const newDisplayName = displayName || existing.display_name;
  const newRole = role || existing.role;
  await db.run('UPDATE users SET display_name = ?, role = ? WHERE username = ?', newDisplayName, newRole, username);

  if (password) {
    const resetError = validatePassword(password);
    if (resetError) {
      return res.status(400).json({ error: resetError });
    }
    const hash = bcrypt.hashSync(password, 10);
    await db.run('UPDATE users SET password_hash = ? WHERE username = ?', hash, username);
  }
  res.json({ username, displayName: newDisplayName, role: newRole });
});

app.delete('/api/users/:username', authMiddleware, requireUnrestrictedDeveloper, async (req, res) => {
  const { username } = req.params;
  if (username === req.user.username) {
    return res.status(400).json({ error: 'Нельзя удалить самого себя' });
  }
  const target = await db.get('SELECT role FROM users WHERE username = ?', username);
  if (!target) return res.status(404).json({ error: 'Пользователь не найден' });
  if (target.role === 'developer') {
    const devCount = (await db.get("SELECT COUNT(*) c FROM users WHERE role = 'developer'")).c;
    if (devCount <= 1) {
      return res.status(400).json({ error: 'Нельзя удалить последнего разработчика — система останется без управления пользователями' });
    }
  }
  await db.run('DELETE FROM users WHERE username = ?', username);
  await db.run('DELETE FROM user_divisions WHERE username = ?', username);
  res.json({ username, deleted: true });
});


// ── Заметки ──────────────────────────────────────────────────────────────
// Отдаём все заметки одним запросом — фронтенд кэширует их у себя и
// проверяет синхронно при рендере таблиц (сотни строк на экран,
// индивидуальные запросы на каждую были бы слишком медленными).
app.get('/api/notes', authMiddleware, async (req, res) => {
  const w = magScopeWhere(await getUserAllowedMags(req.user.username));
  res.json(await db.all(`SELECT * FROM notes WHERE ${w.clause}`, ...w.params));
});

app.post('/api/notes', authMiddleware, requireEdit, async (req, res) => {
  const { mag, sw, text } = req.body || {};
  if (!mag || !sw) return res.status(400).json({ error: 'mag и sw обязательны' });
  const scopeErr = await checkMagScope(req.user.username, mag);
  if (scopeErr) return res.status(403).json({ error: scopeErr });
  const now = Date.now();

  if (!text) {
    await db.run('DELETE FROM notes WHERE mag = ? AND sw = ?', mag, sw);
    broadcastEvent('note', { mag, sw, text: '', user: req.user.username, displayName: req.user.displayName, ts: now });
    return res.json({ mag: mag, sw: sw, deleted: true });
  }

  await db.run(`
    INSERT INTO notes (mag, sw, text, username, display_name, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(mag, sw) DO UPDATE SET
      text = excluded.text,
      username = excluded.username,
      display_name = excluded.display_name,
      updated_at = excluded.updated_at
  `, mag, sw, text, req.user.username, req.user.displayName, now);

  broadcastEvent('note', { mag, sw, text, user: req.user.username, displayName: req.user.displayName, ts: now });
  res.json({ mag: mag, sw: sw, text: text, username: req.user.username, display_name: req.user.displayName, updated_at: now });
});

// ── Статусы «обработано» ────────────────────────────────────────────────
app.get('/api/statuses', authMiddleware, async (req, res) => {
  const w = magScopeWhere(await getUserAllowedMags(req.user.username));
  res.json(await db.all(`SELECT * FROM statuses WHERE ${w.clause}`, ...w.params));
});

app.post('/api/statuses', authMiddleware, requireEdit, async (req, res) => {
  const { mag, sw, done } = req.body || {};
  if (!mag || !sw) return res.status(400).json({ error: 'mag и sw обязательны' });
  const scopeErr = await checkMagScope(req.user.username, mag);
  if (scopeErr) return res.status(403).json({ error: scopeErr });
  const now = Date.now();

  if (!done) {
    await db.run('DELETE FROM statuses WHERE mag = ? AND sw = ?', mag, sw);
    broadcastEvent('status', { mag, sw, done: false, user: req.user.username, displayName: req.user.displayName, ts: now });
    return res.json({ mag: mag, sw: sw, deleted: true });
  }

  await db.run(`
    INSERT INTO statuses (mag, sw, done, username, display_name, updated_at)
    VALUES (?, ?, 1, ?, ?, ?)
    ON CONFLICT(mag, sw) DO UPDATE SET
      done = 1,
      username = excluded.username,
      display_name = excluded.display_name,
      updated_at = excluded.updated_at
  `, mag, sw, req.user.username, req.user.displayName, now);

  broadcastEvent('status', { mag, sw, done: true, user: req.user.username, displayName: req.user.displayName, ts: now });
  res.json({ mag: mag, sw: sw, done: true, username: req.user.username, display_name: req.user.displayName, updated_at: now });
});

// ── Наполнение шкафов ────────────────────────────────────────────────────
// Каждый шкаф — своя шапка (наименование/характеристика/местоположение) и
// список позиций по юнитам, который заменяется целиком при сохранении
// (не поштучный CRUD на каждую позицию — так же, как заполняется реальный
// монтажный чертёж: редактируется весь шкаф целиком за один раз).
//
// Проверка несовпадения по шкафу: если наименование позиции содержит
// "SW_<номер>" (в реальных выгрузках это "Коммутатор SW_74" и подобное —
// поэтому ищем подстрокой, не точным совпадением всего текста), считаем,
// что это ссылка на коммутатор с sw = "<mag текущего объекта>_<номер>".
// Если такой коммутатор в базе есть, но его реальное поле shkaf не
// совпадает с наименованием ЭТОГО шкафа — помечаем позицию несовпадением.
// Только пометка внутри этой вкладки, в общие "Замечания по категориям"
// на дашборде не идёт.
// В switches.shkaf хранится короткий код ("S3"), а в cabinets.name — полное
// название из Excel ("Шкаф коммутационный S3") — разные строки, один и тот
// же физический шкаф. Точное сравнение ловило это как расхождение. Вместо
// равенства проверяем, что полное имя ЗАКАНЧИВАЕТСЯ на короткий код, причём
// перед ним — граница слова (пробел или начало строки) — чтобы код "S1" не
// засчитался внутри "S10" по случайному совпадению хвоста цифр.
function shkafNamesMatch(shortCode, fullName) {
  if (!shortCode || !fullName) return false;
  const a = shortCode.trim().toLowerCase();
  const b = fullName.trim().toLowerCase();
  if (a === b) return true;
  if (!b.endsWith(a)) return false;
  const before = b.length > a.length ? b[b.length - a.length - 1] : '';
  return before === '' || /[\s\-_№]/.test(before);
}

// Собирает по ВСЕМ шкафам объекта карту "номер коммутатора → где он указан"
// (шкаф, юнит) — общая основа и для обратной ссылки (карточка → шкаф),
// и для проверки "какие коммутаторы объекта нигде не размещены". Извлечение
// номера — та же регулярка, что и в annotateCabinetItems, чтобы не разойтись.
// Ищет в тексте позиции шкафа ссылку на один из коммутаторов объекта.
// Сравнение идёт с РЕАЛЬНЫМИ именами коммутаторов, а не с извлечённым из
// текста номером: извлечение номера ломалось на ведущих нулях ("072" против
// "72"), на именах с несколькими подчёркиваниями и на нестандартных
// написаниях префикса.
//
// В реальных данных разделитель перед номером встречается и как "_", и как
// "-" ("DS253_66" и "DS253-67" в одном объекте), причём в базе и в шкафу он
// может отличаться у одной и той же позиции. Поэтому перед сравнением обе
// стороны приводятся к единому виду.
function normalizeSeparators(s) {
  return String(s).toLowerCase().replace(/[-\u2010-\u2015]/g, '_');
}

function matchSwitchInText(text, magSwitches) {
  if (!text) return null;
  const normText = normalizeSeparators(text);
  // Пробелы по краям имени встречаются после импорта из Excel и ломали
  // сопоставление, поэтому сравниваем по обрезанному виду, а возвращаем
  // имя ровно таким, как оно лежит в базе — по нему потом идёт сверка.
  const list = magSwitches.filter(Boolean)
    .map(sw => ({ raw: sw, norm: normalizeSeparators(String(sw).trim()) }))
    .sort((a, b) => b.norm.length - a.norm.length);

  // 1. Прямое вхождение полного имени — самый надёжный случай:
  //    "Коммутатор DS253-72" находит "DS253_72" и наоборот. Сортировка по
  //    убыванию длины нужна, чтобы более короткое имя не перехватило более
  //    длинное (например, MAG134_7 не должен срабатывать на MAG134_70).
  for (const sw of list) {
    if (sw.norm && normText.includes(sw.norm)) return sw.raw;
  }

  // 2. Запасной вариант — по числовому окончанию. Нужен для коротких
  //    обозначений из шаблонов ("SW_72") и для записей, сделанных до
  //    автоматического переименования. Числа сравниваются как числа,
  //    поэтому "072" и "72" считаются одним и тем же.
  const nums = [...normText.matchAll(/_(\d+)/g)].map(m => Number(m[1]));
  if (!nums.length) return null;
  for (const sw of list) {
    const m = sw.norm.match(/_(\d+)$/);
    if (m && nums.includes(Number(m[1]))) return sw.raw;
  }
  return null;
}

// Собирает по ВСЕМ шкафам объекта карту "коммутатор → где он указан".
// Ключ — полное имя коммутатора из базы, а не номер: так исключается
// возможность разойтись из-за формата записи.
async function getAllSwitchRefsForMag(mag) {
  const cabinets = await db.all('SELECT id, name FROM cabinets WHERE mag = ?', mag);
  const magSwitches = (await db.all('SELECT sw FROM switches WHERE mag = ?', mag)).map(r => r.sw);
  const refs = new Map(); // 'DS253_72' -> {cabinetId, cabinetName, unit}
  for (const cab of cabinets) {
    const items = await db.all('SELECT unit, name FROM cabinet_items WHERE cabinet_id = ?', cab.id);
    for (const item of items) {
      const sw = matchSwitchInText(item.name, magSwitches);
      // Если один коммутатор указан в нескольких местах — оставляем первое
      // найденное: это подсказка "куда посмотреть", а не источник истины.
      if (sw && !refs.has(sw)) {
        refs.set(sw, { cabinetId: cab.id, cabinetName: cab.name, unit: item.unit });
      }
    }
  }
  return refs;
}

async function annotateCabinetItems(mag, cabinetName, items) {
  // Сопоставление ведёт matchSwitchInText — та же логика, что и в
  // getAllSwitchRefsForMag, чтобы проверка шкафа и список неразмещённых
  // не могли разойтись в оценке одной и той же позиции.
  const magRows = await db.all('SELECT sw, shkaf FROM switches WHERE mag = ?', mag);
  const magSwitches = magRows.map(r => r.sw);
  return items.map(item => {
    const sw = matchSwitchInText(item.name, magSwitches);
    if (!sw) return item;
    const row = magRows.find(r => r.sw === sw);
    const base = { matchedSw: row.sw, switchExists: true };
    if (row.shkaf && !shkafNamesMatch(row.shkaf, cabinetName)) {
      return Object.assign({}, item, base, { shkafMismatch: true, actualShkaf: row.shkaf });
    }
    return Object.assign({}, item, base);
  });
}

app.get('/api/cabinets', authMiddleware, async (req, res) => {
  const mag = req.query.mag;
  if (!mag) return res.status(400).json({ error: 'Укажите mag' });
  const scopeErr = await checkMagScope(req.user.username, mag);
  if (scopeErr) return res.status(403).json({ error: scopeErr });
  const cabinets = await db.all('SELECT * FROM cabinets WHERE mag = ? ORDER BY name', mag);
  res.json(cabinets);
});

app.post('/api/cabinets', authMiddleware, requireEdit, async (req, res) => {
  const { mag, name, characteristic, location } = req.body || {};
  if (!mag || !name) return res.status(400).json({ error: 'mag и name обязательны' });
  const scopeErr = await checkMagScope(req.user.username, mag);
  if (scopeErr) return res.status(403).json({ error: scopeErr });
  const now = Date.now();
  const cabinet = await db.get('INSERT INTO cabinets (mag, name, characteristic, location, created_at) VALUES (?, ?, ?, ?, ?) RETURNING *',
    mag, name, characteristic || null, location || null, now);
  broadcastEvent('cabinet', { mag, action: 'created', cabinet, user: req.user.username, displayName: req.user.displayName });
  res.json(cabinet);
});

app.put('/api/cabinets/:id', authMiddleware, requireEdit, async (req, res) => {
  const id = Number(req.params.id);
  const existing = await db.get('SELECT * FROM cabinets WHERE id = ?', id);
  if (!existing) return res.status(404).json({ error: 'Шкаф не найден' });
  const scopeErr = await checkMagScope(req.user.username, existing.mag);
  if (scopeErr) return res.status(403).json({ error: scopeErr });
  const { name, characteristic, location } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name обязателен' });
  await db.run('UPDATE cabinets SET name = ?, characteristic = ?, location = ? WHERE id = ?', name, characteristic || null, location || null, id);
  const cabinet = await db.get('SELECT * FROM cabinets WHERE id = ?', id);
  broadcastEvent('cabinet', { mag: existing.mag, action: 'updated', cabinet, user: req.user.username, displayName: req.user.displayName });
  res.json(cabinet);
});

app.delete('/api/cabinets/:id', authMiddleware, requireEdit, async (req, res) => {
  const id = Number(req.params.id);
  const existing = await db.get('SELECT * FROM cabinets WHERE id = ?', id);
  if (!existing) return res.status(404).json({ error: 'Шкаф не найден' });
  const scopeErr = await checkMagScope(req.user.username, existing.mag);
  if (scopeErr) return res.status(403).json({ error: scopeErr });
  await db.run('DELETE FROM cabinet_items WHERE cabinet_id = ?', id);
  await db.run('DELETE FROM cabinets WHERE id = ?', id);
  broadcastEvent('cabinet', { mag: existing.mag, action: 'deleted', cabinetId: id, user: req.user.username, displayName: req.user.displayName });
  res.json({ id, deleted: true });
});

app.get('/api/cabinets/:id/items', authMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  const cabinet = await db.get('SELECT * FROM cabinets WHERE id = ?', id);
  if (!cabinet) return res.status(404).json({ error: 'Шкаф не найден' });
  const scopeErr = await checkMagScope(req.user.username, cabinet.mag);
  if (scopeErr) return res.status(403).json({ error: scopeErr });
  const items = await db.all('SELECT * FROM cabinet_items WHERE cabinet_id = ? ORDER BY unit DESC', id);
  res.json(await annotateCabinetItems(cabinet.mag, cabinet.name, items));
});

// Полная замена содержимого шкафа за один вызов — form как единый документ,
// а не пачка отдельных CRUD-операций на каждый юнит.
app.put('/api/cabinets/:id/items', authMiddleware, requireEdit, async (req, res) => {
  const id = Number(req.params.id);
  const cabinet = await db.get('SELECT * FROM cabinets WHERE id = ?', id);
  if (!cabinet) return res.status(404).json({ error: 'Шкаф не найден' });
  const scopeErr = await checkMagScope(req.user.username, cabinet.mag);
  if (scopeErr) return res.status(403).json({ error: scopeErr });
  const items = req.body && req.body.items;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'Ожидался массив items' });

  try {
    await db.tx(async (t) => {
      await t.run('DELETE FROM cabinet_items WHERE cabinet_id = ?', id);
      for (const it of items) {
        const unit = Number(it.unit);
        if (!Number.isInteger(unit)) continue;
        await t.run('INSERT INTO cabinet_items (cabinet_id, unit, name, comment) VALUES (?, ?, ?, ?)',
          id, unit, (it.name || '').toString(), (it.comment || '').toString());
      }
    });
  } catch (e) {
    console.error('Не удалось сохранить содержимое шкафа:', e.message);
    return res.status(500).json({ error: 'Не удалось сохранить содержимое шкафа' });
  }

  const saved = await db.all('SELECT * FROM cabinet_items WHERE cabinet_id = ? ORDER BY unit DESC', id);
  const annotated = await annotateCabinetItems(cabinet.mag, cabinet.name, saved);
  broadcastEvent('cabinet-items', { mag: cabinet.mag, cabinetId: id, user: req.user.username, displayName: req.user.displayName });
  res.json(annotated);
});

// Массовый импорт шкафов из Excel-выгрузки (разобранной на клиенте) —
// как и /api/switches/bulk, полностью доверяем уже распарсенным данным,
// сама логика чтения xlsx на клиенте. Шкаф ищем по паре (mag, name): если
// такой уже есть — обновляем шапку и целиком заменяем список юнитов, если
// нет — создаём. Так повторная загрузка того же файла после правок не
// плодит дублей шкафов.
app.post('/api/cabinets/import', authMiddleware, requireEdit, async (req, res) => {
  const { mag, cabinets } = req.body || {};
  if (!mag || !Array.isArray(cabinets)) return res.status(400).json({ error: 'mag и cabinets обязательны' });
  const scopeErr = await checkMagScope(req.user.username, mag);
  if (scopeErr) return res.status(403).json({ error: scopeErr });

  const now = Date.now();
  let created = 0, updated = 0;
  try {
    await db.tx(async (t) => {
      for (const cab of cabinets) {
        if (!cab.name) continue;
        const existing = await t.get('SELECT id FROM cabinets WHERE mag = ? AND name = ?', mag, cab.name);
        let cabinetId;
        if (existing) {
          await t.run('UPDATE cabinets SET characteristic = ?, location = ? WHERE id = ?', cab.characteristic || null, cab.location || null, existing.id);
          cabinetId = existing.id;
          updated++;
        } else {
          // RETURNING отдаёт идентификатор созданной записи — в PostgreSQL
          // это штатный способ вместо отдельного запроса за последним id.
          const row = await t.get('INSERT INTO cabinets (mag, name, characteristic, location, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id',
            mag, cab.name, cab.characteristic || null, cab.location || null, now);
          cabinetId = row.id;
          created++;
        }
        await t.run('DELETE FROM cabinet_items WHERE cabinet_id = ?', cabinetId);
        for (const it of (cab.items || [])) {
          const unit = Number(it.unit);
          if (!Number.isInteger(unit)) continue;
          await t.run('INSERT INTO cabinet_items (cabinet_id, unit, name, comment) VALUES (?, ?, ?, ?)',
            cabinetId, unit, (it.name || '').toString(), (it.comment || '').toString());
        }
      }
    });
  } catch (e) {
    console.error('Не удалось импортировать шкафы:', e.message);
    return res.status(500).json({ error: 'Не удалось импортировать шкафы' });
  }
  broadcastEvent('cabinet', { mag, action: 'imported', user: req.user.username, displayName: req.user.displayName });
  res.json({ mag, created, updated });
});

// Обратная ссылка: где физически стоит конкретный коммутатор, если вообще
// где-то указан. sw — полный вид ("MAG134_74"); номер для поиска — то, что
// после последнего "_".
app.get('/api/switches/:mag/:sw/location', authMiddleware, async (req, res) => {
  const { mag, sw } = req.params;
  const scopeErr = await checkMagScope(req.user.username, mag);
  if (scopeErr) return res.status(403).json({ error: scopeErr });
  const ref = (await getAllSwitchRefsForMag(mag)).get(sw);
  if (!ref) return res.json({ found: false });
  res.json({ found: true, cabinetId: ref.cabinetId, cabinetName: ref.cabinetName, unit: ref.unit });
});

// Обратная проверка: какие коммутаторы объекта вообще нигде не указаны ни
// в одном его шкафу — отдельный показатель "насколько шкафы объекта вообще
// документированы", не то же самое, что несовпадение шкафа у уже указанных.
app.get('/api/cabinets/undocumented', authMiddleware, async (req, res) => {
  const mag = req.query.mag;
  if (!mag) return res.status(400).json({ error: 'Укажите mag' });
  const scopeErr = await checkMagScope(req.user.username, mag);
  if (scopeErr) return res.status(403).json({ error: scopeErr });
  const refs = await getAllSwitchRefsForMag(mag);
  const allSwitches = await db.all('SELECT sw FROM switches WHERE mag = ?', mag);
  // Сравниваем напрямую по именам из карты ссылок. Прежняя версия извлекала
  // номер из имени заново и при неудаче считала коммутатор неразмещённым
  // безусловно — из-за этого любое имя, не оканчивающееся на "_<цифры>"
  // (например, с лишним пробелом в конце после импорта), всегда попадало
  // в список, даже когда фактически было указано в шкафу.
  const undocumented = allSwitches
    .map(r => r.sw)
    .filter(sw => !refs.has(sw));
  res.json({ mag, total: allSwitches.length, undocumented });
});

// Поиск по содержимому шкафов — по всей базе сразу, с учётом зоны
// ответственности. % и _ у SQLite LIKE сами по себе wildcard-символы —
// экранируем то, что реально ввёл пользователь, иначе поиск "s4_2" случайно
// подхватил бы "s4X2".
app.get('/api/cabinets/search', authMiddleware, async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.json({ results: [] });
  const w = magScopeWhere(await getUserAllowedMags(req.user.username), 'c.mag');
  const escaped = q.replace(/[%_\\]/g, '\\$&');
  const pattern = '%' + escaped + '%';
  const rows = await db.all(`
    SELECT ci.unit, ci.name, ci.comment, c.id as cabinet_id, c.name as cabinet_name, c.mag
    FROM cabinet_items ci
    JOIN cabinets c ON c.id = ci.cabinet_id
    WHERE (${w.clause}) AND (ci.name LIKE ? ESCAPE '\\' OR ci.comment LIKE ? ESCAPE '\\')
    ORDER BY c.mag, c.name, ci.unit DESC
    LIMIT 30
  `, ...w.params, pattern, pattern);
  res.json({ results: rows });
});

// ── Коммутаторы (постоянное хранение, замена ежеразовой загрузки Excel) ───
// Наружу отдаём объекты с теми же русскими ключами, что фронтенд уже
// использует для строк из Excel — так на клиенте не пришлось переписывать
// логику таблиц/дашборда/замечаний, которая ждёт именно такую форму данных.
function switchRowOut(r) {
  return {
    Mag: r.mag,
    'Шкаф': r.shkaf || '',
    'Коммутатор': r.sw,
    'IP Коммутатора': r.ip || '',
    'UP': r.up || '',
    'DOWN': r.down_ || '',
    'Расположение': r.location || '',
    'SN Netbox': r.sn_netbox || '',
    'SN Lyra': r.sn_lyra || '',
    'Модель SW': r.model || '',
    'Комментарий': r.comment || '',
    '_Комментарий_Лира': r.comment_lyra || '',
    _updatedBy: r.updated_by || null,
    _updatedByName: r.updated_by_name || r.updated_by || null,
    _updatedAt: r.updated_at || null,
  };
}

// Добавление или обновление коммутатора по ключу (объект + имя).
// EXCLUDED — стандартное имя для значений, которые пытались вставить;
// используется в блоке DO UPDATE, чтобы не перечислять их заново.
const UPSERT_SWITCH_SQL = `
  INSERT INTO switches (mag, sw, shkaf, ip, up, down_, location, sn_netbox, sn_lyra, model, comment, comment_lyra, updated_by, updated_by_name, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (mag, sw) DO UPDATE SET
    shkaf = EXCLUDED.shkaf, ip = EXCLUDED.ip, up = EXCLUDED.up, down_ = EXCLUDED.down_,
    location = EXCLUDED.location, sn_netbox = EXCLUDED.sn_netbox, sn_lyra = EXCLUDED.sn_lyra,
    model = EXCLUDED.model, comment = EXCLUDED.comment, comment_lyra = EXCLUDED.comment_lyra,
    updated_by = EXCLUDED.updated_by, updated_by_name = EXCLUDED.updated_by_name, updated_at = EXCLUDED.updated_at
`;

// Порядок значений строго соответствует порядку столбцов в запросе выше.
function upsertSwitchParams(body, username, displayName, now) {
  const str = (v) => (v != null ? String(v) : '');
  return [
    String(body.mag || ''), String(body.sw || ''),
    str(body.shkaf), str(body.ip), str(body.up), str(body.down),
    str(body.location), str(body.sn_netbox), str(body.sn_lyra), str(body.model),
    str(body.comment), str(body.comment_lyra),
    username, displayName || username, now,
  ];
}

async function upsertSwitchFromClient(body, username, displayName) {
  const now = Date.now();
  await db.run(UPSERT_SWITCH_SQL, ...upsertSwitchParams(body, username, displayName, now));
  return now;
}

app.get('/api/switches', authMiddleware, async (req, res) => {
  const w = magScopeWhere(await getUserAllowedMags(req.user.username));
  const rows = await db.all(`SELECT * FROM switches WHERE ${w.clause}`, ...w.params);
  res.json(rows.map(switchRowOut));
});

// Массовый импорт/обновление — из уже распарсенного на клиенте Excel.
// Используется один раз при первой настройке (перенос текущих ~1600 строк)
// и далее по желанию, если приходит пачка новых свитчей с нового объекта.
// Всё выполняется одной транзакцией: при ошибке на любой строке отменяется
// весь импорт, чтобы не остаться с наполовину применёнными данными.
app.post('/api/switches/bulk', authMiddleware, requireEdit, async (req, res) => {
  const rows = req.body && req.body.rows;
  if (!Array.isArray(rows)) return res.status(400).json({ error: 'Ожидался массив rows' });
  const allowedMags = await getUserAllowedMags(req.user.username); // null = без ограничений
  let count = 0, skipped = 0;
  try {
    await db.tx(async (t) => {
      const now = Date.now();
      for (const item of rows) {
        if (!item || !item.mag || !item.sw) continue;
        if (allowedMags !== null && !allowedMags.has(item.mag)) { skipped++; continue; }
        await t.run(UPSERT_SWITCH_SQL,
          ...upsertSwitchParams(item, req.user.username, req.user.displayName, now));
        count++;
      }
    });
  } catch (e) {
    console.error('Ошибка массового импорта, откат:', e);
    return res.status(500).json({ error: 'Ошибка импорта, изменения отменены' });
  }
  // Одно общее событие на весь импорт, а не по одному на каждую из потенциально
  // тысяч строк — так подключённые клиенты просто перезагрузят список целиком,
  // вместо того чтобы обрабатывать шквал из тысяч отдельных сообщений разом.
  if (count > 0) broadcastEvent('switches_bulk', {});
  res.json({ imported: count, total: rows.length, skippedOutOfScope: skipped });
});

// Создание/обновление одного коммутатора — карточка на фронтенде.
app.post('/api/switches', authMiddleware, requireEdit, async (req, res) => {
  const { mag, sw } = req.body || {};
  if (!mag || !sw) return res.status(400).json({ error: 'mag и sw обязательны' });
  const scopeErr = await checkMagScope(req.user.username, mag);
  if (scopeErr) return res.status(403).json({ error: scopeErr });
  const now = await upsertSwitchFromClient(req.body, req.user.username, req.user.displayName);
  const row = await db.get('SELECT * FROM switches WHERE mag = ? AND sw = ?', mag, sw);
  const out = switchRowOut(row);
  broadcastEvent('switch', { row: out });
  res.json(out);
});

app.delete('/api/switches/:mag/:sw', authMiddleware, requireEdit, async (req, res) => {
  const { mag, sw } = req.params;
  const scopeErr = await checkMagScope(req.user.username, mag);
  if (scopeErr) return res.status(403).json({ error: scopeErr });
  await db.run('DELETE FROM switches WHERE mag = ? AND sw = ?', mag, sw);
  // Заодно подчищаем связанные заметки/статусы — не оставляем висячих записей.
  await db.run('DELETE FROM notes WHERE mag = ? AND sw = ?', mag, sw);
  await db.run('DELETE FROM statuses WHERE mag = ? AND sw = ?', mag, sw);
  broadcastEvent('switch_delete', { mag, sw });
  res.json({ mag: mag, sw: sw, deleted: true });
});

// ── Дивизионы (только просмотр — всем; изменение — только role='developer') ─
// Отдаём в том же виде, в каком раньше жил захардкоженный DIV_MAP на
// фронтенде: {"DIV 1": ["010","011",...], ...} — минимум переписывания там.
app.get('/api/divisions', authMiddleware, async (req, res) => {
  const divisions = await db.all('SELECT name FROM divisions ORDER BY name');
  const mags = await db.all('SELECT div_name, mag FROM division_mags');
  const result = {};
  for (const d of divisions) result[d.name] = [];
  for (const m of mags) { if (result[m.div_name]) result[m.div_name].push(m.mag); }
  res.json(result);
});

app.post('/api/divisions', authMiddleware, requireUnrestrictedDeveloper, async (req, res) => {
  const name = String((req.body && req.body.name) || '').trim();
  if (!name) return res.status(400).json({ error: 'Укажите название дивизиона' });
  const existing = await db.get('SELECT name FROM divisions WHERE name = ?', name);
  if (existing) return res.status(409).json({ error: 'Такой дивизион уже есть' });
  await db.run('INSERT INTO divisions (name, created_at) VALUES (?, ?)', name, Date.now());
  res.json({ name, mags: [] });
});

app.delete('/api/divisions/:name', authMiddleware, requireUnrestrictedDeveloper, async (req, res) => {
  const { name } = req.params;
  await db.run('DELETE FROM division_mags WHERE div_name = ?', name);
  await db.run('DELETE FROM divisions WHERE name = ?', name);
  res.json({ name, deleted: true });
});

app.post('/api/divisions/:name/mags', authMiddleware, requireUnrestrictedDeveloper, async (req, res) => {
  const { name } = req.params;
  const mag = cleanMag((req.body && req.body.mag) || '');
  if (!mag) return res.status(400).json({ error: 'Укажите номер магазина (MAG/DS)' });
  const div = await db.get('SELECT name FROM divisions WHERE name = ?', name);
  if (!div) return res.status(404).json({ error: 'Дивизион не найден' });
  await db.run('INSERT INTO division_mags (div_name, mag) VALUES (?, ?) ON CONFLICT DO NOTHING', name, mag);
  res.json({ name, mag });
});

app.delete('/api/divisions/:name/mags/:mag', authMiddleware, requireUnrestrictedDeveloper, async (req, res) => {
  const { name, mag } = req.params;
  await db.run('DELETE FROM division_mags WHERE div_name = ? AND mag = ?', name, mag);
  res.json({ name, mag, deleted: true });
});

// ── Общая формула подсчёта замечаний ──────────────────────────────────────
// ЗЕРКАЛИТ логику renderDashKPI/ISSUE_DEFS на фронтенде
// (frontend/src/domain/issues.js) — те же 6 проверок, тот же порядок
// через взаимоисключающий else-if. Если логика подсчёта замечаний
// когда-нибудь изменится на фронтенде, этот запрос нужно поправить вместе с
// ней, иначе цифры в PDF-отчёте разойдутся с цифрами в самом приложении.
const ISSUE_COUNT_SQL = `(
  (CASE WHEN ip IS NULL OR ip='' THEN 1 ELSE 0 END) +
  (CASE WHEN location IS NULL OR location='' THEN 1 ELSE 0 END) +
  (CASE WHEN shkaf IS NULL OR shkaf='' THEN 1 ELSE 0 END) +
  (CASE WHEN sn_lyra IS NULL OR sn_lyra='' THEN 1 WHEN LOWER(sn_lyra) LIKE '%не найден%' THEN 1 ELSE 0 END) +
  (CASE WHEN sn_netbox IS NULL OR sn_netbox='' THEN 1 ELSE 0 END) +
  (CASE WHEN model IS NULL OR model='' THEN 1 ELSE 0 END)
)`;

// PDF-отчёт для руководства — доступ только для роли developer. Зона
// видимости — та же самая, что и во всём остальном приложении: если у
// человека ограниченный доступ по дивизионам, отчёт молча сузится до них же,
// а не потребует отдельной настройки. get UserAllowedMags и divisionsFor —
// та же функция и та же таблица user_divisions, что и везде в приложении.
app.get('/api/reports/management.pdf', authMiddleware, requireDeveloper, async (req, res) => {
  try {
    const allowedMags = await getUserAllowedMags(req.user.username);
    let scopeLabel = 'Вся сеть · все дивизионы';
    if (allowedMags !== null) {
      const divRows = await db.all('SELECT div_name FROM user_divisions WHERE username = ?', req.user.username);
      const divNames = divRows.map(r => r.div_name).join(', ') || '—';
      scopeLabel = `Зона ответственности: ${divNames}`;
    }
    const pdfBytes = await buildManagementReportPdf({
      scopeLabel,
      allowedMags,
      generatedByName: req.user.displayName || req.user.username,
    });
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="switch-inspector-report-${new Date().toISOString().slice(0, 10)}.pdf"`,
    });
    res.send(Buffer.from(pdfBytes));
  } catch (e) {
    console.error('Ошибка формирования PDF-отчёта:', e);
    res.status(500).json({ error: 'Не удалось сформировать отчёт' });
  }
});

// ── Обработка ошибок ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

// ── Запуск ───────────────────────────────────────────────────────────────
// Сервер поднимается только после успешного создания схемы: принимать
// запросы к неготовой базе бессмысленно, лучше упасть сразу и понятно.
async function start() {
  try {
    await pool.query('SELECT 1');
  } catch (e) {
    console.error('Не удалось подключиться к базе данных: ' + e.message);
    console.error('Проверьте переменные PGHOST, PGDATABASE, PGUSER, PGPASSWORD либо DATABASE_URL.');
    process.exit(1);
  }

  await initDatabase();
  await startEventListener();

  const server = app.listen(PORT, '0.0.0.0', async () => {
    console.log('Сервер запущен: http://0.0.0.0:' + PORT);
    console.log('База данных: PostgreSQL, ' + (process.env.PGDATABASE || 'switch_inventory'));
    const row = await db.get('SELECT COUNT(*) as c FROM users');
    if (Number(row.c) === 0) {
      console.log('');
      console.log('⚠ Пользователей ещё нет. Создайте первого администратора:');
      console.log('  node add-user.js admin ВашНадёжныйПароль "Администратор" admin');
      console.log('');
    }
    // Уборка устаревших записей раз в час. Выполняется всеми репликами —
    // запросы идемпотентны, повторное удаление уже удалённого безвредно.
    setInterval(() => { cleanupLoginAttempts(); cleanupOauthStates(); }, 60 * 60 * 1000);
  });

  // Корректное завершение: при обновлении оркестратор сначала присылает
  // сигнал и лишь потом снимает контейнер. За это время нужно закрыть
  // открытые соединения, иначе пользователи получат обрыв на полуслове.
  const shutdown = async (signal) => {
    console.log('Получен ' + signal + ', завершаю работу');
    server.close();
    for (const client of sseClients) {
      try { client.res.end(); } catch (e) { /* соединение уже закрыто */ }
    }
    try { if (notifyClient) await notifyClient.end(); } catch (e) { /* уже закрыто */ }
    try { await pool.end(); } catch (e) { /* уже закрыт */ }
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// Последний рубеж: если отказ всё же не перехвачен, записываем причину
// и завершаемся управляемо — оркестратор поднимет копию заново. Молча
// продолжать работу после такого нельзя: состояние может быть нарушено.
process.on('unhandledRejection', (reason) => {
  console.error('Необработанный отказ:', reason);
  process.exit(1);
});

start().catch((e) => {
  console.error('Ошибка при запуске:', e);
  process.exit(1);
});
