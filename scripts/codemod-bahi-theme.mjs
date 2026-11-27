import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const TARGET_DIRS = [
  path.join(ROOT, 'apps', 'web', 'app', '(office)'),
  path.join(ROOT, 'apps', 'web', 'app', '(auth)'),
  path.join(ROOT, 'apps', 'web', 'src', 'components'),
];
const EXTRA_FILES = [
  path.join(ROOT, 'apps', 'web', 'app', 'error.tsx'),
  path.join(ROOT, 'apps', 'web', 'app', 'not-found.tsx'),
  path.join(ROOT, 'apps', 'web', 'app', 'forbidden', 'page.tsx'),
];

function collectFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(full, out);
    } else if (entry.isFile() && /\.(tsx|ts)$/.test(entry.name) && !entry.name.endsWith('.stories.tsx')) {
      out.push(full);
    }
  }
  return out;
}

const SOLID_BG_RE = /\b(bg-action|bg-teal-[56]00|bg-emerald-[56]00|bg-rose-[56]00|bg-red-[56]00|bg-indigo-[56]00|bg-blue-[56]00|bg-amber-[56]00|bg-green-[56]00|bg-madder(?!-soft)|bg-leaf(?!-soft)|bg-haldi(?!-soft)|bg-ink)\b/;

function transformClassString(cls) {
  let s = cls;

  // Surfaces
  s = s.replace(/\bbg-zinc-950(?:\/\d+)?\b/g, 'bg-paper');
  s = s.replace(/\bbg-zinc-900(?:\/\d+)?\b/g, 'bg-sheet');
  s = s.replace(/\bbg-zinc-800(?:\/\d+)?\b/g, 'bg-sunken');
  s = s.replace(/\bbg-zinc-700(?:\/\d+)?\b/g, 'bg-sunken');
  s = s.replace(/\bbg-black(?:\/\d+)?\b/g, 'bg-black/45');

  s = s.replace(/\bhover:bg-zinc-950(?:\/\d+)?\b/g, 'hover:bg-paper');
  s = s.replace(/\bhover:bg-zinc-900(?:\/\d+)?\b/g, 'hover:bg-paper');
  s = s.replace(/\bhover:bg-zinc-800(?:\/\d+)?\b/g, 'hover:bg-paper');
  s = s.replace(/\bhover:bg-zinc-700(?:\/\d+)?\b/g, 'hover:bg-sunken');

  // Borders & Dividers
  s = s.replace(/\bborder-zinc-900(?:\/\d+)?\b/g, 'border-rule');
  s = s.replace(/\bborder-zinc-800(?:\/\d+)?\b/g, 'border-rule');
  s = s.replace(/\bborder-zinc-700(?:\/\d+)?\b/g, 'border-rule-strong');
  s = s.replace(/\bborder-zinc-600(?:\/\d+)?\b/g, 'border-rule-strong');
  s = s.replace(/\bhover:border-zinc-700(?:\/\d+)?\b/g, 'hover:border-rule-strong');
  s = s.replace(/\bdivide-zinc-800(?:\/\d+)?\b/g, 'divide-rule');
  s = s.replace(/\bdivide-zinc-700(?:\/\d+)?\b/g, 'divide-rule');

  // Text colors
  s = s.replace(/\btext-zinc-100\b/g, 'text-ink');
  s = s.replace(/\btext-zinc-200\b/g, 'text-ink');
  s = s.replace(/\btext-zinc-300\b/g, 'text-ink-2');
  s = s.replace(/\btext-zinc-400\b/g, 'text-ink-3');
  s = s.replace(/\btext-zinc-500\b/g, 'text-ink-3');
  s = s.replace(/\btext-zinc-600\b/g, 'text-ink-3');
  s = s.replace(/\bplaceholder-zinc-[456]00\b/g, 'placeholder-ink-3');

  // Teal -> Action (Indigo)
  s = s.replace(/\bbg-teal-600(?:\/\d+)?\b/g, 'bg-action');
  s = s.replace(/\bbg-teal-500\b/g, 'bg-action');
  s = s.replace(/\bhover:bg-teal-500\b/g, 'hover:bg-action-hover');
  s = s.replace(/\bbg-teal-(?:950|900|500)\/\d+\b/g, 'bg-action-soft');
  s = s.replace(/\btext-teal-[234]00(?:\/\d+)?\b/g, 'text-action');
  s = s.replace(/\bhover:text-teal-[234]00\b/g, 'hover:text-action-hover');
  s = s.replace(/\bborder-teal-[45]00(?:\/\d+)?\b/g, 'border-action/30');
  s = s.replace(/\bshadow-teal-950(?:\/\d+)?\b/g, '');
  s = s.replace(/\bfocus:ring-teal-500\b/g, 'focus:ring-action');
  s = s.replace(/\bfocus:border-teal-500\b/g, 'focus:border-action');
  s = s.replace(/\bhover:border-teal-500(?:\/\d+)?\b/g, 'hover:border-action');

  // Semantic dark-mode colors -> Bahi-Khata semantic tokens
  s = s.replace(/\bbg-emerald-600\b/g, 'bg-leaf');
  s = s.replace(/\bhover:bg-emerald-500\b/g, 'hover:opacity-90');
  s = s.replace(/\bbg-emerald-(?:950|900|500)\/\d+\b/g, 'bg-leaf-soft');
  s = s.replace(/\btext-emerald-[234]00\b/g, 'text-leaf');
  s = s.replace(/\bborder-emerald-500(?:\/\d+)?\b/g, 'border-leaf/30');
  s = s.replace(/\bhover:border-emerald-500(?:\/\d+)?\b/g, 'hover:border-leaf');

  s = s.replace(/\bbg-amber-600\b/g, 'bg-haldi');
  s = s.replace(/\bhover:bg-amber-500\b/g, 'hover:opacity-90');
  s = s.replace(/\bbg-amber-(?:950|900|500)\/\d+\b/g, 'bg-haldi-soft');
  s = s.replace(/\btext-amber-[1234]00(?:\/\d+)?\b/g, 'text-haldi');
  s = s.replace(/\bborder-amber-500(?:\/\d+)?\b/g, 'border-haldi/30');
  s = s.replace(/\bhover:border-amber-500(?:\/\d+)?\b/g, 'hover:border-haldi');

  s = s.replace(/\bbg-rose-600\b/g, 'bg-madder');
  s = s.replace(/\bhover:bg-rose-500\b/g, 'hover:opacity-90');
  s = s.replace(/\bbg-rose-(?:950|900|500)\/\d+\b/g, 'bg-madder-soft');
  s = s.replace(/\btext-rose-[234]00\b/g, 'text-madder');
  s = s.replace(/\bborder-rose-500(?:\/\d+)?\b/g, 'border-madder/30');
  s = s.replace(/\bhover:border-rose-500(?:\/\d+)?\b/g, 'hover:border-madder');
  s = s.replace(/\bshadow-rose-950(?:\/\d+)?\b/g, '');

  s = s.replace(/\bbg-(?:indigo|sky|blue)-600\b/g, 'bg-action');
  s = s.replace(/\bhover:bg-(?:indigo|sky|blue)-500\b/g, 'hover:bg-action-hover');
  s = s.replace(/\bbg-(?:indigo|sky|blue)-(?:950|900|500)\/\d+\b/g, 'bg-action-soft');
  s = s.replace(/\btext-(?:indigo|sky|blue)-[234]00(?:\/\d+)?\b/g, 'text-action');
  s = s.replace(/\bborder-(?:indigo|sky|blue)-500(?:\/\d+)?\b/g, 'border-action/30');
  s = s.replace(/\bhover:border-(?:indigo|sky|blue)-500(?:\/\d+)?\b/g, 'hover:border-action');

  // text-white / hover:text-white ONLY when not on solid colored bg
  if (!SOLID_BG_RE.test(s)) {
    s = s.replace(/\btext-white\b/g, 'text-ink');
    s = s.replace(/\bhover:text-white\b/g, 'hover:text-ink');
  }

  // Geometry, glassmorphism, font-black, sub-13px sizes
  s = s.replace(/\brounded-(?:2xl|3xl)\b/g, 'rounded-[4px]');
  s = s.replace(/\brounded-xl\b/g, 'rounded-[3px]');
  s = s.replace(/\bbackdrop-blur(?:-(?:xs|sm|md|lg|xl|2xl|3xl))?\b/g, '');
  s = s.replace(/\bfont-black\b/g, 'font-semibold');
  s = s.replace(/\btext-\[1[01]px\]\b/g, 'text-[13px]');

  // Clean extra horizontal spaces while preserving leading/trailing whitespace on template segments
  s = s.replace(/ {2,}/g, ' ');
  return s;
}

const files = [
  ...TARGET_DIRS.flatMap((d) => collectFiles(d)),
  ...EXTRA_FILES.filter((f) => fs.existsSync(f)),
];

let changedFiles = 0;
for (const file of files) {
  const original = fs.readFileSync(file, 'utf8');
  // Transform className="..." and className={`...`} and single-quoted class strings containing tailwind classes
  let next = original.replace(/className="([^"]*)"/g, (_, cls) => `className="${transformClassString(cls)}"`);
  next = next.replace(/className='([^']*)'/g, (_, cls) => `className='${transformClassString(cls)}'`);
  next = next.replace(/className=\{`([\s\S]*?)`\}/g, (_, tpl) => {
    // Transform static segments between ${...} expressions safely
    const transformed = tpl.replace(/(^|\})([^`$]*?)(\$\{|$)/g, (__, pre, seg, post) => {
      return pre + transformClassString(seg) + post;
    });
    return `className={\`${transformed}\`}`;
  });
  // Also transform Tailwind helper maps stored in string literals like toneClasses / badge maps
  next = next.replace(/'([^']*\b(?:bg-zinc-|text-zinc-|border-zinc-|bg-teal-|text-teal-|border-teal-|bg-emerald-|bg-amber-|bg-rose-|rounded-2xl|rounded-xl|font-black)[^']*)'/g, (_, cls) => {
    return `'${transformClassString(cls)}'`;
  });

  if (next !== original) {
    fs.writeFileSync(file, next, 'utf8');
    changedFiles++;
  }
}

console.log(`Codemod updated ${changedFiles} / ${files.length} files.`);
