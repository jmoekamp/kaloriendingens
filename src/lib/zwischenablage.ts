/**
 * Text in die Zwischenablage kopieren. Die moderne Clipboard-API steht nur in
 * "secure contexts" (HTTPS oder localhost) zur Verfuegung – beim Zugriff per
 * HTTP ueber die LAN-IP ist navigator.clipboard undefined. Dann faellt die
 * Funktion auf das klassische execCommand('copy') mit unsichtbarer Textarea
 * zurueck.
 */
export async function kopiereText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  // Unsichtbar, aber selektierbar (display:none wuerde das Kopieren verhindern).
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  try {
    if (!document.execCommand('copy')) {
      throw new Error('Kopieren wird von diesem Browser nicht unterstützt.');
    }
  } finally {
    document.body.removeChild(ta);
  }
}
