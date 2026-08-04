/**
 * Печать: паспорт объекта и наклейки с кодами для сканирования.
 *
 * Печатные формы открываются отдельным окном: у них своя разметка,
 * не связанная с интерфейсом приложения, и собственные правила
 * оформления страницы.
 */
import QRCode from 'qrcode';

/**
 * Открывает окно печати с готовой разметкой.
 *
 * @param {string} title — заголовок окна
 * @param {string} bodyHtml — содержимое
 * @param {string} extraCss — дополнительные правила
 */
function openPrintWindow(title, bodyHtml, extraCss = '') {
  let printWindow;
  try {
    printWindow = window.open('', '_blank', 'width=900,height=700');
  } catch {
    alert('Печать недоступна: браузер заблокировал открытие окна. Разрешите всплывающие окна для этого сайта.');
    return null;
  }

  if (!printWindow) {
    alert('Печать недоступна: браузер заблокировал открытие окна. Разрешите всплывающие окна для этого сайта.');
    return null;
  }

  printWindow.document.write(`<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8" />
<title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; color: #111; padding: 18px; }
  h1 { font-size: 18px; margin-bottom: 4px; }
  .sub { font-size: 12px; color: #666; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 5px 7px; font-size: 11px; border: 1px solid #ccc; text-align: left; }
  th { background: #f2f2f2; font-weight: 700; }
  ${extraCss}
  @media print { @page { margin: 12mm 14mm; } }
</style>
</head>
<body>${bodyHtml}</body>
</html>`);

  printWindow.document.close();
  return printWindow;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Паспорт объекта: перечень коммутаторов для работы на месте.
 */
export function printObjectPassport(objectName, rows) {
  const body = `
    <h1>Паспорт объекта ${escapeHtml(objectName)}</h1>
    <div class="sub">Коммутаторов: ${rows.length} · Сформировано: ${new Date().toLocaleDateString('ru-RU')}</div>
    <table>
      <thead>
        <tr>
          <th>Шкаф</th><th>Коммутатор</th><th>IP-адрес</th>
          <th>Расположение</th><th>Модель</th><th>SN Netbox</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            <td>${escapeHtml(row['Шкаф'])}</td>
            <td>${escapeHtml(row['Коммутатор'])}</td>
            <td>${escapeHtml(row['IP Коммутатора'])}</td>
            <td>${escapeHtml(row['Расположение'])}</td>
            <td>${escapeHtml(row['Модель SW'])}</td>
            <td>${escapeHtml(row['SN Netbox'])}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;

  const printWindow = openPrintWindow(`Паспорт ${objectName}`, body);
  if (printWindow) setTimeout(() => printWindow.print(), 300);
}

/**
 * Наклейка с кодом для сканирования.
 *
 * Код рисуется заранее и вставляется картинкой: в отдельном окне
 * нет библиотек приложения, и рисовать его там было бы нечем.
 */
export async function printQrLabel({ title, subtitle, url, hint }) {
  let dataUrl;
  try {
    dataUrl = await QRCode.toDataURL(url, { width: 200, margin: 1, errorCorrectionLevel: 'M' });
  } catch {
    alert('Не удалось сформировать код для сканирования.');
    return;
  }

  const body = `
    <div class="label">
      <div class="obj">${escapeHtml(subtitle)}</div>
      <div class="name">${escapeHtml(title)}</div>
      <img src="${dataUrl}" alt="" width="170" height="170" />
      <div class="hint">${escapeHtml(hint)}</div>
    </div>`;

  const css = `
    body { text-align: center; padding: 24px; }
    .label { display: inline-block; padding: 14px 18px; border: 1px solid #ddd; border-radius: 8px; }
    .obj { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 3px; }
    .name { font-size: 17px; font-weight: 700; margin-bottom: 12px; }
    .hint { font-size: 8.5px; color: #aaa; margin-top: 8px; }`;

  const printWindow = openPrintWindow(`Наклейка — ${title}`, body, css);
  if (printWindow) setTimeout(() => printWindow.print(), 300);
}

/**
 * Наклейки на все шкафы объекта — одним листом.
 * Удобно перед плановым обходом: не нужно печатать по одной.
 */
export async function printAllCabinetLabels(objectName, cabinets, buildUrl) {
  const labels = [];

  for (const cabinet of cabinets) {
    try {
      const dataUrl = await QRCode.toDataURL(buildUrl(cabinet), {
        width: 160, margin: 1, errorCorrectionLevel: 'M',
      });
      labels.push(`
        <div class="label">
          <div class="obj">${escapeHtml(objectName)}</div>
          <div class="name">${escapeHtml(cabinet.name)}</div>
          <img src="${dataUrl}" alt="" width="130" height="130" />
        </div>`);
    } catch {
      /* Один несформированный код не должен срывать печать остальных. */
    }
  }

  if (!labels.length) {
    alert('Не удалось сформировать наклейки.');
    return;
  }

  const css = `
    body { padding: 16px; }
    .sheet { display: flex; flex-wrap: wrap; gap: 12px; }
    .label { width: 180px; padding: 12px; text-align: center; border: 1px solid #ddd; border-radius: 8px; page-break-inside: avoid; }
    .obj { font-size: 9px; color: #888; text-transform: uppercase; letter-spacing: .08em; }
    .name { font-size: 14px; font-weight: 700; margin: 3px 0 8px; }`;

  const printWindow = openPrintWindow(
    `Наклейки — ${objectName}`,
    `<div class="sheet">${labels.join('')}</div>`,
    css
  );
  if (printWindow) setTimeout(() => printWindow.print(), 400);
}
