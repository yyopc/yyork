#!/usr/bin/env node
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, files);
    else if (name.endsWith('.mdx')) files.push(path);
  }
  return files;
}

function decodeEntities(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function sanitize(content) {
  return content
    .replace(/<code>([\s\S]*?)<\/code>/g, (_, c) => {
      const value = decodeEntities(c).replace(/`/g, '\\`');
      return `\`${value}\``;
    })
    .replace(/<strong>([\s\S]*?)<\/strong>/g, (_, c) => `**${c}**`)
    .replace(/<em>([\s\S]*?)<\/em>/g, (_, c) => `*${c}*`)
    .replace(
      /<span class="lab">([\s\S]*?)<\/span>\s*<span class="ln">→<\/span>/g,
      (_, label) => `\n→ *${label.replace(/<br\s*\/?>/gi, ' · ').trim()}*\n`
    )
    .replace(
      /<span class="lab">([\s\S]*?)<\/span>\s*<span class="ln">✓<\/span>/g,
      (_, label) => `\n→ ✓ *${label.trim()}*\n`
    )
    .replace(
      /<span class="lab">([\s\S]*?)<\/span>\s*<span class="ln">✗<\/span>/g,
      (_, label) => `\n→ ✗ *${label.trim()}*\n`
    )
    .replace(/<span class="ln">→<\/span>/g, '→')
    .replace(
      /<span class="pill [^"]*">([\s\S]*?)<\/span>/g,
      (_, c) => `\`${c.trim()}\``
    )
    .replace(/<span style="[^"]*">([\s\S]*?)<\/span>/g, '$1')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\s*<hr class="soft"\s*\/?>\s*/g, '\n\n---\n\n')
    .replace(/<[^>\n]+>/g, '')
    .replace(/\n{3,}/g, '\n\n');
}

for (const path of walk('internal/docs/content/docs')) {
  writeFileSync(path, sanitize(readFileSync(path, 'utf8')));
  console.log(`sanitized ${path}`);
}
