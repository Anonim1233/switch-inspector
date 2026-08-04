#!/usr/bin/env node
/**
 * Проверка файлов JSX без установки зависимостей.
 *
 * Полноценный разбор здесь недоступен, поэтому проверяется то, что даёт
 * большинство ошибок при ручном переносе: баланс скобок и парность тегов.
 * Это не замена сборке, а быстрая проверка перед передачей файлов.
 */
const fs = require('fs');
const path = require('path');

/** Убирает строки, комментарии и регулярные выражения — иначе скобки
 *  внутри них считались бы за настоящие. */
function stripLiterals(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];

    if (c === '/' && next === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && next === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '{' && next === '/' && src[i + 2] === '*') { i += 3; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 4; continue; }

    if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      i++;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === '\\') i++;
        i++;
      }
      i++;
      out += '""';
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function checkBrackets(src, file) {
  const problems = [];
  const pairs = { ')': '(', ']': '[', '}': '{' };
  const stack = [];
  let line = 1;

  for (const ch of src) {
    if (ch === '\n') line++;
    if (ch === '(' || ch === '[' || ch === '{') stack.push({ ch, line });
    else if (pairs[ch]) {
      const top = stack.pop();
      if (!top) problems.push(`${file}:${line} — лишняя закрывающая «${ch}»`);
      else if (top.ch !== pairs[ch]) problems.push(`${file}:${line} — «${ch}» не соответствует «${top.ch}» со строки ${top.line}`);
    }
  }
  for (const left of stack) problems.push(`${file}:${left.line} — не закрыта «${left.ch}»`);
  return problems;
}

function checkTags(src, file) {
  const problems = [];
  const stack = [];

  /* Теги разбираются посимвольно, а не регулярным выражением: атрибуты
     могут содержать вложенные фигурные скобки, шаблонные строки и знак
     «больше» внутри стрелочных функций, и выражением такое надёжно
     не описать. */
  let i = 0;
  const lineAt = (pos) => src.slice(0, pos).split('\n').length;

  while (i < src.length) {
    if (src[i] !== '<') { i++; continue; }

    const tagStart = i;
    i++;

    const closing = src[i] === '/';
    if (closing) i++;

    /* Фрагмент <>...</> имени не имеет — пропускаем вместе с закрывающим. */
    if (src[i] === '>') { i++; continue; }

    const nameMatch = /^[A-Za-z][\w.]*/.exec(src.slice(i));
    if (!nameMatch) { i++; continue; }
    const name = nameMatch[0];
    i += name.length;

    /* Проходим атрибуты, считая уровни вложенности и пропуская строки. */
    let depth = 0;
    let quote = null;
    let selfClose = false;

    while (i < src.length) {
      const c = src[i];

      if (quote) {
        if (c === '\\') { i += 2; continue; }
        if (c === quote) quote = null;
        i++;
        continue;
      }

      if (c === '"' || c === "'" || c === '`') { quote = c; i++; continue; }
      if (c === '{') { depth++; i++; continue; }
      if (c === '}') { depth--; i++; continue; }

      if (depth === 0) {
        if (c === '/' && src[i + 1] === '>') { selfClose = true; i += 2; break; }
        if (c === '>') { i++; break; }
      }
      i++;
    }

    if (selfClose) continue;

    const line = lineAt(tagStart);
    if (closing) {
      const top = stack.pop();
      if (!top) problems.push(`${file}:${line} — закрыт тег <${name}>, который не открывался`);
      else if (top.name !== name) problems.push(`${file}:${line} — </${name}> не соответствует <${top.name}> со строки ${top.line}`);
    } else {
      stack.push({ name, line });
    }
  }

  for (const open of stack) problems.push(`${file}:${open.line} — не закрыт тег <${open.name}>`);
  return problems;
}

const files = process.argv.slice(2);
let total = 0;

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const clean = stripLiterals(src);
  const problems = [...checkBrackets(clean, path.basename(file)), ...checkTags(src, path.basename(file))];
  if (problems.length) {
    total += problems.length;
    problems.forEach((p) => console.log('  ✗ ' + p));
  } else {
    console.log('  ✓ ' + path.basename(file));
  }
}

console.log(total ? `\nнайдено замечаний: ${total}` : '\nзамечаний нет');
process.exit(total ? 1 : 0);
