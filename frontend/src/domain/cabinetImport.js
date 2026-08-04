/**
 * Разбор файла с наполнением шкафов.
 *
 * Формат сложился исторически: на одном листе может быть несколько
 * шкафов, расположенных рядом по горизонтали. Каждый начинается
 * ячейкой «Наименование: <имя>», под ней — характеристика и
 * местоположение, ниже — таблица юнитов.
 */

/**
 * Заголовок колонки юнитов.
 *
 * В реальных файлах встречаются оба написания: «Юнит» и «U -высота».
 * Распознаются оба, иначе часть выгрузок не читалась бы.
 */
export function isUnitHeaderCell(cell) {
  if (typeof cell !== 'string') return false;
  const value = cell.trim().toLowerCase();
  return value === 'юнит' || /^u\s*-?\s*высота/.test(value);
}

/**
 * Разбирает книгу с наполнением шкафов.
 *
 * @param {Object} workbook — книга, прочитанная библиотекой xlsx
 * @param {Function} sheetToRows — преобразование листа в массив строк
 * @returns {Array} найденные шкафы с содержимым
 */
export function parseCabinetsWorkbook(workbook, sheetToRows) {
  const cabinets = [];

  for (const sheetName of workbook.SheetNames) {
    /* Листы-образцы — это шаблон для заполнения, а не данные. */
    if (sheetName.toLowerCase().includes('образец')) continue;

    const rows = sheetToRows(workbook.Sheets[sheetName]);

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r] || [];

      for (let c = 0; c < row.length; c++) {
        const cell = row[c];
        if (typeof cell !== 'string') continue;

        const match = cell.match(/^Наименование:\s*(.*)$/);
        if (!match) continue;

        const name = match[1].trim();
        if (!name) continue;

        /* Правая граница блока — позиция СЛЕДУЮЩЕГО «Наименование:»
           в той же строке, а не фиксированное число колонок. При плотно
           расположенных шкафах фиксированное окно захватывало бы
           характеристику соседнего шкафа вместо своей. */
        let rightBound = c + 6;
        for (let cc = c + 1; cc < row.length; cc++) {
          if (typeof row[cc] === 'string' && /^Наименование:\s*.+/.test(row[cc])) {
            rightBound = cc;
            break;
          }
        }

        const { characteristic, location } = readHeader(rows[r + 1] || [], c, rightBound);
        const header = findUnitHeader(rows, r, c, rightBound);
        if (!header) continue;

        cabinets.push({
          name,
          characteristic,
          location,
          items: readItems(rows, header.row, header.column),
        });
      }
    }
  }

  return cabinets;
}

/** Характеристика и местоположение — в строке под наименованием.
 *  Могут лежать в одной ячейке через перенос строки. */
function readHeader(row, from, to) {
  let characteristic = '';
  let location = '';

  for (let cc = from; cc < to && cc < row.length; cc++) {
    const value = row[cc];
    if (typeof value !== 'string') continue;

    for (const line of value.split('\n')) {
      const ch = line.match(/Характеристика:\s*(.*)/);
      if (ch && ch[1].trim()) characteristic = ch[1].trim();

      const loc = line.match(/Местоположение:\s*(.*)/);
      if (loc && loc[1].trim()) location = loc[1].trim();
    }
  }

  return { characteristic, location };
}

/** Заголовок таблицы юнитов ищется в трёх строках под наименованием:
 *  разметка блоков в разных файлах немного отличается. */
function findUnitHeader(rows, startRow, from, to) {
  for (let hr = startRow + 1; hr <= startRow + 3 && hr < rows.length; hr++) {
    const row = rows[hr] || [];
    for (let cc = from; cc < to && cc < row.length; cc++) {
      if (isUnitHeaderCell(row[cc])) return { row: hr, column: cc };
    }
  }
  return null;
}

/** Позиции читаются до первой пустой ячейки в колонке юнита:
 *  ниже начинается либо следующий блок, либо конец таблицы. */
function readItems(rows, headerRow, unitColumn) {
  const items = [];

  for (let ir = headerRow + 1; ir < rows.length; ir++) {
    const row = rows[ir] || [];
    const unitCell = row[unitColumn];

    if (unitCell == null || unitCell === '') break;

    const match = String(unitCell).match(/(\d+)/);
    if (!match) break;

    items.push({
      unit: Number(match[1]),
      name: row[unitColumn + 1] != null ? String(row[unitColumn + 1]).trim() : '',
      comment: row[unitColumn + 2] != null ? String(row[unitColumn + 2]).trim() : '',
    });
  }

  return items;
}
