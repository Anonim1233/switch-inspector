/**
 * Раздел «Дивизионы»: рейтинг по заполненности данных.
 *
 * Дивизионы упорядочены от лучшего к худшему — так сразу видно,
 * где данные в порядке, а где требуется внимание.
 */
import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';

import { selectGrouped } from '../../store/slices/switchesSlice';
import { selectDivisions } from '../../store/slices/divisionsSlice';
import { getAllDivisionStats } from '../../domain/divisions';
import Donut from '../../components/common/Donut';
import styles from './DivisionsPage.module.css';

/* Палитра сегментов. Цвета берутся по кругу, поэтому число дивизионов
   не ограничено размером списка. */
const PALETTE = [
  'var(--blue)', 'var(--ok)', 'var(--warn)', 'var(--purple)',
  'var(--cyan)', 'var(--orange)', 'var(--navy)', 'var(--slate)',
];

export default function DivisionsPage() {
  const grouped = useSelector(selectGrouped);
  const divisionMap = useSelector(selectDivisions);
  const navigate = useNavigate();

  const stats = useMemo(
    () => getAllDivisionStats(divisionMap, grouped),
    [divisionMap, grouped]
  );

  /* Для кольца дивизионы берутся по числу коммутаторов, а не по
     заполненности: диаграмма показывает распределение сети, а не
     качество данных — за него отвечает рейтинг ниже. */
  const segments = useMemo(
    () =>
      [...stats]
        .sort((a, b) => b.total - a.total)
        .map((s, i) => ({
          value: s.total,
          color: PALETTE[i % PALETTE.length],
          name: s.division,
        })),
    [stats]
  );

  const totalSwitches = segments.reduce((sum, s) => sum + s.value, 0);

  if (!stats.length) {
    return <div style={{ padding: 40, color: 'var(--text2)' }}>Дивизионы не настроены.</div>;
  }

  return (
    <div className={styles.page}>
      <div className={styles.top}>
        <div className={styles.topLabel}>Распределение по дивизионам</div>
        <div className={styles.summary}>
          <Donut segments={segments} size={72} label={String(totalSwitches)} />
          <div className={styles.legend}>
            {segments.map((segment) => (
              <div className={styles.legendItem} key={segment.name}>
                <span className={styles.swatch} style={{ background: segment.color }} />
                <span className={styles.legendName}>{segment.name}</span>
                <span className={styles.legendValue}>{segment.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Рейтинг по заполненности</div>
        <div className={styles.grid}>
          {stats.map((item, index) => (
            <DivisionCard
              key={item.division}
              stats={item}
              rank={index + 1}
              isLast={index >= stats.length - 3}
              onClick={() => navigate(`/divisions/${encodeURIComponent(item.division)}`)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function DivisionCard({ stats, rank, isLast, onClick }) {
  const rankClass =
    rank <= 3 ? styles.rankTop : isLast ? styles.rankLow : '';

  return (
    <div className={styles.card} onClick={onClick}>
      <span className={`${styles.rank} ${rankClass}`}>{rank}</span>
      <div className={styles.cardName}>{stats.division}</div>
      <div className={styles.cardRow}>
        <Donut
          segments={[
            { value: stats.total - stats.issues, color: 'var(--ok)' },
            { value: stats.issues, color: 'var(--err)' },
          ]}
          size={54}
          label={`${stats.completion}%`}
        />
        <div className={styles.cardStats}>
          <div>
            Объектов: <span className={styles.cardStatValue}>{stats.mags.length}</span>
          </div>
          <div>
            Коммутаторов: <span className={styles.cardStatValue}>{stats.total}</span>
          </div>
          <div>
            С замечаниями: <span className={styles.cardStatValue}>{stats.issues}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
