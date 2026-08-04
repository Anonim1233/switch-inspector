/**
 * Сверка выгрузки NetBox с учётом коммутаторов.
 *
 * Показывает, где серийные номера расходятся и какие устройства есть
 * только в одной из систем. Работает на уже загруженных данных —
 * обращений к NetBox не требует.
 */
import { useMemo, useState } from 'react';
import { useSelector, useDispatch, useStore } from 'react-redux';

import { selectSwitches, selectPrefixMap, loadSwitches } from '../../store/slices/switchesSlice';
import { selectCanEdit, selectCanEditObject } from '../../store/slices/authSlice';
import { reconcileWithNetbox } from '../../domain/switchImport';
import { objectLabel } from '../../domain/issues';
import { api } from '../../api/client';
import styles from './EquipmentPage.module.css';

export default function NetboxReconcile({ netboxRows }) {
  const dispatch = useDispatch();
  /* Хранилище берётся напрямую, а не подпиской: права нужны один раз
     в обработчике, а подписка на всё состояние вызывала бы перерисовку
     при любом изменении где угодно. */
  const store = useStore();
  const switches = useSelector(selectSwitches);
  const prefixMap = useSelector(selectPrefixMap);
  const canEdit = useSelector(selectCanEdit);

  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState(null);

  const result = useMemo(
    () => reconcileWithNetbox(netboxRows, switches),
    [netboxRows, switches]
  );

  const transferable = result.missingHere.length + result.serialDiffers.length;

  /**
   * Переносит серийные номера из выгрузки в учёт.
   *
   * Расхождения требуют отдельного подтверждения: у нас уже есть
   * значение, и его перезапись — осознанное действие, а не побочный
   * эффект заполнения пустых полей.
   */
  async function applySerials() {
    const parts = [
      'Перенести серийные номера из NetBox?',
      '',
      `Заполнить пустые: ${result.missingHere.length}`,
    ];
    if (result.serialDiffers.length) {
      parts.push(`ПЕРЕЗАПИСАТЬ имеющиеся: ${result.serialDiffers.length} — прежние значения будут потеряны`);
    }
    if (!window.confirm(parts.join('\n'))) return;

    const candidates = [
      ...result.missingHere.map((x) => ({ row: x.ours, serial: x.serial })),
      ...result.serialDiffers.map((x) => ({ row: x.ours, serial: x.netboxSerial })),
    ].filter((item) => selectCanEditObject(store.getState(), item.row['Mag']));

    if (!candidates.length) {
      setMessage({ type: 'err', text: 'Нет записей, доступных для изменения в вашей зоне ответственности.' });
      return;
    }

    setApplying(true);
    try {
      const rows = candidates.map(({ row, serial }) => ({
        mag: row['Mag'],
        sw: row['Коммутатор'],
        shkaf: row['Шкаф'] ?? '',
        ip: row['IP Коммутатора'] ?? '',
        up: row['UP'] ?? '',
        down: row['DOWN'] ?? '',
        location: row['Расположение'] ?? '',
        sn_netbox: serial,
        sn_lyra: row['SN Lyra'] ?? '',
        model: row['Модель SW'] ?? '',
        comment: row['Комментарий'] ?? '',
        comment_lyra: row['_Комментарий_Лира'] ?? '',
      }));

      const response = await api.post('/api/switches/bulk', { rows });
      await dispatch(loadSwitches());
      setMessage({ type: 'ok', text: `Обновлено записей: ${response.imported}.` });
    } catch (error) {
      setMessage({ type: 'err', text: error.message });
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>Сверка с учётом коммутаторов</span>
        {canEdit && transferable > 0 && (
          <button className={styles.button} onClick={applySerials} disabled={applying}>
            {applying ? 'Переношу…' : `Перенести серийные номера (${transferable})`}
          </button>
        )}
      </div>

      <div className={styles.kpiRow} style={{ marginBottom: 16 }}>
        <Kpi value={result.matched.length} label="Серийники совпадают" />
        <Kpi value={result.missingHere.length} label="Можно заполнить" warn />
        <Kpi value={result.serialDiffers.length} label="Расхождение" warn />
        <Kpi value={result.onlyInNetbox.length} label="Только в NetBox" warn />
        <Kpi value={result.onlyOurs.length} label="Только у нас" warn />
      </div>

      {message && (
        <div className={message.type === 'ok' ? styles.messageOk : styles.error}>
          {message.text}
        </div>
      )}

      <ResultTable
        title="Расхождение серийных номеров"
        rows={result.serialDiffers}
        columns={['Коммутатор', 'Объект', 'У нас', 'В NetBox']}
        render={(x) => [
          x.ours['Коммутатор'],
          objectLabel(x.ours['Mag'], prefixMap),
          x.ourSerial,
          x.netboxSerial,
        ]}
      />

      <ResultTable
        title="У нас не заполнено, в NetBox есть"
        rows={result.missingHere}
        columns={['Коммутатор', 'Объект', 'Серийный номер из NetBox']}
        render={(x) => [x.ours['Коммутатор'], objectLabel(x.ours['Mag'], prefixMap), x.serial]}
      />

      <ResultTable
        title="Есть в NetBox, нет у нас"
        rows={result.onlyInNetbox}
        columns={['Имя', 'Площадка', 'Серийный номер', 'Статус']}
        render={(x) => [x['Имя'], x['Площадка'], x['Серийный номер'], x['Статус']]}
      />

      <ResultTable
        title="Есть у нас, нет в NetBox"
        rows={result.onlyOurs}
        columns={['Коммутатор', 'Объект', 'IP-адрес']}
        render={(x) => [x['Коммутатор'], objectLabel(x['Mag'], prefixMap), x['IP Коммутатора']]}
      />
    </div>
  );
}

function Kpi({ value, label, warn }) {
  return (
    <div className={styles.kpi}>
      <div className={`${styles.kpiValue} ${warn && value > 0 ? styles.warn : ''}`}>{value}</div>
      <div className={styles.kpiLabel}>{label}</div>
    </div>
  );
}

/** Показывается не более двухсот строк: при большем числе таблица
 *  перестаёт быть обозримой, а разбирать расхождения удобнее пачками. */
const MAX_ROWS = 200;

function ResultTable({ title, rows, columns, render }) {
  if (!rows.length) return null;

  return (
    <>
      <div className={styles.sectionHeader} style={{ marginTop: 18 }}>
        <span className={styles.sectionTitle}>{title}</span>
        <span className={styles.rowCount}>{rows.length}</span>
      </div>

      <div className={styles.tableWrap} style={{ maxHeight: 280 }}>
        <table className={styles.table}>
          <thead>
            <tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {rows.slice(0, MAX_ROWS).map((row, index) => (
              <tr key={index}>
                {render(row).map((value, i) => (
                  <td key={i} className={i === 0 ? styles.mono : ''}>
                    {value || <span className={styles.muted}>—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length > MAX_ROWS && (
        <div className={styles.empty}>Показаны первые {MAX_ROWS} из {rows.length}</div>
      )}
    </>
  );
}
