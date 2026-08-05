/**
 * Подготовка данных для отправки в NetBox.
 *
 * Модуль ничего не отправляет — только определяет, что подлежит
 * отправке, и раскладывает по категориям. Само обращение к NetBox
 * выполняет сервер: у браузера нет и не должно быть доступа к чужой
 * системе.
 */
import { normalizeForCompare } from './switchImport';

/**
 * Правила обращения с серийными номерами при расхождении.
 *
 * Выбор определяется владельцами данных, а не приложением: перезапись
 * означает, что мы молча заменим то, что вносили сотрудники другого
 * подразделения.
 */
export const SERIAL_POLICY = {
  /** Заполнять только пустые в NetBox. Ничего не портит. */
  FILL_EMPTY: 'fill_empty',
  /** Считать наши данные главнее и перезаписывать. */
  OVERWRITE: 'overwrite',
};

/**
 * Что будет отправлено в NetBox.
 *
 * @param {Array} switches — наши коммутаторы
 * @param {Array} netboxDevices — выгрузка NetBox
 * @param {string} policy — правило по серийным номерам
 * @returns {Object} разбивка по категориям
 */
export function planSerialExport(switches, netboxDevices, policy = SERIAL_POLICY.FILL_EMPTY) {
  const byName = new Map();
  for (const device of netboxDevices) {
    byName.set(normalizeForCompare(device['Имя']), device);
  }

  const toFill = [];      // в NetBox пусто, у нас есть
  const conflicts = [];   // значения расходятся
  const unchanged = [];   // уже совпадают
  const noSource = [];    // у нас нет серийника из Лиры
  const notInNetbox = []; // устройства нет в NetBox

  for (const row of switches) {
    const device = byName.get(normalizeForCompare(row['Коммутатор']));

    if (!device) {
      notInNetbox.push(row);
      continue;
    }

    // Отправляется серийный номер из Лиры. Пометка «не найден» —
    // это не номер, а признак отсутствия записи в системе.
    const source = String(row['SN Lyra'] || '').trim();
    if (!source || source.toLowerCase().includes('не найден')) {
      noSource.push(row);
      continue;
    }

    const current = String(device['Серийный номер'] || '').trim();

    if (!current) {
      toFill.push({ row, device, value: source });
    } else if (current.toLowerCase() !== source.toLowerCase()) {
      conflicts.push({ row, device, ours: source, theirs: current });
    } else {
      unchanged.push({ row, device });
    }
  }

  // При осторожном правиле расхождения не отправляются вовсе —
  // они остаются списком для разбора человеком.
  const willSend = policy === SERIAL_POLICY.OVERWRITE
    ? [...toFill, ...conflicts.map((c) => ({ row: c.row, device: c.device, value: c.ours }))]
    : toFill;

  return {
    policy,
    toFill,
    conflicts,
    unchanged,
    noSource,
    notInNetbox,
    willSend,
    summary: {
      всего: switches.length,
      кОтправке: willSend.length,
      заполнитьПустые: toFill.length,
      расхождений: conflicts.length,
      ужеСовпадает: unchanged.length,
      безИсточника: noSource.length,
      нетВNetBox: notInNetbox.length,
    },
  };
}

/**
 * Что можно отправить о шкафах.
 *
 * Наполнение шкафа переносится не целиком: в NetBox стойка содержит
 * устройства с моделью и производителем, а у нас позиции записаны
 * текстом. Отправляется только то, что в NetBox уже существует —
 * то есть коммутаторы с их размещением.
 */
export function planRackExport(cabinets, itemsByCabinet, netboxDevices) {
  const byName = new Map();
  for (const device of netboxDevices) {
    byName.set(normalizeForCompare(device['Имя']), device);
  }

  const racks = [];        // сами стойки
  const placements = [];   // привязка устройств к стойке и юниту
  const skipped = [];      // позиции, которых нет в NetBox

  for (const cabinet of cabinets) {
    const height = parseRackHeight(cabinet.characteristic);
    racks.push({
      name: cabinet.name,
      height,
      location: cabinet.location || null,
      mag: cabinet.mag,
    });

    for (const item of itemsByCabinet[cabinet.id] ?? []) {
      // Отправляем только распознанные коммутаторы: сервер уже
      // сопоставил позицию с записью в учёте.
      if (!item.matchedSw) {
        skipped.push({ cabinet: cabinet.name, unit: item.unit, name: item.name });
        continue;
      }

      const device = byName.get(normalizeForCompare(item.matchedSw));
      if (!device) {
        skipped.push({ cabinet: cabinet.name, unit: item.unit, name: item.name, reason: 'нет в NetBox' });
        continue;
      }

      placements.push({
        device: item.matchedSw,
        rack: cabinet.name,
        unit: Number(item.unit),
        currentRack: device['Стойка'] || null,
        currentUnit: device['Позиция'] || null,
      });
    }
  }

  // Расхождения размещения выносим отдельно: перемещение устройства
  // в другую стойку — существенное изменение, не стоит делать его
  // незаметно вместе с остальным.
  const moves = placements.filter(
    (p) => p.currentRack && normalizeForCompare(p.currentRack) !== normalizeForCompare(p.rack)
  );
  const newPlacements = placements.filter((p) => !p.currentRack);

  return {
    racks,
    placements,
    newPlacements,
    moves,
    skipped,
    summary: {
      стоек: racks.length,
      размещений: placements.length,
      новыхРазмещений: newPlacements.length,
      перемещений: moves.length,
      пропущено: skipped.length,
    },
  };
}

/** Высота стойки из характеристики: «22u» → 22. */
function parseRackHeight(characteristic) {
  const match = String(characteristic || '').match(/(\d+)\s*u/i);
  return match ? Number(match[1]) : null;
}
