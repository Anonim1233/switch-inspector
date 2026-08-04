/**
 * Логика схемы шкафа: типы оборудования, высота стойки,
 * свободное место, объединение многоюнитовых блоков.
 */

/**
 * Тип оборудования определяется по ключевым словам в наименовании.
 * Порядок проверок важен: «резерв» проверяется первым, поскольку
 * пустая позиция тоже считается резервом.
 */
export function rackItemType(name) {
  const value = (name || '').toLowerCase();
  if (!value || value.includes('резерв')) return 'reserve';
  if (value.includes('коммутатор')) return 'switch';
  if (value.includes('патч')) return 'patch';
  if (value.includes('органайзер')) return 'organizer';
  if (value.includes('оптическ')) return 'optic';
  return 'other';
}

/** Подписи типов — для сводки по шкафу. */
export const TYPE_LABELS = {
  switch: 'Коммутаторы',
  patch: 'Патч-панели',
  organizer: 'Органайзеры',
  optic: 'Оптика',
  other: 'Прочее',
};

/**
 * Высота стойки.
 *
 * Берётся из поля «Характеристика», где обычно указано «22U».
 * Если там ничего нет — по самому верхнему занятому юниту, но не
 * меньше двенадцати: слишком низкая схема выглядела бы обрезанной.
 */
export function getRackHeight(characteristic, items) {
  const match = (characteristic || '').match(/(\d+)\s*u/i);
  if (match) return parseInt(match[1], 10);

  const maxUnit = items.reduce((max, item) => Math.max(max, Number(item.unit) || 0), 0);
  return Math.max(maxUnit, 12);
}

/**
 * Наибольшее число подряд идущих свободных юнитов.
 *
 * Отвечает на вопрос «влезет ли устройство на N юнитов» — в отличие
 * от общего числа свободных, которые могут быть разбросаны по стойке.
 */
export function longestFreeRun(height, items) {
  const occupied = new Set(items.map((item) => Number(item.unit)));

  let longest = 0;
  let current = 0;

  for (let unit = height; unit >= 1; unit--) {
    if (occupied.has(unit)) current = 0;
    else {
      current++;
      if (current > longest) longest = current;
    }
  }

  return longest;
}

/**
 * Раскладка стойки сверху вниз.
 *
 * Подряд идущие позиции с одинаковым наименованием и комментарием
 * объединяются в один блок: устройство высотой в несколько юнитов
 * должно выглядеть одним блоком, а не повторяющимися строками.
 *
 * @returns {Array} блоки с полями unit (верхний юнит), span (высота),
 *                  item (данные позиции) и type
 */
export function buildRackLayout(height, items) {
  const byUnit = new Map();
  for (const item of items) byUnit.set(Number(item.unit), item);

  const blocks = [];
  let unit = height;

  while (unit >= 1) {
    const item = byUnit.get(unit);

    if (!item) {
      blocks.push({ unit, span: 1, item: null, type: 'empty' });
      unit--;
      continue;
    }

    /* Считаем, сколько юнитов подряд занимает то же оборудование. */
    let span = 1;
    while (unit - span >= 1) {
      const below = byUnit.get(unit - span);
      if (!below) break;
      if (below.name !== item.name) break;
      if ((below.comment || '') !== (item.comment || '')) break;
      span++;
    }

    blocks.push({ unit, span, item, type: rackItemType(item.name) });
    unit -= span;
  }

  return blocks;
}

/** Сводка по шкафу: занято, резерв, свободно, разбивка по типам. */
export function getRackSummary(height, items) {
  const occupied = items.filter((item) => rackItemType(item.name) !== 'reserve');
  const reserve = items.filter((item) => rackItemType(item.name) === 'reserve');
  const free = Math.max(0, height - items.length);

  const byType = {};
  for (const item of occupied) {
    const type = rackItemType(item.name);
    byType[type] = (byType[type] || 0) + 1;
  }

  return {
    height,
    occupied: occupied.length,
    reserve: reserve.length,
    free,
    freeRun: longestFreeRun(height, items),
    byType,
  };
}

/**
 * Приводит короткое обозначение коммутатора к полному виду.
 *
 * В шаблонах загрузки коммутаторы пишут коротко — «SW_74», тогда как
 * в учёте они хранятся с префиксом объекта: «MAG134_74» или «DS253_74».
 */
export function normalizeSwitchName(name, mag, prefixMap) {
  if (!name) return name;
  const prefix = prefixMap[mag] || 'MAG';
  return name.replace(/\bSW[_-](\d+)\b/gi, `${prefix}${mag}_$1`);
}

/** Первый свободный юнит сверху — куда по умолчанию добавлять оборудование. */
export function firstFreeUnit(height, items) {
  const occupied = new Set(items.map((item) => Number(item.unit)));
  for (let unit = height; unit >= 1; unit--) {
    if (!occupied.has(unit)) return unit;
  }
  return null;
}
