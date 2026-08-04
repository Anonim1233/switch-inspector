/**
 * Сводка по шкафу: занятость, разбивка по типам, свободное место.
 */
import { getRackSummary, TYPE_LABELS } from '../../domain/racks';
import Donut from '../../components/common/Donut';
import styles from './RackSummary.module.css';

export default function RackSummary({ height, items }) {
  const summary = getRackSummary(height, items);

  const segments = [
    { value: summary.occupied, color: 'var(--blue)', label: 'Занято' },
    { value: summary.reserve, color: 'var(--warn)', label: 'Резерв' },
    { value: summary.free, color: 'var(--border)', label: 'Свободно' },
  ].filter((s) => s.value > 0);

  const typeRows = Object.entries(TYPE_LABELS)
    .filter(([type]) => summary.byType[type])
    .map(([type, label]) => ({ label, count: summary.byType[type] }));

  return (
    <div className={styles.panel}>
      <div className={styles.donutRow}>
        <Donut
          segments={segments}
          size={72}
          label={`${summary.occupied + summary.reserve}/${height}U`}
        />
      </div>

      <div className={styles.list}>
        {segments.map((segment) => (
          <div className={styles.row} key={segment.label}>
            <span className={styles.swatch} style={{ background: segment.color }} />
            <span className={styles.rowName}>{segment.label}</span>
            <span className={styles.rowValue}>{segment.value}U</span>
          </div>
        ))}

        {/* Свободное место подряд — отдельно от общего числа свободных:
            отвечает на вопрос «влезет ли устройство на N юнитов». */}
        <div className={`${styles.row} ${styles.divider}`}>
          <span className={styles.rowName}>Свободно подряд</span>
          <span className={styles.rowValue}>{summary.freeRun}U</span>
        </div>

        {typeRows.length > 0 && (
          <>
            <div className={styles.divider} />
            {typeRows.map((item) => (
              <div className={styles.row} key={item.label}>
                <span className={styles.rowName}>{item.label}</span>
                <span className={styles.rowValue}>{item.count}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
