/**
 * Формирование текста заявки на уточнение данных.
 *
 * Текст готовится для отправки в смежное подразделение, поэтому
 * оформление рассчитано на обычное письмо, а не на разметку.
 */

function ticketHeader(subject) {
  const date = new Date().toLocaleDateString('ru-RU');
  return [
    'Обращение на обогащение отчета',
    `Дата: ${date}`,
    `Тема: ${subject}`,
    '',
    'Здравствуйте!',
    '',
  ].join('\n');
}

/** Заявка по одному коммутатору. */
export function buildSwitchTicket(row, objectName) {
  if (!row || !row._issues) return null;

  const lines = [
    ticketHeader(`Актуализация данных — коммутатор ${row['Коммутатор']}`),
    'В ходе проверки отчета были выявлены неполные данные',
    'по сетевому оборудованию. Прошу предоставить недостающую информацию.',
    '',
    '─────────────────────────────────────────',
    `Объект:       ${objectName}`,
    `Коммутатор:   ${row['Коммутатор']}`,
  ];

  /* В заявку попадают только заполненные поля: пустые строки вида
     «IP-адрес:» лишь усложнили бы чтение получателю. */
  if (row['IP Коммутатора']) lines.push(`IP-адрес:     ${row['IP Коммутатора']}`);
  if (row['Модель SW']) lines.push(`Модель:       ${row['Модель SW']}`);
  if (row['Расположение']) lines.push(`Расположение: ${row['Расположение']}`);
  if (row['Шкаф']) lines.push(`Шкаф:         ${row['Шкаф']}`);

  lines.push('─────────────────────────────────────────', 'Отсутствующие данные:');
  for (const issue of row['Замечания'].split('; ')) {
    lines.push(`  ✗ ${issue}`);
  }

  return { text: lines.join('\n'), title: `Заявка — ${row['Коммутатор']}`, count: 1 };
}

/** Общая заявка по всем проблемным записям объекта. */
export function buildObjectTicket(rows, objectName) {
  const problems = rows.filter((row) => row._issues > 0);
  if (!problems.length) return null;

  const lines = [
    ticketHeader(`Актуализация данных — объект ${objectName}`),
    `По результатам проверки отчета на объекте ${objectName}`,
    `выявлено ${problems.length} коммутатор(а/ов) с неполными данными.`,
    'Прошу предоставить недостающую информацию по каждому устройству.',
    '',
    '═════════════════════════════════════════',
  ];

  problems.forEach((row, index) => {
    const ip = row['IP Коммутатора'] ? ` (${row['IP Коммутатора']})` : '  (нет IP)';
    lines.push(`${index + 1}. ${row['Коммутатор']}${ip}`);

    if (row['Расположение']) lines.push(`   Расположение: ${row['Расположение']}`);
    if (row['Модель SW']) lines.push(`   Модель: ${row['Модель SW']}`);

    lines.push('   Отсутствует:');
    for (const issue of row['Замечания'].split('; ')) {
      lines.push(`     ✗ ${issue}`);
    }

    if (index < problems.length - 1) lines.push('');
  });

  return {
    text: lines.join('\n'),
    title: `Заявка — ${objectName} (${problems.length})`,
    count: problems.length,
  };
}
