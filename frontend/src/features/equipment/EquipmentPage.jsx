/**
 * Раздел «Оборудование»: справочная выгрузка из NetBox.
 *
 * Файл разбирается в браузере и на сервер не отправляется — это
 * вспомогательные данные для сверки, а не часть учёта. Поэтому при
 * перезагрузке страницы выгрузку нужно загрузить заново.
 */
import { useMemo, useState, useRef } from 'react';
import * as XLSX from 'xlsx';

import {
  EQUIP_CATEGORIES, CATEGORY_ORDER, parseEquipment, groupByCategory,
} from '../../domain/equipment';
import { sanitizeParsed, checkFileSize } from '../../domain/safeParse';
import NetboxReconcile from './NetboxReconcile';
import styles from './EquipmentPage.module.css';

export default function EquipmentPage() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [category, setCategory] = useState(null);

  const grouped = useMemo(() => (rows ? groupByCategory(rows) : null), [rows]);

  async function handleFile(file) {
    setError(null);

    const sizeError = checkFileSize(file);
    if (sizeError) {
      setError(sizeError);
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const book = XLSX.read(buffer, { type: 'array' });
      const sheet = book.Sheets[book.SheetNames[0]];
      const raw = sanitizeParsed(XLSX.utils.sheet_to_json(sheet, { defval: '' }));

      if (!raw.length) {
        setError('Файл пуст или не содержит данных.');
        return;
      }

      const parsed = parseEquipment(raw);
      if (!parsed.length) {
        setError(
          'В файле не найдено оборудования известных типов. ' +
          'Проверьте, что выгрузка содержит колонку «Роль».'
        );
        return;
      }

      setRows(parsed);
      setCategory(null);
    } catch {
      setError('Не удалось прочитать файл. Ожидается выгрузка NetBox в формате CSV или Excel.');
    }
  }

  if (!rows) {
    return (
      <UploadScreen
        dragging={dragging}
        setDragging={setDragging}
        onFile={handleFile}
        error={error}
      />
    );
  }

  if (category) {
    return (
      <CategoryTable
        categoryKey={category}
        rows={grouped[category]}
        onBack={() => setCategory(null)}
      />
    );
  }

  return (
    <CategoryList
      rows={rows}
      grouped={grouped}
      onSelect={setCategory}
      onReload={() => { setRows(null); setCategory(null); }}
    />
  );
}

/* ── Экран загрузки ─────────────────────────────────────────────────── */

function UploadScreen({ dragging, setDragging, onFile, error }) {
  const inputRef = useRef(null);

  return (
    <div className={styles.uploadWrap}>
      <div>
        <div
          className={`${styles.dropzone} ${dragging ? styles.dropzoneActive : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) onFile(file);
          }}
        >
          <div className={styles.dropIcon}>📥</div>
          <div className={styles.dropTitle}>Загрузите выгрузку из NetBox</div>
          <div className={styles.dropHint}>
            Перетащите файл сюда или нажмите для выбора.<br />
            Данные обрабатываются в браузере и на сервер не отправляются.
          </div>
          <input
            ref={inputRef}
            className={styles.hiddenInput}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFile(file);
            }}
          />
        </div>
        {error && <div className={styles.error}>{error}</div>}
      </div>
    </div>
  );
}

/* ── Список категорий ───────────────────────────────────────────────── */

function CategoryList({ rows, grouped, onSelect, onReload }) {
  const withIssues = rows.filter((r) => r._issues > 0).length;

  return (
    <div className={styles.page}>
      <div className={styles.top}>
        <div className={styles.topLabel}>Оборудование по данным NetBox</div>
        <div className={styles.kpiRow}>
          <div className={styles.kpi}>
            <div className={styles.kpiValue}>{rows.length}</div>
            <div className={styles.kpiLabel}>Всего устройств</div>
          </div>
          <div className={styles.kpi}>
            <div className={`${styles.kpiValue} ${withIssues ? styles.warn : ''}`}>{withIssues}</div>
            <div className={styles.kpiLabel}>С замечаниями</div>
          </div>
          <div className={styles.kpi}>
            <div className={styles.kpiValue}>{rows.length - withIssues}</div>
            <div className={styles.kpiLabel}>Без замечаний</div>
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>Категории оборудования</span>
          <button className={styles.button} onClick={onReload}>Загрузить другой файл</button>
        </div>

        <div className={styles.grid}>
          {CATEGORY_ORDER.filter((key) => grouped[key].length > 0).map((key) => {
            const items = grouped[key];
            const issues = items.filter((r) => r._issues > 0).length;
            return (
              <button className={styles.card} key={key} onClick={() => onSelect(key)}>
                <div className={styles.cardName}>{EQUIP_CATEGORIES[key].label}</div>
                <div className={styles.cardRow}>
                  <span className={styles.cardCount}>{items.length}</span>
                  {issues > 0 ? (
                    <span className={styles.cardIssues}>с замечаниями: {issues}</span>
                  ) : (
                    <span className={styles.cardOk}>всё заполнено</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Сверка идёт только по коммутаторам: остальное оборудование
          в учёте не ведётся, сравнивать его не с чем. */}
      {grouped.switches.length > 0 && (
        <NetboxReconcile netboxRows={grouped.switches} />
      )}
    </div>
  );
}

/* ── Таблица одной категории ────────────────────────────────────────── */

/** Колонки, общие для всех категорий, плюс те, что важны именно ей. */
const BASE_COLUMNS = ['Имя', 'Площадка', 'Роль', 'Статус'];

function CategoryTable({ categoryKey, rows, onBack }) {
  const [search, setSearch] = useState('');
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [sort, setSort] = useState({ column: null, desc: false });

  const category = EQUIP_CATEGORIES[categoryKey];
  const columns = [...BASE_COLUMNS, ...category.columns, 'Замечания'];

  const visible = useMemo(() => {
    let result = issuesOnly ? rows.filter((r) => r._issues > 0) : rows;

    const query = search.trim().toLowerCase();
    if (query) {
      result = result.filter((row) =>
        Object.values(row).some((value) => String(value).toLowerCase().includes(query))
      );
    }

    if (sort.column) {
      result = [...result].sort((a, b) => {
        const diff = String(a[sort.column] || '').localeCompare(
          String(b[sort.column] || ''), 'ru', { numeric: true }
        );
        return sort.desc ? -diff : diff;
      });
    }

    return result;
  }, [rows, issuesOnly, search, sort]);

  function exportToExcel() {
    const sheet = XLSX.utils.json_to_sheet(
      visible.map((row) => Object.fromEntries(columns.map((c) => [c, row[c] ?? ''])))
    );
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Оборудование');
    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(book, `netbox-${categoryKey}-${date}.xlsx`);
  }

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <button className={styles.button} onClick={onBack}>← К категориям</button>
        <span className={styles.sectionTitle}>{category.label}</span>
        <span className={styles.rowCount}>{visible.length} записей</span>

        <div className={styles.spacer} />

        <button
          className={`${styles.button} ${issuesOnly ? styles.buttonActive : ''}`}
          onClick={() => setIssuesOnly((v) => !v)}
        >
          Только с замечаниями
        </button>
        <button className={styles.button} onClick={exportToExcel}>Выгрузить в Excel</button>
        <input
          className={styles.search}
          placeholder="Поиск…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className={styles.section}>
        <div className={styles.tableWrap}>
          {visible.length === 0 ? (
            <div className={styles.empty}>Записей не найдено.</div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th
                      key={column}
                      onClick={() =>
                        setSort((prev) =>
                          prev.column === column
                            ? { column, desc: !prev.desc }
                            : { column, desc: false }
                        )
                      }
                    >
                      {column}
                      {sort.column === column && (sort.desc ? ' ▼' : ' ▲')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((row, index) => (
                  <tr
                    key={`${row['Имя']}__${index}`}
                    className={row._issues > 0 ? styles.rowIssue : ''}
                  >
                    {columns.map((column) => (
                      <td
                        key={column}
                        className={[
                          column === 'Замечания' ? styles.issueText : '',
                          column === 'Серийный номер' || column === 'IP-адрес' ? styles.mono : '',
                        ].filter(Boolean).join(' ')}
                      >
                        {row[column] || <span className={styles.muted}>—</span>}
                      </td>
                    ))}
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
