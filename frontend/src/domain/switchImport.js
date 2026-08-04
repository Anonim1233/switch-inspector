/**
 * Разбор выгрузки с коммутаторами.
 *
 * Файл читается в браузере, на сервер уходит уже разобранная
 * структура — так же, как в прежней версии.
 */

/** Соответствие колонок файла и полей, которые принимает сервер. */
const FIELD_MAP = {
  'Mag': 'mag',
  'Коммутатор': 'sw',
  'Шкаф': 'shkaf',
  'IP Коммутатора': 'ip',
  'UP': 'up',
  'DOWN': 'down',
  'Расположение': 'location',
  'SN Netbox': 'sn_netbox',
  'SN Lyra': 'sn_lyra',
  'Модель SW': 'model',
  'Комментарий': 'comment',
  '_Комментарий_Лира': 'comment_lyra',
};

/**
 * Приводит строки выгрузки к виду, который принимает сервер.
 *
 * Записи без объекта или имени коммутатора отбрасываются: по ним
 * невозможно определить, что именно обновлять.
 */
export function prepareSwitchRows(rows) {
  const prepared = [];
  let skipped = 0;

  for (const row of rows) {
    const mag = String(row['Mag'] ?? '').trim();
    const sw = String(row['Коммутатор'] ?? '').trim();

    if (!mag || !sw) {
      skipped++;
      continue;
    }

    const item = {};
    for (const [column, field] of Object.entries(FIELD_MAP)) {
      const value = row[column];
      item[field] = value != null ? String(value).trim() : '';
    }

    prepared.push(item);
  }

  return { rows: prepared, skipped };
}

/**
 * Сверка выгрузки NetBox с учётом коммутаторов.
 *
 * Имена в двух системах могут отличаться разделителем перед номером:
 * в данных встречаются оба варианта — «DS253_66» и «DS253-67».
 * Поэтому перед сравнением обе стороны приводятся к единому виду.
 */
export function normalizeForCompare(value) {
  return String(value || '').trim().toLowerCase().replace(/[-\u2010-\u2015]/g, '_');
}

export function reconcileWithNetbox(netboxRows, switches) {
  const byName = new Map();
  for (const row of switches) {
    byName.set(normalizeForCompare(row['Коммутатор']), row);
  }

  const matched = [];
  const serialDiffers = [];
  const missingHere = [];
  const onlyInNetbox = [];
  const seen = new Set();

  for (const device of netboxRows) {
    const key = normalizeForCompare(device['Имя']);
    const ours = byName.get(key);

    if (!ours) {
      onlyInNetbox.push(device);
      continue;
    }

    seen.add(key);

    const netboxSerial = String(device['Серийный номер'] || '').trim();
    const ourSerial = String(ours['SN Netbox'] || '').trim();

    if (!netboxSerial) continue; /* в NetBox серийника нет — сверять нечего */

    if (!ourSerial) missingHere.push({ device, ours, serial: netboxSerial });
    else if (netboxSerial.toLowerCase() !== ourSerial.toLowerCase()) {
      serialDiffers.push({ device, ours, netboxSerial, ourSerial });
    } else matched.push({ device, ours });
  }

  const onlyOurs = switches.filter(
    (row) => !seen.has(normalizeForCompare(row['Коммутатор']))
  );

  return {
    netboxTotal: netboxRows.length,
    ourTotal: switches.length,
    matched,
    serialDiffers,
    missingHere,
    onlyInNetbox,
    onlyOurs,
  };
}
