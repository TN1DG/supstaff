/**
 * One CSV cell: quoted when needed, and with spreadsheet formulas neutralised.
 * Exported fields include free text typed by staff (handover narratives,
 * refusal notes, report titles), so a leading `=`/`+`/`-`/`@`/tab/CR must not
 * run as a formula when a manager opens the file in Excel (CSV injection).
 */
export function csvCell(value: unknown): string {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One CSV line. */
export function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(",");
}
