// Μικρός glob matcher για write scopes: `**` = οποιοδήποτε βάθος, `*` = μέσα σε ένα επίπεδο.
// Δεν χρειαζόμαστε περισσότερα (brace expansion, classes) και δεν θέλουμε εξάρτηση γι' αυτό.

const cache = new Map<string, RegExp>();

export function globToRegExp(glob: string): RegExp {
  const cached = cache.get(glob);
  if (cached) return cached;
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i]!;
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        // `**/` ταιριάζει και σε μηδέν φακέλους
        if (glob[i + 2] === '/') {
          re += '(?:.*/)?';
          i += 2;
        } else {
          re += '.*';
          i += 1;
        }
      } else {
        re += '[^/]*';
      }
    } else if (ch === '?') {
      re += '[^/]';
    } else {
      re += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  const compiled = new RegExp(`^${re}$`);
  cache.set(glob, compiled);
  return compiled;
}

export function matchesAny(relPath: string, globs: readonly string[]): boolean {
  const p = relPath.split('\\').join('/');
  return globs.some((g) => globToRegExp(g).test(p));
}
