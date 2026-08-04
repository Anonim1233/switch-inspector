/**
 * Разбор выгрузки оборудования из NetBox.
 *
 * Данные обрабатываются целиком в браузере и на сервер не отправляются:
 * это справочная выгрузка, а не часть учёта.
 */

/**
 * Категории оборудования и роли NetBox, которые в них попадают.
 * Состав ролей перенесён из прежней версии без изменений.
 *
 * columns — поля, отсутствие которых считается замечанием: для сервера
 * важна стойка и позиция, для коммутатора — адрес и серийный номер.
 */
export const EQUIP_CATEGORIES = {
  switches: {
    label: 'Свитчи (NetBox)',
    roles: ['access_switch', 'core_switch', 'dc_switch', 'dc_core', 'dc_san_switch'],
    columns: ['IP-адрес', 'Серийный номер'],
  },
  network: {
    label: 'Роутеры / балансировщики',
    roles: ['border_router', 'wan_router', 'Balancer'],
    columns: ['IP-адрес', 'Серийный номер'],
  },
  security: {
    label: 'Firewall / ISE',
    roles: ['firewall', 'ise'],
    columns: ['IP-адрес', 'Серийный номер'],
  },
  wifi: {
    label: 'Wi-Fi контроллеры',
    roles: ['wifi_controller'],
    columns: ['IP-адрес'],
  },
  servers: {
    label: 'Сервера и виртуализация',
    roles: ['server', 'hypervisor', 'backup_server', 'MediaAgent', 'gpu_server'],
    columns: ['Стойка', 'Позиция', 'Серийный номер'],
  },
  storage: {
    label: 'СХД',
    roles: ['storage'],
    columns: ['IP-адрес', 'Стойка'],
  },
  telephony: {
    label: 'Телефония (DECT)',
    roles: ['bs_dect', 'telephony'],
    columns: ['IP-адрес', 'Серийный номер'],
  },
  infra: {
    label: 'Питание и пассивное',
    roles: [
      'bbu', 'rack_pdu', 'ats', 'ups', 'blanking_panel', 'patch_panel',
      'cable_organizer', 'kvm', 'shelf-19', 'usb-hub', 'console_server',
    ],
    columns: ['Стойка', 'Позиция'],
  },
};

export const CATEGORY_ORDER = Object.keys(EQUIP_CATEGORIES);

/** Категория по роли устройства. Неизвестные роли отбрасываются:
 *  в выгрузке встречается оборудование, к сети не относящееся. */
export function roleToCategory(role) {
  for (const key of CATEGORY_ORDER) {
    if (EQUIP_CATEGORIES[key].roles.includes(role)) return key;
  }
  return null;
}

/**
 * Замечания по записи оборудования.
 *
 * Помимо незаполненных полей учитывается статус: устройство может
 * числиться неисправным или отсутствующим в сети.
 */
export function equipmentIssues(row, categoryKey) {
  const issues = [];

  const status = row['Статус'] || '';
  if (status === 'Не в сети') issues.push('Не в сети');
  if (status === 'Неисправно') issues.push('Неисправно');

  const category = EQUIP_CATEGORIES[categoryKey];
  if (category) {
    for (const column of category.columns) {
      if (!row[column]) issues.push(`Нет: ${column}`);
    }
  }

  return issues;
}

/**
 * Разбирает строки выгрузки: определяет категорию, считает замечания.
 * Записи с неизвестной ролью в результат не попадают.
 */
export function parseEquipment(rows) {
  const result = [];

  for (const row of rows) {
    const category = roleToCategory(row['Роль']);
    if (!category) continue;

    const issues = equipmentIssues(row, category);
    result.push({
      ...row,
      _category: category,
      _issues: issues.length,
      'Замечания': issues.join('; '),
    });
  }

  return result;
}

/** Группировка по категориям — для карточек на странице раздела. */
export function groupByCategory(rows) {
  const grouped = {};
  for (const key of CATEGORY_ORDER) grouped[key] = [];
  for (const row of rows) grouped[row._category]?.push(row);
  return grouped;
}
