/**
 * Проверка поиска совпадающих серийных номеров.
 */
import { describe, it, expect } from 'vitest';
import { findDuplicates, countDuplicates } from '../duplicates';

describe('поиск совпадений', () => {
  const rows = [
    { 'Коммутатор': 'A', 'SN Netbox': 'N1', 'SN Lyra': 'L1' },
    { 'Коммутатор': 'B', 'SN Netbox': 'N1', 'SN Lyra': 'L2' },
    { 'Коммутатор': 'C', 'SN Netbox': ' N1 ', 'SN Lyra': 'не найден' },
    { 'Коммутатор': 'D', 'SN Netbox': '', 'SN Lyra': 'L1' },
  ];
  const result = findDuplicates(rows);

  it('пробелы по краям не мешают найти совпадение', () => {
    expect(result['SN Netbox'][0][1]).toHaveLength(3);
  });

  it('пометка «не найден» не считается серийным номером', () => {
    const values = result['SN Lyra'].map(([value]) => value);
    expect(values).not.toContain('не найден');
  });

  it('пустые значения пропускаются', () => {
    const values = result['SN Netbox'].map(([value]) => value);
    expect(values).not.toContain('');
  });

  it('совпадения упорядочены от частых к редким', () => {
    const counts = result['SN Netbox'].map(([, group]) => group.length);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it('общее число совпадений считается по обоим полям', () => {
    expect(countDuplicates(result)).toBe(2);
  });
});
