/**
 * Text als Datei herunterladen – rein clientseitig (Blob + kurzlebiger
 * Object-URL an einem unsichtbaren Link). Kein Serverkontakt.
 */
export function ladeTextDatei(
  dateiname: string,
  text: string,
  mimetype = 'text/tab-separated-values;charset=utf-8',
): void {
  // BOM voranstellen, damit Excel/LibreOffice UTF-8 (Umlaute) korrekt lesen.
  const blob = new Blob(['﻿' + text], { type: mimetype });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = dateiname;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
