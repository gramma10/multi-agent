/** Ελάχιστος parser CSV (RFC 4180): εισαγωγικά, "" μέσα σε εισαγωγικά, νέες γραμμές μέσα σε πεδία, BOM, ; ή ,. */
export function parseCsv(text: string): Array<Record<string, string>> {
  const src = text.replace(/^\uFEFF/, '');
  const firstLine = src.slice(0, src.search(/\r?\n|$/));
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === sep) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((r) => r.some((c) => c.trim() !== ''));
  if (!header) return [];
  const keys = header.map((h) => h.trim());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

/** Η πρώτη στήλη που υπάρχει από μια λίστα συνωνύμων (χωρίς διάκριση πεζών/κεφαλαίων, _ και κενών). */
export function pick(row: Record<string, string>, aliases: string[]): string {
  const norm = (s: string) => s.toLowerCase().replace(/[\s_-]/g, '');
  const wanted = aliases.map(norm);
  for (const [k, v] of Object.entries(row)) if (wanted.includes(norm(k)) && v !== '') return v;
  return '';
}
