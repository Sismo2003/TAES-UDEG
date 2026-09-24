/**
 * Parser CSV mínimo (RFC 4180) — sin dependencias.
 *
 * Soporta: campos entre comillas, comillas escapadas (`""`), comas y saltos de
 * línea dentro de comillas, CRLF/LF y BOM al inicio. Suficiente para el export
 * de padrón de Control Escolar; no pretende cubrir dialectos exóticos.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;

  if (text.charCodeAt(0) === 0xfeff) i = 1; // BOM

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      pushField();
    } else if (ch === '\n') {
      pushRow();
    } else if (ch === '\r') {
      if (text[i + 1] === '\n') i++;
      pushRow();
    } else {
      field += ch;
    }
  }

  if (field !== '' || row.length > 0) pushRow();

  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}
