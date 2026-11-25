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

/**
 * Filas → CSV (RFC 4180) con BOM, para que Excel abra bien los acentos. Las
 * celdas que empiezan con `= + - @` se neutralizan: vienen de un padrón ajeno y
 * una hoja de cálculo las ejecutaría como fórmula.
 */
export function toCsv(rows: string[][]): string {
  const cell = (value: string) => {
    const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return `\uFEFF${rows.map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;
}

/** Dispara la descarga del CSV en el navegador. */
export function downloadCsv(fileName: string, rows: string[][]): void {
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
