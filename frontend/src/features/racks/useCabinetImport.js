/**
 * Загрузка наполнения шкафов из файла.
 *
 * Разбор идёт в браузере, на сервер уходит уже готовая структура —
 * так же, как в прежней версии.
 */
import { useState } from 'react';
import { useDispatch } from 'react-redux';
import * as XLSX from 'xlsx';

import { api } from '../../api/client';
import { parseCabinetsWorkbook } from '../../domain/cabinetImport';
import { sanitizeParsed, checkFileSize } from '../../domain/safeParse';
import { normalizeSwitchName } from '../../domain/racks';
import { loadCabinets, loadUndocumented } from '../../store/slices/cabinetsSlice';

export function useCabinetImport(mag, prefixMap) {
  const dispatch = useDispatch();
  const [state, setState] = useState({ status: 'idle' });

  async function importFile(file) {
    const sizeError = checkFileSize(file);
    if (sizeError) {
      setState({ status: 'error', message: sizeError });
      return;
    }

    setState({ status: 'parsing' });

    let cabinets;
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      cabinets = parseCabinetsWorkbook(workbook, (sheet) =>
        sanitizeParsed(XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }))
      );
    } catch {
      setState({ status: 'error', message: 'Не удалось прочитать файл. Ожидается заполненный шаблон.' });
      return;
    }

    if (!cabinets.length) {
      setState({
        status: 'error',
        message: 'В файле не найдено шкафов. Проверьте, что заполнены строки «Наименование:».',
      });
      return;
    }

    /* Короткие обозначения приводятся к полному виду до отправки:
       «SW_74» в объекте 253 становится «DS253_74». Иначе сверка
       с учётом коммутаторов не найдёт совпадений. */
    const prepared = cabinets.map((cabinet) => ({
      ...cabinet,
      items: cabinet.items.map((item) => ({
        ...item,
        name: normalizeSwitchName(item.name, mag, prefixMap),
      })),
    }));

    setState({ status: 'uploading' });

    try {
      const result = await api.post('/api/cabinets/import', { mag, cabinets: prepared });
      dispatch(loadCabinets(mag));
      dispatch(loadUndocumented(mag));
      setState({
        status: 'done',
        message: `Загружено: создано ${result.created}, обновлено ${result.updated}.`,
      });
    } catch (error) {
      setState({ status: 'error', message: error.message });
    }
  }

  return { state, importFile, reset: () => setState({ status: 'idle' }) };
}
