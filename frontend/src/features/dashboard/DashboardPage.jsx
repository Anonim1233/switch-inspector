/**
 * Дашборд: состояние данных по всей сети.
 *
 * Карточки категорий работают как фильтр для таблицы ниже: клик
 * отбирает записи с этим замечанием, повторный клик снимает отбор —
 * отдельной кнопки сброса нет.
 */
import { useMemo, useRef, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';

import { selectSwitches, selectGrouped, selectPrefixMap } from '../../store/slices/switchesSlice';
import { selectIsDeveloper } from '../../store/slices/authSlice';
import { setDashFilter } from '../../store/slices/uiSlice';
import { getDashboardTotals, getIssueCounts, filterProblemRows } from '../../domain/dashboard';
import { objectLabel } from '../../domain/issues';
import { downloadFile } from '../../api/client';
import { selectCanEdit } from '../../store/slices/authSlice';
import { useSwitchImport } from '../objects/useSwitchImport';
import styles from './DashboardPage.module.css';

/** Цвета категорий заданы именами тонов — здесь они превращаются
 *  в переменные оформления. */
const TONE_COLOR = { warn: 'var(--warn)', err: 'var(--err)', ok: 'var(--ok)' };

export default function DashboardPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const rows = useSelector(selectSwitches);
  const grouped = useSelector(selectGrouped);
  const prefixMap = useSelector(selectPrefixMap);
  const isDeveloper = useSelector(selectIsDeveloper);
  const canEdit = useSelector(selectCanEdit);
  const filterKey = useSelector((state) => state.ui.dashFilter);

  const [search, setSearch] = useState('');
  const [reportBusy, setReportBusy] = useState(false);

  const { state: importState, importFile } = useSwitchImport();
  const fileRef = useRef(null);
  const importBusy = importState.status === 'parsing' || importState.status === 'uploading';

  const totals = useMemo(() => getDashboardTotals(rows, grouped), [rows, grouped]);
  const issueCounts = useMemo(() => getIssueCounts(rows), [rows]);
  const problemRows = useMemo(
    () => filterProblemRows(rows, filterKey, search),
    [rows, filterKey, search]
  );

  async function handleReport() {
    setReportBusy(true);
    try {
      const date = new Date().toISOString().slice(0, 10);
      await downloadFile('/api/reports/management.pdf', `switch-inspector-report-${date}.pdf`);
    } catch (error) {
      alert(error.message);
    } finally {
      setReportBusy(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.top}>
        <div className={styles.topLabel}>Общий статус</div>
        <div className={styles.kpiRow}>
          {totals.map((item) => (
            <div className={styles.kpi} key={item.label}>
              <div className={`${styles.kpiValue} ${item.tone ? styles[item.tone] : ''}`}>
                {item.value}
              </div>
              <div className={styles.kpiLabel}>{item.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>Замечания по категориям</span>
          <div className={styles.tableTools}>
            {canEdit && (
              <>
                <button
                  className={styles.button}
                  onClick={() => fileRef.current?.click()}
                  disabled={importBusy}
                >
                  {importBusy ? 'Загружаю…' : 'Загрузить из Excel'}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) importFile(file);
                    e.target.value = '';
                  }}
                />
              </>
            )}
            {isDeveloper && (
              <button className={styles.button} onClick={handleReport} disabled={reportBusy}>
                {reportBusy ? 'Формирую…' : '📄 Отчёт для руководства (PDF)'}
              </button>
            )}
          </div>
        </div>

        {importState.message && (
          <div className={importState.status === 'error' ? styles.importError : styles.importOk}>
            {importState.message}
          </div>
        )}

        <div className={styles.issueGrid}>
          {issueCounts.map((item) => (
            <button
              key={item.key}
              className={`${styles.issueCard} ${filterKey === item.key ? styles.issueCardActive : ''}`}
              onClick={() => dispatch(setDashFilter(item.key))}
              aria-pressed={filterKey === item.key}
            >
              <div className={styles.icCount} style={{ color: TONE_COLOR[item.color] }}>
                {item.count}
              </div>
              <div className={styles.icName}>{item.label}</div>
              <div className={styles.icBar}>
                <div
                  className={styles.icFill}
                  style={{ width: `${item.percent}%`, background: TONE_COLOR[item.color] }}
                />
              </div>
              <div className={styles.icPct}>{item.percent}%</div>
            </button>
          ))}
        </div>

        <div className={styles.sectionHeader} style={{ marginTop: 20 }}>
          <span className={styles.sectionTitle}>
            Проблемные записи <span className={styles.count}>{problemRows.length}</span>
          </span>
          <div className={styles.tableTools}>
            <span className={styles.hint}>
              Категория выше фильтрует таблицу, повторный клик снимает фильтр
            </span>
            <input
              className={styles.search}
              placeholder="Поиск…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className={styles.tableWrap}>
          {problemRows.length === 0 ? (
            <div className={styles.empty}>Записей с замечаниями не найдено.</div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Объект</th>
                  <th>Коммутатор</th>
                  <th>IP-адрес</th>
                  <th>Шкаф</th>
                  <th>Расположение</th>
                  <th>Замечания</th>
                </tr>
              </thead>
              <tbody>
                {problemRows.map((row) => (
                  <tr
                    key={`${row['Mag']}__${row['Коммутатор']}`}
                    onClick={() => navigate(`/objects/${row['Mag']}/${row['Коммутатор']}`)}
                  >
                    <td>{objectLabel(row['Mag'], prefixMap)}</td>
                    <td>{row['Коммутатор']}</td>
                    <td>{row['IP Коммутатора'] || '—'}</td>
                    <td>{row['Шкаф'] || '—'}</td>
                    <td>{row['Расположение'] || '—'}</td>
                    <td className={styles.issueText}>{row['Замечания']}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
