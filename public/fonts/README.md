# Schriftart: Atkinson Hyperlegible (lokal gebündelt)

Gemäß CLAUDE.md werden **keine** externen Fonts/CDNs genutzt. Die Schrift
Atkinson Hyperlegible (frei, vom Braille Institute) ist hier lokal mit
ausgeliefert und wird per `@font-face` in `src/index.css` eingebunden.

Vorhandene Dateien (latin-Subset, deckt Umlaute und ß ab):

- `AtkinsonHyperlegible-Regular.woff2` (400 normal)
- `AtkinsonHyperlegible-Italic.woff2` (400 italic)
- `AtkinsonHyperlegible-Bold.woff2` (700 normal)
- `AtkinsonHyperlegible-BoldItalic.woff2` (700 italic)
- `LICENSE` – Lizenztext der Schrift

Herkunft: einmalig aus dem `@fontsource/atkinson-hyperlegible`-Paket extrahiert
(nur die Binärdateien lokal abgelegt – **kein** Laufzeit-CDN, keine
Projekt-Abhängigkeit). Zum Aktualisieren die `.woff2` einfach ersetzen.
