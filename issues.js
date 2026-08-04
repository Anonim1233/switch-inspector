/**
 * Определение замечаний по коммутатору.
 *
 * ВАЖНО: та же логика продублирована на сервере (константа
 * ISSUE_COUNT_SQL в server.js) — она нужна там для PDF-отчёта.
 * При изменении правил здесь их необходимо поправить и там,
 * иначе цифры в отчёте разойдутся с интерфейсом.
 */

/**
 * Категории замечаний. Единый источник для карточек на дашборде,
 * фильтрации таблицы и подсчёта показателей: добавление новой категории
 * требует правки только этого массива.
 */
export const ISSUE_DEFS = [
  { key: 'no_ip',     label: 'Без IP-адреса',    color: 'warn',   test: (r) => !r['IP Коммутатора'] },
  { key: 'no_loc',    label: 'Без расположения', color: 'warn',   test: (r) => !r['Расположение'] },
  { key: 'no_cab',    label: 'Без шкафа',        color: 'warn',   test: (r) => !r['Шкаф'] },
  { key: 'no_lyra',   label: 'Без SN Lyra',      color: 'warn',   test: (r) => !r['SN Lyra'] },
  { key: 'bad_lyra',  label: 'Не найден в Лира', color: 'err',    test: (r) => {
      const v = r['SN Lyra'];
      return Boolean(v) && v.toLowerCase().includes('не найден');
    } },
  { key: 'no_netbox', label: 'Без SN Netbox',    color: 'warn',   test: (r) => !r['SN Netbox'] },
  { key: 'no_model',  label: 'Без модели SW',    color: 'warn',   test: (r) => !r['Модель SW'] },
];

/**
 * Считает замечания по одной записи.
 *
 * Порядок проверок повторяет прежнюю версию. Обратите внимание на
 * SN Lyra: две категории взаимоисключающие — пустое значение даёт
 * «не указан», значение со словом «не найден» даёт «не найден в Лира».
 * Одна запись не может попасть в обе.
 *
 * @param {object} row — запись коммутатора с русскими ключами
 * @returns {{issues: string[], count: number, text: string}}
 */
export function computeIssues(row) {
  const issues = [];

  const ip    = row['IP Коммутатора'] || '';
  const loc   = row['Расположение']   || '';
  const cab   = row['Шкаф']           || '';
  const lyra  = row['SN Lyra']        || '';
  const nb    = row['SN Netbox']      || '';
  const model = row['Модель SW']      || '';

  if (!ip)   issues.push('Не указан IP-адрес');
  if (!loc)  issues.push('Не указано местоположение');
  if (!cab)  issues.push('Не указан шкаф');

  if (!lyra) issues.push('Не указан SN Lyra');
  else if (lyra.toLowerCase().includes('не найден')) issues.push('Не найден в Лира');

  if (!nb)    issues.push('Не указан SN Netbox');
  if (!model) issues.push('Не указана модель SW');

  return { issues, count: issues.length, text: issues.join('; ') };
}

/**
 * Дополняет запись полями замечаний.
 *
 * В отличие от прежней версии не изменяет исходный объект, а возвращает
 * новый: Redux требует, чтобы данные в хранилище не правились на месте.
 */
export function withIssues(row) {
  const { count, text } = computeIssues(row);
  return { ...row, _issues: count, 'Замечания': text };
}

/**
 * Префикс объекта определяется по его же коммутаторам: если больше
 * половины имён начинается с DS, объект считается распределительным
 * центром, иначе магазином.
 */
export function detectPrefix(rows) {
  const ds = rows.filter((r) => (r['Коммутатор'] || '').startsWith('DS')).length;
  return ds > rows.length / 2 ? 'DS' : 'MAG';
}

/** Полное отображаемое имя объекта: «MAG 134», «DS 253». */
export function objectLabel(mag, prefixMap) {
  return `${prefixMap[mag] || 'MAG'} ${mag}`;
}
