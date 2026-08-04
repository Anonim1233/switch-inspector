/**
 * Визуальная схема стойки.
 *
 * Юниты идут сверху вниз, как в физическом шкафу. Оборудование
 * высотой в несколько юнитов показывается одним блоком.
 */
import { buildRackLayout, TYPE_LABELS } from '../../domain/racks';
import styles from './RackDiagram.module.css';

/** Высота одного юнита — от неё считается высота объединённых блоков. */
const UNIT_HEIGHT = 34;

export default function RackDiagram({ height, items, onSelectUnit, onOpenSwitch }) {
  const blocks = buildRackLayout(height, items);

  return (
    <div className={styles.rack}>
      {blocks.map((block) => {
        const { unit, span, item, type } = block;
        const mismatch = item?.shkafMismatch;

        const className = [
          styles.slot,
          styles[type] ?? styles.other,
          mismatch ? styles.mismatch : '',
        ].filter(Boolean).join(' ');

        /* Подпись для программ чтения с экрана: цвет и положение
           им недоступны, поэтому состояние проговаривается словами. */
        const label = item
          ? `Юнит ${unit}${span > 1 ? `–${unit - span + 1}` : ''}: ${item.name}` +
            (mismatch ? `. Расхождение: числится в шкафу ${item.actualShkaf}` : '')
          : `Юнит ${unit}: свободно`;

        return (
          <div
            key={unit}
            className={className}
            style={{ minHeight: span * UNIT_HEIGHT }}
            onClick={() => onSelectUnit(unit)}
            role="button"
            tabIndex={0}
            aria-label={label}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectUnit(unit);
              }
            }}
          >
            <span className={styles.unitNumber}>
              {span > 1 ? `${unit}–${unit - span + 1}` : unit}
            </span>

            <span>
              <span className={styles.name}>
                {item ? item.name : 'свободно'}
              </span>
              {item?.comment && <div className={styles.comment}>{item.comment}</div>}
            </span>

            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {mismatch && (
                <span className={styles.badge} title={`По учёту: ${item.actualShkaf}`}>
                  не тот шкаф
                </span>
              )}
              {item?.switchExists && (
                <button
                  className={styles.infoBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenSwitch(item.matchedSw);
                  }}
                  title="Открыть карточку коммутатора"
                  aria-label={`Открыть карточку ${item.matchedSw}`}
                >
                  ℹ
                </button>
              )}
              {item && type !== 'reserve' && (
                <span className={styles.badge}>{TYPE_LABELS[type] ?? ''}</span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
