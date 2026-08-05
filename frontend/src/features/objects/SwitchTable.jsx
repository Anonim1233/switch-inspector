/**
 * Таблица коммутаторов выбранного объекта.
 *
 * Поддерживает сортировку по любой колонке, поиск и два фильтра:
 * только с замечаниями и скрыть обработанные.
 */
import { useMemo, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';

import { selectGrouped, selectPrefixMap } from '../../store/slices/switchesSlice';
import { selectIsProcessed, setProcessed } from '../../store/slices/collabSlice';
import { selectCanEditObject } from '../../store/slices/authSlice';
import { toggleMobileSidebar } from '../../store/slices/uiSlice';
import { objectLabel } from '../../domain/issues';
import { printObjectPassport } from '../print/printing';
import { buildObjectTicket } from '../../domain/tickets';
import TicketModal from '../tickets/TicketModal';
import NetboxExport from './NetboxExport';
import styles from './SwitchTable.module.css';

/** Колонки в том же порядке, что и в прежней версии.
 *  secondary — скрывается на узких экранах. */
const COLUMNS = [
  { key: 'Шкаф',            label: 'Шкаф' },
  { key: 'Коммутатор',      label: 'Коммутатор', mono: true },
  { key: 'IP Коммутатора',  label: 'IP-адрес', mono: true },
  { key: 'Расположение',    label: 'Расположение' },
  { key: 'UP',              label: 'UP', secondary: true },
  { key: 'DOWN',            label: 'DOWN', secondary: true },
  { key: 'SN Netbox',       label: 'SN Netbox', mono: true, secondary: true },
  { key: 'SN Lyra',         label: 'SN Lyra', mono: true, secondary: true },
  { key: 'Модель SW',       label: 'Модель SW', secondary: true },
  { key: 'Замечания',       label: 'Замечания' },
];

export default function SwitchTable({ mag, onOpenCard }) {
  const dispatch = useDispatch();
  const grouped = useSelector(selectGrouped);
  const prefixMap = useSelector(selectPrefixMap);
  const statuses = useSelector((state) => state.collab.statuses);
  const canEdit = useSelector((state) => selectCanEditObject(state, mag));

  const [search, setSearch] = useState('');
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [hideDone, setHideDone] = useState(false);
  const [sort, setSort] = useState({ column: null, desc: false });
  const [ticket, setTicket] = useState(null);
  const [netboxOpen, setNetboxOpen] = useState(false);

  const rows = useMemo(() => {
    let result = grouped[mag] ?? [];

    if (issuesOnly) result = result.filter((r) => r._issues > 0);
    if (hideDone) result = result.filter((r) => !statuses[`${mag}__${r['Коммутатор']}`]);

    const query = search.trim().toLowerCase();
    if (query) {
      result = result.filter((row) =>
        Object.values(row).some((value) => String(value).toLowerCase().includes(query))
      );
    }

    if (sort.column) {
      /* Сравнение с учётом языка и чисел: без него «MAG134_9» оказался бы
         после «MAG134_10», а порядок букв в русских названиях был бы
         неверным. */
      result = [...result].sort((a, b) => {
        const diff = String(a[sort.column] || '').localeCompare(
          String(b[sort.column] || ''), 'ru', { numeric: true }
        );
        return sort.desc ? -diff : diff;
      });
    }

    return result;
  }, [grouped, mag, issuesOnly, hideDone, statuses, search, sort]);

  function handleSort(column) {
    setSort((prev) =>
      prev.column === column ? { column, desc: !prev.desc } : { column, desc: false }
    );
  }

  function handleToggleDone(event, row) {
    event.stopPropagation();
    const sw = row['Коммутатор'];
    const done = Boolean(statuses[`${mag}__${sw}`]);
    dispatch(setProcessed({ mag, sw, done: !done }));
  }

  return (
    <>
      <div className={styles.toolbar}>
        <button
          className={styles.button}
          onClick={() => dispatch(toggleMobileSidebar())}
          aria-label="Список объектов"
        >
          ☰
        </button>
        <span className={styles.title}>{objectLabel(mag, prefixMap)}</span>
        <span className={styles.rowCount}>{rows.length} записей</span>

        <div className={styles.spacer} />

        <button
          className={`${styles.button} ${issuesOnly ? styles.buttonActive : ''}`}
          onClick={() => setIssuesOnly((v) => !v)}
        >
          Только с замечаниями
        </button>
        <button
          className={`${styles.button} ${hideDone ? styles.buttonActive : ''}`}
          onClick={() => setHideDone((v) => !v)}
        >
          Скрыть обработанные
        </button>
        <button
          className={styles.button}
          onClick={() => printObjectPassport(objectLabel(mag, prefixMap), rows)}
        >
          Паспорт объекта
        </button>
        {canEdit && (
          <button className={styles.button} onClick={() => setNetboxOpen(true)}>
            Отправить в NetBox
          </button>
        )}
        <button
          className={styles.button}
          onClick={() => {
            const result = buildObjectTicket(rows, objectLabel(mag, prefixMap));
            if (result) setTicket(result);
            else alert('На этом объекте нет записей с замечаниями — заявка не требуется.');
          }}
        >
          Сформировать заявку
        </button>
        <input
          className={styles.search}
          placeholder="Поиск…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className={styles.wrap}>
        {rows.length === 0 ? (
          <div className={styles.empty}>Записей не найдено.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.checkCell} title="Обработано">✓</th>
                {COLUMNS.map((column) => (
                  <th
                    key={column.key}
                    className={column.secondary ? styles.colSecondary : ''}
                    onClick={() => handleSort(column.key)}
                  >
                    {column.label}
                    {sort.column === column.key && (
                      <span className={styles.sortMark}>{sort.desc ? '▼' : '▲'}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const sw = row['Коммутатор'];
                const done = Boolean(statuses[`${mag}__${sw}`]);
                return (
                  <tr
                    key={sw}
                    className={`${row._issues > 0 ? styles.rowIssue : ''} ${done ? styles.rowDone : ''}`}
                    onClick={() => onOpenCard(sw)}
                  >
                    <td className={styles.checkCell} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={done}
                        disabled={!canEdit}
                        onChange={(e) => handleToggleDone(e, row)}
                        title={canEdit ? 'Отметить обработанным' : 'Недоступно для изменения'}
                      />
                    </td>
                    {COLUMNS.map((column) => (
                      <td
                        key={column.key}
                        className={[
                          column.secondary ? styles.colSecondary : '',
                          column.mono ? styles.mono : '',
                          column.key === 'Замечания' ? styles.issueText : '',
                        ].filter(Boolean).join(' ')}
                      >
                        {row[column.key] || <span className={styles.muted}>—</span>}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {ticket && <TicketModal ticket={ticket} onClose={() => setTicket(null)} />}
      {netboxOpen && (
        <NetboxExport
          mag={mag}
          objectLabel={objectLabel(mag, prefixMap)}
          onClose={() => setNetboxOpen(false)}
        />
      )}
    </>
  );
}
