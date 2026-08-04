/**
 * Показатели по дивизионам.
 *
 * Дивизион объединяет несколько объектов, поэтому его показатели —
 * это сумма по всем входящим объектам.
 */

/**
 * Проверяет, что серийный номер Lyra отсутствует.
 *
 * Пометка «не найден» считается отсутствием: это не номер, а признак
 * того, что запись в системе Лира не найдена.
 */
export function hasNoLyra(row) {
  const value = (row['SN Lyra'] || '').trim();
  return !value || value.toLowerCase().includes('не найден');
}

/** Процент с округлением до десятых. */
export function percent(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

/**
 * Показатели одного дивизиона.
 *
 * @param {string} division — название дивизиона
 * @param {string[]} mags — входящие объекты
 * @param {Object} grouped — коммутаторы, сгруппированные по объектам
 */
export function getDivisionStats(division, mags, grouped) {
  const rows = mags.flatMap((mag) => grouped[mag] ?? []);
  const total = rows.length;
  const withIssues = rows.filter((r) => r._issues > 0).length;
  const noLyra = rows.filter(hasNoLyra).length;

  return {
    division,
    mags,
    total,
    noLyra,
    issues: withIssues,
    completion: percent(total - withIssues, total),
  };
}

/**
 * Показатели по всем дивизионам, от лучшего к худшему.
 * Порядок используется для рейтинга на странице раздела.
 */
export function getAllDivisionStats(divisionMap, grouped) {
  return Object.entries(divisionMap)
    .map(([division, mags]) => getDivisionStats(division, mags, grouped))
    .sort((a, b) => b.completion - a.completion);
}
