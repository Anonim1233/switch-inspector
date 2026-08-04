/**
 * Кольцевой индикатор.
 *
 * Рисуется через SVG: каждый сегмент — дуга окружности, длина которой
 * задаётся штриховкой, а начало — поворотом. Способ перенесён из
 * прежней версии без изменений, поэтому вид совпадает.
 */

/** Длина окружности при радиусе 22 — используется как база для дуг. */
const CIRCUMFERENCE = 2 * Math.PI * 22;

export default function Donut({ segments, size = 56, label }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  let offset = 0;
  const arcs = segments
    .filter((s) => s.value > 0)
    .map((segment, index) => {
      const share = total ? segment.value / total : 0;
      const length = (share * CIRCUMFERENCE).toFixed(1);
      /* Отсчёт от верхней точки: без поворота дуги начинались бы справа. */
      const rotation = (-90 + offset * 360).toFixed(1);
      offset += share;

      return (
        <circle
          key={index}
          cx="28"
          cy="28"
          r="22"
          fill="none"
          stroke={segment.color}
          strokeWidth="6"
          strokeDasharray={`${length} ${CIRCUMFERENCE}`}
          transform={`rotate(${rotation} 28 28)`}
        />
      );
    });

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 56 56" role="img" aria-label={label}>
        <circle cx="28" cy="28" r="22" fill="none" stroke="var(--border)" strokeWidth="6" />
        {arcs}
      </svg>
      {label && (
        <span
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: size < 60 ? 10 : 12,
            fontWeight: 700,
            color: 'var(--text)',
          }}
        >
          {label}
        </span>
      )}
    </div>
  );
}
