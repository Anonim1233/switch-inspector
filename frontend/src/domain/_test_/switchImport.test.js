/**
 * Проверка сверки с выгрузкой NetBox.
 *
 * Ключевой случай — разные разделители в именах: в данных встречаются
 * и DS253_66, и DS253-67, причём в двух системах они могут отличаться
 * у одной и той же записи.
 */
import { describe, it, expect } from 'vitest';
import { reconcileWithNetbox, normalizeForCompare, prepareSwitchRows } from '../switchImport';

describe('приведение имён к сравнимому виду', () => {
  it('разделитель не влияет на сравнение', () => {
    expect(normalizeForCompare('DS253-72')).toBe(normalizeForCompare('DS253_72'));
  });

  it('регистр не влияет', () => {
    expect(normalizeForCompare('MAG134_70')).toBe(normalizeForCompare('mag134_70'));
  });

  it('пробелы по краям убираются', () => {
    expect(normalizeForCompare(' DS253_1 ')).toBe('ds253_1');
  });
});

describe('сверка с выгрузкой', () => {
  const ours = [
    { 'Коммутатор': 'DS253-72', 'SN Netbox': '' },
    { 'Коммутатор': 'DS253_66', 'SN Netbox': 'FOC1111' },
    { 'Коммутатор': 'MAG134_71', 'SN Netbox': 'СТАРЫЙ' },
    { 'Коммутатор': 'MAG134_99', 'SN Netbox': '' },
  ];
  const netbox = [
    { 'Имя': 'DS253_72', 'Серийный номер': 'FOC0072' },
    { 'Имя': 'DS253-66', 'Серийный номер': 'FOC1111' },
    { 'Имя': 'MAG134_71', 'Серийный номер': 'НОВЫЙ' },
    { 'Имя': 'MAG134_500', 'Серийный номер': 'FOC5000' },
  ];
  const result = reconcileWithNetbox(netbox, ours);

  it('совпадение находится несмотря на разные разделители', () => {
    expect(result.matched.map((x) => x.ours['Коммутатор'])).toEqual(['DS253_66']);
  });

  it('пустое поле у нас попадает в список для заполнения', () => {
    expect(result.missingHere).toHaveLength(1);
    expect(result.missingHere[0].serial).toBe('FOC0072');
  });

  it('различие серийных номеров выявляется', () => {
    expect(result.serialDiffers.map((x) => x.ours['Коммутатор'])).toEqual(['MAG134_71']);
  });

  it('записи только в одной из систем разделяются', () => {
    expect(result.onlyInNetbox.map((x) => x['Имя'])).toEqual(['MAG134_500']);
    expect(result.onlyOurs.map((x) => x['Коммутатор'])).toEqual(['MAG134_99']);
  });
});

describe('подготовка строк к загрузке', () => {
  it('записи без объекта или имени отбрасываются', () => {
    const { rows, skipped } = prepareSwitchRows([
      { 'Mag': '134', 'Коммутатор': 'MAG134_1' },
      { 'Mag': '', 'Коммутатор': 'MAG134_2' },
      { 'Mag': '134', 'Коммутатор': '' },
    ]);
    expect(rows).toHaveLength(1);
    expect(skipped).toBe(2);
  });

  it('русские названия колонок переводятся в поля запроса', () => {
    const { rows } = prepareSwitchRows([
      { 'Mag': '134', 'Коммутатор': 'MAG134_1', 'IP Коммутатора': '10.0.0.1' },
    ]);
    expect(rows[0]).toMatchObject({ mag: '134', sw: 'MAG134_1', ip: '10.0.0.1' });
  });
});
