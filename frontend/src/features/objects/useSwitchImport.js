/**
 * Загрузка коммутаторов из файла.
 *
 * Существующие записи обновляются, новые добавляются. Удаление строки
 * из файла запись НЕ удаляет — для этого есть отдельное действие
 * в карточке. Так задумано: файл может быть выгрузкой по части сети.
 */
import { useState } from 'react';
import { useDispatch } from 'react-redux';
import * as XLSX from 'xlsx';

import { api } from '../../api/client';
import { prepareSwitchRows } from '../../domain/switchImport';
import { sanitizeParsed, checkFileSize } from '../../domain/safeParse';
import { loadSwitches } from '../../store/slices/switchesSlice';

export function useSwitchImport() {
  const dispatch = useDispatch();
  const [state, setState] = useState({ status: 'idle' });

  async function importFile(file) {
    const sizeError = checkFileSize(file);
    if (sizeError) {
      setState({ status: 'error', message: sizeError });
      return;
    }

    setState({ status: 'parsing' });

    let parsed;
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const raw = sanitizeParsed(XLSX.utils.sheet_to_json(sheet, { defval: '' }));
      parsed = prepareSwitchRows(raw);
    } catch {
      setState({ status: 'error', message: 'Не удалось прочитать файл.' });
      return;
    }

    if (!parsed.rows.length) {
      setState({
        status: 'error',
        message: 'В файле не найдено записей. Проверьте, что есть колонки «Mag» и «Коммутатор».',
      });
      return;
    }

    setState({ status: 'uploading' });

    try {
      const result = await api.post('/api/switches/bulk', { rows: parsed.rows });
      await dispatch(loadSwitches());

      let message = `Загружено записей: ${result.imported}.`;
      if (parsed.skipped) message += ` Пропущено без объекта или имени: ${parsed.skipped}.`;
      if (result.skippedOutOfScope) {
        message += ` Вне вашей зоны ответственности: ${result.skippedOutOfScope}.`;
      }

      setState({ status: 'done', message });
    } catch (error) {
      setState({ status: 'error', message: error.message });
    }
  }

  return { state, importFile };
}
