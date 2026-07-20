import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';

type Variant = 'primary' | 'ghost' | 'danger';

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-accent/90 hover:bg-accent text-bg font-bold border border-transparent',
  ghost:
    'bg-surface-3 hover:brightness-110 text-text border border-border/80 shadow-sm',
  danger:
    'bg-transparent hover:bg-danger/15 text-danger border border-danger/50',
};

export function Button({
  variant = 'ghost',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`rounded-md px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variantClasses[variant]} ${className}`}
      {...props}
    />
  );
}

export function TextInput({
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`rounded-md border border-border bg-surface-2 px-3 py-1.5 text-text placeholder:text-text-muted focus:border-accent focus:outline-none ${className}`}
      {...props}
    />
  );
}

export function Select({
  className = '',
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`rounded-md border border-border bg-surface-2 px-3 py-1.5 text-text focus:border-accent focus:outline-none ${className}`}
      {...props}
    />
  );
}

export function Checkbox({
  label,
  checked,
  onChange,
}: {
  label?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-accent"
      />
      {label && <span>{label}</span>}
    </label>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-text-muted">{label}</span>
      {children}
    </label>
  );
}

/** Hinweis-/Fehlerbanner. */
export function Banner({
  kind,
  children,
  onClose,
}: {
  kind: 'error' | 'success';
  children: ReactNode;
  onClose?: () => void;
}) {
  const tone =
    kind === 'error'
      ? 'border-danger/50 bg-danger/10 text-danger'
      : 'border-success/50 bg-success/10 text-success';
  return (
    <div
      className={`flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm ${tone}`}
      role={kind === 'error' ? 'alert' : 'status'}
    >
      <span>{children}</span>
      {onClose && (
        <button
          onClick={onClose}
          className="text-current opacity-70 hover:opacity-100"
          aria-label="Schließen"
        >
          ×
        </button>
      )}
    </div>
  );
}

export function Card({
  title,
  children,
  actions,
}: {
  title?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-surface p-5">
      {(title || actions) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-lg font-bold">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}
