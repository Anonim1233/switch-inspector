/**
 * Журнал действий. Доступен роли «разработчик».
 *
 * Показывает, кто и что менял, с отбором по пользователю, типу события
 * и периоду. Выгружается в файл — тем же отбором, что виден на экране.
 */
import { useEffect, useState, useCallback } from 'react';
import { api, downloadFile } from '../../api/client';
import styles from './AuditModal.module.css';

/** Понятные названия событий. Ключи приходят с сервера как есть. */
const ACTION_LABELS = {
  login_corporate: 'Вход корпоративный',
  login_local: 'Вход служебный',
  login_failed: 'Неудачная попытка входа',
  user_role_change: 'Изменение роли',
  user_scope_change: 'Изменение зоны ответственности',
  user_delete: 'Удаление учётной записи',
  switch_create: 'Добавление коммутатора',
  switch_update: 'Изменение коммутатора',
  switch_delete: 'Удаление коммутатора',
  bulk_import: 'Массовая загрузка',
  cabinet_items_save: 'Изменение шкафа',
  cabinets_import: 'Загрузка шкафов',
  note_delete: 'Удаление заметки',
  audit_export: 'Выгрузка журнала',
};

/** События, требующие внимания при разборе. */
const ALERT_ACTIONS = new Set([
  'login_failed', 'login_local', 'user_role_change',
  'user_delete', 'user_scope_change',
]);

export default function AuditModal({ onClose }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({ actions: [], users: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [username, setUsername] = useState('');
  const [action, setAction] = useState('');
  const [days, setDays] = useState('7');
  const [search, setSearch] = useState('');

  const buildQuery = useCallback(() => {
    const params = new URLSearchParams();
    if (username) params.set('username', username);
    if (action) params.set('action', action);
    if (search) params.set('search', search);
    if (days) {
      params.set('from', String(Date.now() - Number(days) * 24 * 60 * 60 * 1000));
    }
    return params.toString();
  }, [username, action, days, search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get(`/api/audit?${buildQuery()}&limit=500`);
      setRows(data.rows);
      setTotal(data.total);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.get('/api/audit/filters').then(setFilters).catch(() => {});
  }, []);

  useEffect(() => {
    function handleKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  async function handleExport() {
    try {
      const date = new Date().toISOString().slice(0, 10);
      await downloadFile(`/api/audit/export?${buildQuery()}`, `журнал-действий-${date}.csv`);
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <>
      <button className={styles.overlay} onClick={onClose} aria-label="Закрыть" />

      <div className={styles.modal} role="dialog" aria-label="Журнал действий">
        <div className={styles.header}>
          <div>
            <div className={styles.title}>Журнал действий</div>
            <div className={styles.subtitle}>
              {loading ? 'Загрузка…' : `показано ${rows.length} из ${total}`}
            </div>
          </div>
          <div className={styles.spacer} />
          <button className={styles.close} onClick={onClose} aria-label="Закрыть">×</button>
        </div>

        <div className={styles.filters}>
          <select className={styles.select} value={days} onChange={(e) => setDays(e.target.value)}>
            <option value="1">За сутки</option>
            <option value="7">За неделю</option>
            <option value="30">За месяц</option>
            <option value="">За всё время</option>
          </select>

          <select className={styles.select} value={username} onChange={(e) => setUsername(e.target.value)}>
            <option value="">Все пользователи</option>
            {filters.users.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>

          <select className={styles.select} value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">Все события</option>
            {filters.actions.map((a) => (
              <option key={a} value={a}>{ACTION_LABELS[a] ?? a}</option>
            ))}
          </select>

          <input
            className={styles.search}
            placeholder="Поиск по объекту…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div className={styles.spacer} />

          <button className={styles.button} onClick={handleExport} disabled={loading}>
            Выгрузить в файл
          </button>
        </div>

        <div className={styles.body}>
          {error && <div className={styles.error}>{error}</div>}

          {!loading && rows.length === 0 && !error && (
            <div className={styles.empty}>Записей не найдено.</div>
          )}

          {rows.length > 0 && (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Когда</th>
                  <th>Кто</th>
                  <th>Что</th>
                  <th>Объект</th>
                  <th>Подробности</th>
                  <th>Адрес</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={index} className={ALERT_ACTIONS.has(row.action) ? styles.rowAlert : ''}>
                    <td className={styles.nowrap}>
                      {new Date(Number(row.ts)).toLocaleString('ru-RU')}
                    </td>
                    <td>{row.username}</td>
                    <td>{ACTION_LABELS[row.action] ?? row.action}</td>
                    <td className={styles.mono}>{row.target || '—'}</td>
                    <td className={styles.details}>{formatDetails(row.details)}</td>
                    <td className={styles.mono}>{row.ip || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * Подробности хранятся в виде структуры. Разворачиваем в читаемый вид:
 * необработанная запись занимала бы полстроки и не читалась бы взглядом.
 */
function formatDetails(details) {
  if (!details) return '—';
  try {
    const data = JSON.parse(details);
    return Object.entries(data)
      .map(([key, value]) => {
        if (value && typeof value === 'object' && 'было' in value) {
          return `${key}: ${value.было ?? 'пусто'} → ${value.стало ?? 'пусто'}`;
        }
        return `${key}: ${Array.isArray(value) ? value.join(', ') : value}`;
      })
      .join('; ');
  } catch {
    return details;
  }
}
