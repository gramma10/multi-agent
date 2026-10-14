// Σημείο εισόδου: κρύβει μόνο το ExperimentalWarning του node:sqlite (σταθερό για τη χρήση μας)
// και μετά φορτώνει το CLI. Όλα τα άλλα warnings εμφανίζονται κανονικά.
const original = process.emitWarning.bind(process);
process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
  const msg = typeof warning === 'string' ? warning : warning.message;
  if (/SQLite is an experimental feature/.test(msg)) return;
  return (original as (...a: unknown[]) => void)(warning, ...rest);
}) as typeof process.emitWarning;

await import('./cli.ts');
