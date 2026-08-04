/**
 * Карточка коммутатора: поля, заметка, отметка о проверке,
 * физическое размещение в шкафу.
 */
import { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';

import { selectGrouped, selectPrefixMap, saveSwitch, deleteSwitch } from '../../store/slices/switchesSlice';
import { selectCanEditObject } from '../../store/slices/authSlice';
import { saveNote, setProcessed } from '../../store/slices/collabSlice';
import { objectLabel } from '../../domain/issues';
import { api } from '../../api/client';
import { buildSwitchTicket } from '../../domain/tickets';
import TicketModal from '../tickets/TicketModal';
import styles from './SwitchCard.module.css';

/** Поля, доступные для правки. Ключи совпадают с теми, что принимает
 *  сервер, — соответствие задаётся здесь, чтобы не разойтись. */
const EDITABLE = [
  { label: 'Шкаф',          key: 'Шкаф',           field: 'shkaf' },
  { label: 'IP-адрес',      key: 'IP Коммутатора', field: 'ip',       mono: true, copyPing: true },
  { label: 'Расположение',  key: 'Расположение',   field: 'location' },
  { label: 'Портов UP',     key: 'UP',             field: 'up' },
  { label: 'Портов DOWN',   key: 'DOWN',           field: 'down' },
  { label: 'SN Netbox',     key: 'SN Netbox',      field: 'sn_netbox', mono: true },
  { label: 'SN Lyra',       key: 'SN Lyra',        field: 'sn_lyra',   mono: true },
  { label: 'Модель SW',     key: 'Модель SW',      field: 'model' },
  { label: 'Комментарий',   key: 'Комментарий',    field: 'comment' },
];

export default function SwitchCard({ mag, sw, onClose }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const grouped = useSelector(selectGrouped);
  const prefixMap = useSelector(selectPrefixMap);
  const canEdit = useSelector((state) => selectCanEditObject(state, mag));
  const note = useSelector((state) => state.collab.notes[`${mag}__${sw}`]);
  const done = Boolean(useSelector((state) => state.collab.statuses[`${mag}__${sw}`]));

  const row = (grouped[mag] ?? []).find((r) => r['Коммутатор'] === sw);

  const [draft, setDraft] = useState({});
  const [noteText, setNoteText] = useState('');
  const [location, setLocation] = useState({ state: 'loading' });
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);
  const [ticket, setTicket] = useState(null);

  useEffect(() => {
    if (row) {
      const initial = {};
      for (const item of EDITABLE) initial[item.field] = row[item.key] ?? '';
      setDraft(initial);
    }
    setNoteText(note?.text ?? '');
  }, [row, note]);

  /* Где физически стоит коммутатор — отдельный запрос: данные лежат
     в шкафах, которые целиком в память не загружаются. */
  useEffect(() => {
    let cancelled = false;
    setLocation({ state: 'loading' });

    api
      .get(`/api/switches/${encodeURIComponent(mag)}/${encodeURIComponent(sw)}/location`)
      .then((data) => {
        if (!cancelled) setLocation({ state: 'ready', data });
      })
      .catch(() => {
        if (!cancelled) setLocation({ state: 'error' });
      });

    return () => { cancelled = true; };
  }, [mag, sw]);

  /* Закрытие по клавише выхода — привычное поведение для окна поверх. */
  useEffect(() => {
    function handleKey(event) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  if (!row) return null;

  async function handleSave() {
    setError(null);
    try {
      await dispatch(saveSwitch({ mag, sw, ...draft })).unwrap();
      if (noteText !== (note?.text ?? '')) {
        await dispatch(saveNote({ mag, sw, text: noteText })).unwrap();
      }
      onClose();
    } catch (message) {
      setError(String(message));
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Удалить коммутатор ${sw}? Действие необратимо.`)) return;
    try {
      await dispatch(deleteSwitch({ mag, sw })).unwrap();
      onClose();
    } catch (message) {
      setError(String(message));
    }
  }

  /* В буфер кладётся готовая команда, а не голый адрес: этот адрес
     почти всегда нужен именно для проверки доступности. */
  async function copyPing(ip) {
    const command = `ping ${ip} -t`;
    try {
      await navigator.clipboard.writeText(command);
    } catch {
      const field = document.createElement('textarea');
      field.value = command;
      document.body.appendChild(field);
      field.select();
      document.execCommand('copy');
      document.body.removeChild(field);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <>
      <button className={styles.overlay} onClick={onClose} aria-label="Закрыть карточку" />

      <div className={styles.card} role="dialog" aria-label={`Коммутатор ${sw}`}>
        <div className={styles.header}>
          <div>
            <div className={styles.name}>{sw}</div>
            <div className={styles.object}>{objectLabel(mag, prefixMap)}</div>
          </div>
          <div className={styles.spacer} />
          <button className={styles.close} onClick={onClose} aria-label="Закрыть">×</button>
        </div>

        <div className={styles.body}>
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Сетевые данные</div>
            {EDITABLE.map((item) => (
              <div className={styles.field} key={item.field}>
                <span className={styles.fieldLabel}>{item.label}</span>
                {canEdit ? (
                  <input
                    className={styles.input}
                    value={draft[item.field] ?? ''}
                    onChange={(e) => setDraft((d) => ({ ...d, [item.field]: e.target.value }))}
                  />
                ) : (
                  <span className={`${styles.fieldValue} ${item.mono ? styles.mono : ''} ${!row[item.key] ? styles.missing : ''}`}>
                    {row[item.key] || 'не указано'}
                  </span>
                )}
                {item.copyPing && row[item.key] && (
                  <button
                    className={`${styles.copyBtn} ${copied ? styles.ok : ''}`}
                    onClick={() => copyPing(row[item.key])}
                    title="Скопировать команду проверки доступности"
                  >
                    {copied ? '✓' : '⎘'}
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>Физическое размещение</div>
            {location.state === 'loading' && <span className={styles.fieldValue}>Проверяю…</span>}
            {location.state === 'error' && (
              <span className={styles.fieldValue}>Не удалось проверить</span>
            )}
            {location.state === 'ready' && (
              <div className={styles.location}>
                {location.data.found ? (
                  <>
                    <span>
                      Шкаф <strong>{location.data.cabinetName}</strong>, юнит {location.data.unit}
                    </span>
                    <button
                      className={styles.button}
                      onClick={() => {
                        onClose();
                        navigate(`/racks/${mag}/${location.data.cabinetId}`);
                      }}
                    >
                      📍 Показать в шкафу
                    </button>
                  </>
                ) : (
                  <span className={styles.missing}>Не размещён ни в одном шкафу</span>
                )}
              </div>
            )}
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>Заметка</div>
            <textarea
              className={styles.note}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              disabled={!canEdit}
              placeholder={canEdit ? 'Заметка видна всей команде' : 'Заметок нет'}
            />
            {note?.display_name && (
              <div className={styles.meta}>
                {note.display_name}, {new Date(note.updated_at).toLocaleString('ru-RU')}
              </div>
            )}
          </div>

          {error && <div className={styles.error}>{error}</div>}
        </div>

        <div className={styles.footer}>
          {/* Заявка доступна и при доступе только на просмотр: заметить
              неполные данные и запросить их может любой сотрудник. */}
          {row._issues > 0 && (
            <button
              className={styles.button}
              onClick={() => setTicket(buildSwitchTicket(row, objectLabel(mag, prefixMap)))}
            >
              Сформировать заявку
            </button>
          )}
          {canEdit && (
            <>
              <button className={`${styles.button} ${styles.primary}`} onClick={handleSave}>
                Сохранить
              </button>
              <button
                className={styles.button}
                onClick={() => dispatch(setProcessed({ mag, sw, done: !done }))}
              >
                {done ? '✓ Обработано' : 'Отметить обработанным'}
              </button>
              <div className={styles.spacer} />
              <button className={`${styles.button} ${styles.danger}`} onClick={handleDelete}>
                Удалить
              </button>
            </>
          )}
          {!canEdit && <span className={styles.object}>Доступен только просмотр</span>}
        </div>
      </div>

      {ticket && <TicketModal ticket={ticket} onClose={() => setTicket(null)} />}
    </>
  );
}
