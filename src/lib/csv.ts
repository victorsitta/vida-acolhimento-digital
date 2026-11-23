const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

/** Baixa uma tabela como CSV (abre certo no Excel, com acentos). */
export function downloadCsv(filename: string, headers: string[], rows: Array<Array<unknown>>) {
  const body = [headers.map(cell).join(","), ...rows.map((r) => r.map(cell).join(","))].join("\n");
  const blob = new Blob(["﻿" + body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
