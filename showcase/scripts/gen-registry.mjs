// Παράγει:
//  - src/demos/registry.generated.ts: import κάθε src/demos/<slug>/demo.ts (ο Builder δεν αγγίζει κοινά αρχεία)
//  - src/demos/catalog.generated.json: ονόματα κλάδων/υπηρεσιών από το ../config/matrix.yaml
// Τρέχει πριν από dev, build και typecheck.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const demosDir = path.join(root, 'src', 'demos');

const slugs = fs
  .readdirSync(demosDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && /^[a-z0-9-]+$/.test(d.name) && fs.existsSync(path.join(demosDir, d.name, 'demo.ts')))
  .map((d) => d.name)
  .sort();

const ident = (s) => `demo_${s.replace(/-/g, '_')}`;
const registry = [
  '// ΠΑΡΑΓΕΤΑΙ ΑΥΤΟΜΑΤΑ από scripts/gen-registry.mjs. Μην το επεξεργάζεσαι.',
  "import type { DemoConfig } from '@/lib/demo-types';",
  ...slugs.map((s) => `import { demo as ${ident(s)} } from './${s}/demo';`),
  '',
  `export const DEMOS: DemoConfig[] = [${slugs.map(ident).join(', ')}];`,
  '',
].join('\n');
writeIfChanged(path.join(demosDir, 'registry.generated.ts'), registry);

const matrixFile = path.join(root, '..', 'config', 'matrix.yaml');
if (fs.existsSync(matrixFile)) {
  const m = parse(fs.readFileSync(matrixFile, 'utf8'));
  const catalog = {
    verticals: m.verticals.map((v) => ({ id: v.id, name: v.name })),
    services: m.services.map((s) => ({ id: s.id, short: s.short, name: s.name })),
  };
  writeIfChanged(path.join(demosDir, 'catalog.generated.json'), `${JSON.stringify(catalog, null, 2)}\n`);
}

console.log(`registry: ${slugs.length} demos (${slugs.join(', ') || '—'})`);

function writeIfChanged(file, content) {
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === content) return;
  fs.writeFileSync(file, content);
}
