#!/usr/bin/env node
/**
 * Сверяет имена классов, используемые в компоненте, с объявленными
 * в его модуле стилей. Ловит опечатки, которые иначе проявились бы
 * только визуально — как пропавшее оформление.
 */
const fs = require('fs');
const path = require('path');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

let problems = 0;
let checked = 0;

for (const jsx of walk('src').filter((f) => f.endsWith('.jsx'))) {
  const src = fs.readFileSync(jsx, 'utf8');
  const importMatch = src.match(/from\s+['"](\.\/[\w.]+\.module\.css)['"]/);
  if (!importMatch) continue;

  const cssPath = path.resolve(path.dirname(jsx), importMatch[1]);
  if (!fs.existsSync(cssPath)) {
    console.log(`  ✗ ${path.basename(jsx)}: не найден файл стилей ${importMatch[1]}`);
    problems++;
    continue;
  }

  const css = fs.readFileSync(cssPath, 'utf8');

  /* Класс может быть объявлен где угодно: в начале строки, внутри
     медиазапроса с отступом, в составном селекторе (.a.b) или через
     запятую. Поэтому ищем любое вхождение вида «.имя», за которым
     не следует символ имени. */
  const declared = new Set(
    [...css.matchAll(/\.([A-Za-z_][\w-]*)(?![\w-])/g)].map((m) => m[1])
  );

  const used = new Set([...src.matchAll(/styles\.([A-Za-z_]\w*)/g)].map((m) => m[1]));

  checked++;
  for (const name of used) {
    if (!declared.has(name)) {
      console.log(`  ✗ ${path.basename(jsx)}: класс «${name}» не объявлен в ${path.basename(cssPath)}`);
      problems++;
    }
  }

  /* Объявленные, но не используемые — не ошибка, но помогает заметить
     забытые при переносе куски оформления. */
  const unused = [...declared].filter((name) => !used.has(name));
  if (unused.length > 6) {
    console.log(`  · ${path.basename(cssPath)}: не используется классов — ${unused.length}`);
  }
}

console.log(problems
  ? `\nнайдено расхождений: ${problems}`
  : `\nвсе классы на месте (проверено компонентов: ${checked})`);
process.exit(problems ? 1 : 0);
