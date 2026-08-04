/**
 * Поиск совпадающих серийных номеров.
 *
 * Проверяются два поля: SN Netbox и SN Lyra. Значения со словом
 * «не найден» пропускаются — это не серийный номер, а пометка
 * об отсутствии записи, и совпадение таких пометок дублем не является.
 */

export const DUPLICATE_FIELDS = ['SN Netbox', 'SN Lyra'];

/**
 * Группирует записи по совпадающим серийным номерам.
 *
 * @param {Array} rows — список коммутаторов
 * @returns {Object} по каждому полю — пары «значение и записи с ним»,
 *                   от самых частых к редким
 */
export function findDuplicates(rows) {
  const result = {};

  for (const field of DUPLICATE_FIELDS) {
    const byValue = new Map();

    for (const row of rows) {
      const value = (row[field] || '').trim();
      if (!value) continue;
      if (value.toLowerCase().includes('не найден')) continue;

      if (!byValue.has(value)) byValue.set(value, []);
      byValue.get(value).push(row);
    }

    result[field] = [...byValue.entries()]
      .filter(([, group]) => group.length > 1)
      .sort((a, b) => b[1].length - a[1].length);
  }

  return result;
}

/** Общее число найденных совпадений по всем полям. */
export function countDuplicates(duplicates) {
  return DUPLICATE_FIELDS.reduce((sum, field) => sum + (duplicates[field]?.length ?? 0), 0);
}
