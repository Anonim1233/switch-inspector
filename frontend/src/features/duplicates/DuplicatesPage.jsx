/**
 * Раздел «Дубли SN»: совпадающие серийные номера по всей сети.
 *
 * Совпадение серийного номера означает ошибку в данных: либо номер
 * записан не тому коммутатору, либо одно устройство заведено дважды.
 */
import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';

import { selectSwitches, selectPrefixMap } from '../../store/slices/switchesSlice';
import { findDuplicates, countDuplicates, DUPLICATE_FIELDS } from '../../domain/duplicates';
import { objectLabel } from '../../domain/issues';
import styles from './DuplicatesPage.module.css';

export default function DuplicatesPage() {
  const rows = useSelector(selectSwitches);
  const prefixMap = useSelector(selectPrefixMap);
  const navigate = useNavigate();

  /* Пересчёт только при изменении списка: перебор полутора тысяч
     записей при каждой отрисовке был бы заметен на слабых машинах. */
  const duplicates = useMemo(() => findDuplicates(rows), [rows]);
  const total = countDuplicates(duplicates);

  return (
    <div className={styles.page}>
      <div className={styles.kpiStrip}>
        {DUPLICATE_FIELDS.map((field) => (
          <div className={styles.kpi} key={field}>
            <div className={`${styles.kpiValue} ${duplicates[field].length ? styles.err : styles.ok}`}>
              {duplicates[field].length}
            </div>
            <div className={styles.kpiLabel}>Дублей {field}</div>
          </div>
        ))}
        <div className={styles.kpi}>
          <div className={`${styles.kpiValue} ${total ? styles.err : styles.ok}`}>
            {total === 0 ? '✓' : total}
          </div>
          <div className={styles.kpiLabel}>Итого дублей</div>
        </div>
      </div>

      {total === 0 ? (
        <div className={styles.section}>
          <div className={styles.emptyOk}>
            Совпадающих серийных номеров не найдено — данные в порядке.
          </div>
        </div>
      ) : (
        DUPLICATE_FIELDS.map((field) => (
          <DuplicateSection
            key={field}
            field={field}
            groups={duplicates[field]}
            prefixMap={prefixMap}
            onOpen={(row) => navigate(`/objects/${row['Mag']}/${row['Коммутатор']}`)}
          />
        ))
      )}
    </div>
  );
}

function DuplicateSection({ field, groups, prefixMap, onOpen }) {
  if (!groups.length) return null;

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>Совпадения по полю {field}</span>
        <span className={styles.count}>{groups.length}</span>
      </div>

      {groups.map(([serial, items]) => (
        <div className={styles.group} key={serial}>
          <div className={styles.groupHeader}>
            <span className={styles.serial}>{serial}</span>
            <span className={styles.groupCount}>записей: {items.length}</span>
          </div>

          <table className={styles.table}>
            <thead>
              <tr>
                <th>Объект</th>
                <th>Коммутатор</th>
                <th>IP-адрес</th>
                <th>Расположение</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr
                  key={`${row['Mag']}__${row['Коммутатор']}`}
                  onClick={() => onOpen(row)}
                >
                  <td>{objectLabel(row['Mag'], prefixMap)}</td>
                  <td>{row['Коммутатор']}</td>
                  <td>{row['IP Коммутатора'] || '—'}</td>
                  <td>{row['Расположение'] || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
