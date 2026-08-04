/**
 * Проверка логики схемы шкафа.
 */
import { describe, it, expect } from 'vitest';
import {
  rackItemType, getRackHeight, longestFreeRun,
  buildRackLayout, normalizeSwitchName, firstFreeUnit,
} from '../racks';

describe('тип оборудования по наименованию', () => {
  it.each([
    ['Коммутатор DS253_72', 'switch'],
    ['Патч-панель ЛВС 24 порта', 'patch'],
    ['Оптическая полка', 'optic'],
    ['Органайзер', 'organizer'],
    ['Резерв', 'reserve'],
    ['', 'reserve'],
    ['Перекидной кросс', 'other'],
  ])('«%s» → %s', (name, expected) => {
    expect(rackItemType(name)).toBe(expected);
  });
});

describe('высота стойки', () => {
  it('берётся из характеристики', () => {
    expect(getRackHeight('22u', [])).toBe(22);
    expect(getRackHeight('Шкаф 42U напольный', [])).toBe(42);
  });

  it('без характеристики — по верхнему занятому юниту', () => {
    expect(getRackHeight('', [{ unit: 15 }])).toBe(15);
  });

  it('пустой шкаф не ниже двенадцати юнитов', () => {
    // Иначе схема выглядела бы обрезанной
    expect(getRackHeight('', [])).toBe(12);
  });
});

describe('свободное место подряд', () => {
  it('находит наибольший непрерывный отрезок', () => {
    const items = [{ unit: 10 }, { unit: 9 }, { unit: 5 }];
    // Свободны 12,11 (2) и 8,7,6 (3) и 4,3,2,1 (4)
    expect(longestFreeRun(12, items)).toBe(4);
  });

  it('пустой шкаф свободен целиком', () => {
    expect(longestFreeRun(10, [])).toBe(10);
  });

  it('полностью занятый шкаф не имеет свободного места', () => {
    const items = [1, 2, 3].map((unit) => ({ unit }));
    expect(longestFreeRun(3, items)).toBe(0);
  });
});

describe('раскладка стойки', () => {
  it('одинаковые соседние позиции объединяются в один блок', () => {
    const items = [
      { unit: 10, name: 'Сервер 2U', comment: '' },
      { unit: 9, name: 'Сервер 2U', comment: '' },
    ];
    const blocks = buildRackLayout(10, items);
    expect(blocks[0].span).toBe(2);
  });

  it('разные комментарии не объединяются', () => {
    const items = [
      { unit: 10, name: 'Патч-панель', comment: 'A' },
      { unit: 9, name: 'Патч-панель', comment: 'B' },
    ];
    const blocks = buildRackLayout(10, items);
    expect(blocks[0].span).toBe(1);
  });

  it('пустые юниты попадают в раскладку', () => {
    const blocks = buildRackLayout(3, [{ unit: 2, name: 'Коммутатор', comment: '' }]);
    expect(blocks).toHaveLength(3);
    expect(blocks.filter((b) => b.type === 'empty')).toHaveLength(2);
  });
});

describe('приведение имени коммутатора', () => {
  const prefixMap = { '253': 'DS', '134': 'MAG' };

  it('короткое обозначение дополняется префиксом объекта', () => {
    expect(normalizeSwitchName('Коммутатор SW_74', '253', prefixMap))
      .toBe('Коммутатор DS253_74');
  });

  it('разделитель может быть дефисом', () => {
    expect(normalizeSwitchName('Коммутатор SW-70', '134', prefixMap))
      .toBe('Коммутатор MAG134_70');
  });

  it('прочие наименования не изменяются', () => {
    expect(normalizeSwitchName('Патч-панель', '134', prefixMap)).toBe('Патч-панель');
  });
});

describe('первый свободный юнит', () => {
  it('ищется сверху вниз', () => {
    expect(firstFreeUnit(10, [{ unit: 10 }, { unit: 9 }])).toBe(8);
  });

  it('в заполненном шкафу отсутствует', () => {
    const items = [1, 2].map((unit) => ({ unit }));
    expect(firstFreeUnit(2, items)).toBeNull();
  });
});
