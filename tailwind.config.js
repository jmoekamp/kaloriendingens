/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Farbpalette aus CLAUDE.md (c0t0d0s0-Stil). Werte sind als CSS-Variablen
      // in src/index.css definiert, damit sie zentral anpassbar bleiben.
      // rgb(... / <alpha-value>) statt blankem var(), damit Transparenz-Modifier
      // wie bg-accent/90 oder border-border/50 funktionieren. Die Variablen in
      // src/index.css sind dafuer als RGB-Kanaltripel hinterlegt.
      colors: {
        bg: 'rgb(var(--color-bg) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--color-surface-2) / <alpha-value>)',
        'surface-3': 'rgb(var(--color-surface-3) / <alpha-value>)',
        border: 'rgb(var(--color-border) / <alpha-value>)',
        text: 'rgb(var(--color-text) / <alpha-value>)',
        'text-muted': 'rgb(var(--color-text-muted) / <alpha-value>)',
        accent: 'rgb(var(--color-accent) / <alpha-value>)',
        success: 'rgb(var(--color-success) / <alpha-value>)',
        warning: 'rgb(var(--color-warning) / <alpha-value>)',
        danger: 'rgb(var(--color-danger) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Atkinson Hyperlegible', 'system-ui', 'sans-serif'],
        mono: ['Atkinson Hyperlegible Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
