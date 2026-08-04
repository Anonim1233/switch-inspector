/**
 * Проверка подсчёта замечаний.
 *
 * Логика продублирована на сервере, поэтому расхождение здесь означает
 * расхождение цифр в отчёте с цифрами на экране.
 */
import { describe, it, expect } from 'vitest';
import { computeIssues, detectPrefix, objectLabel } from '../issues';

describe('подсчёт замечаний', () => {
  it('полностью заполненная запись не имеет замечаний', () => {
    const row = {
      'IP Коммутатора': '10.0.0.1',
      'Расположение': 'Торговый зал',
      'Шкаф': 'S7',
      'SN Lyra': 'LYR-1',
      'SN Netbox': 'NB-1',
      'Модель SW': 'Cisco 2960',
    };
    expect(computeIssues(row).count).toBe(0);
  });

  it('пустая запись даёт шесть замечаний', () => {
    // Именно шесть, а не семь: категории по SN Lyra взаимоисключающие
    expect(computeIssues({}).count).toBe(6);
  });

  it('пометка «не найден» даёт отдельное замечание вместо «не указан»', () => {
    const row = {
      'IP Коммутатора': '10.0.0.1',
      'Расположение': 'Зал',
      'Шкаф': 'S1',
      'SN Lyra': 'не найден в базе',
      'SN Netbox': 'NB-1',
      'Модель SW': 'HP',
    };
    const { issues } = computeIssues(row);
    expect(issues).toEqual(['Не найден в Лира']);
  });

  it('регистр в пометке не имеет значения', () => {
    const row = { 'SN Lyra': 'НЕ НАЙДЕН' };
    expect(computeIssues(row).issues).toContain('Не найден в Лира');
  });

  it('две категории по SN Lyra не могут возникнуть одновременно', () => {
    const { issues } = computeIssues({ 'SN Lyra': 'не найден' });
    const lyraIssues = issues.filter((i) => i.includes('Lyra') || i.includes('Лира'));
    expect(lyraIssues).toHaveLength(1);
  });
});

describe('определение префикса объекта', () => {
  it('большинство имён с DS даёт распределительный центр', () => {
    const rows = [
      { 'Коммутатор': 'DS253_1' },
      { 'Коммутатор': 'DS253_2' },
      { 'Коммутатор': 'MAG253_3' },
    ];
    expect(detectPrefix(rows)).toBe('DS');
  });

  it('по умолчанию магазин', () => {
    expect(detectPrefix([{ 'Коммутатор': 'MAG134_1' }])).toBe('MAG');
    expect(detectPrefix([])).toBe('MAG');
  });

  it('отображаемое имя объекта собирается из префикса и кода', () => {
    expect(objectLabel('134', { '134': 'MAG' })).toBe('MAG 134');
    expect(objectLabel('253', { '253': 'DS' })).toBe('DS 253');
    // Неизвестный объект считается магазином
    expect(objectLabel('999', {})).toBe('MAG 999');
  });
});
