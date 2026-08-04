/**
 * Показатели дашборда.
 *
 * Вынесены отдельно от отрисовки: так их можно проверить тестами
 * и переиспользовать, не завязываясь на разметку.
 */
import { ISSUE_DEFS } from './issues';
import { percent } from './divisions';

/**
 * Верхние показатели: всего, объектов, с замечаниями и без,
 * проблемные объекты, заполненность.
 *
 * Объект считается проблемным, если хотя бы один его коммутатор
 * имеет замечания.
 */
export function getDashboardTotals(rows, grouped) {
  const total = rows.length;
  const withIssues = rows.filter((r) => r._issues > 0).length;
  const clean = total - withIssues;
  const objects = Object.keys(grouped).length;
  const objectsWithIssues = Object.values(grouped)
    .filter((group) => group.some((r) => r._issues > 0)).length;
  const completion = percent(clean, total);

  return [
    { value: total, label: 'Всего коммутаторов' },
    { value: objects, label: 'Объектов' },
    { value: withIssues, label: 'С замечаниями', tone: withIssues ? 'warn' : null },
    { value: clean, label: 'Без замечаний' },
    { value: objectsWithIssues, label: 'Объектов с проблемами', tone: objectsWithIssues ? 'warn' : null },
    {
      value: `${completion}%`,
      label: 'Заполненность',
      /* Пороги перенесены из прежней версии: ниже 80 процентов —
         тревога, ниже 95 — предупреждение. */
      tone: completion < 80 ? 'err' : completion < 95 ? 'warn' : null,
    },
  ];
}

/** Счётчики по каждой категории замечаний — для карточек-фильтров. */
export function getIssueCounts(rows) {
  const total = rows.length;
  return ISSUE_DEFS.map((def) => {
    const count = rows.filter(def.test).length;
    return {
      key: def.key,
      label: def.label,
      color: def.color,
      count,
      percent: percent(count, total),
    };
  });
}

/**
 * Записи для таблицы проблемных: с учётом выбранной категории
 * и строки поиска.
 */
export function filterProblemRows(rows, filterKey, search) {
  let result = filterKey === 'all'
    ? rows.filter((r) => r._issues > 0)
    : rows.filter(ISSUE_DEFS.find((d) => d.key === filterKey)?.test ?? (() => false));

  const query = search.trim().toLowerCase();
  if (query) {
    result = result.filter((row) =>
      ['Коммутатор', 'IP Коммутатора', 'Расположение', 'Шкаф', 'Модель SW']
        .some((field) => (row[field] || '').toLowerCase().includes(query))
    );
  }

  return result;
}

/** Объекты с наибольшим числом замечаний — для графика. */
export function getTopProblemObjects(grouped, limit = 15) {
  return Object.entries(grouped)
    .map(([mag, group]) => ({
      mag,
      issues: group.reduce((sum, r) => sum + r._issues, 0),
      total: group.length,
    }))
    .filter((item) => item.issues > 0)
    .sort((a, b) => b.issues - a.issues)
    .slice(0, limit);
}
