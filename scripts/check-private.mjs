// Checks that none of the private criteria wording has leaked into files
// that git would commit. Looks for private/audit_criteria.json (git-ignored).
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const src = process.argv[2] || 'private/audit_criteria.json';
if (!existsSync(src)) {
  console.log(`No private criteria file at ${src} - nothing to compare against.`);
  process.exit(0);
}
const lib = JSON.parse(readFileSync(src, 'utf8'));
const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const needles = [];
for (const c of lib.criteria) {
  needles.push(norm(c.text));
  // A distinctive chunk too, to catch partial copies.
  if (c.text.length > 40) needles.push(norm(c.text.slice(5, 40)));
}
for (const a of lib.areas) {
  needles.push(norm(a.why));
  if (a.why.length > 40) needles.push(norm(a.why.slice(5, 40)));
}
if (lib.coverage_note) needles.push(norm(lib.coverage_note.slice(0, 60)));

const files = execSync('git ls-files --cached --others --exclude-standard', { encoding: 'utf8' })
  .split('\n').filter(Boolean)
  .filter((f) => !/\.(png|jpg|jpeg|woff2?|ttf|ico)$/i.test(f));

let hits = 0;
for (const f of files) {
  if (!existsSync(f)) continue;
  const text = norm(readFileSync(f, 'utf8'));
  for (const n of needles) {
    if (text.includes(n)) {
      console.error(`LEAK: "${n}" found in ${f}`);
      hits++;
    }
  }
  if (/audit_criteria\.json$/i.test(f)) { console.error(`LEAK: criteria file tracked: ${f}`); hits++; }
}
if (hits) { console.error(`\n${hits} problem(s) found. Do not push.`); process.exit(1); }
console.log(`OK: checked ${files.length} files against ${needles.length} private phrases - no criteria text found.`);
