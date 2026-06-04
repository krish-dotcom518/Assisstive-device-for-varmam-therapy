import { InputHTMLAttributes, SelectHTMLAttributes, forwardRef, ReactNode } from "react";

type FieldProps = {
  label: string;
  icon?: ReactNode;
  error?: string;
  hint?: string;
};

export const Field = forwardRef<HTMLInputElement, FieldProps & InputHTMLAttributes<HTMLInputElement>>(
  ({ label, icon, error, hint, className, ...rest }, ref) => (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="group relative">
        {icon && (
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary">
            {icon}
          </span>
        )}
        <input
          ref={ref}
          {...rest}
          className={`w-full rounded-xl border bg-card/80 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 transition-all outline-none backdrop-blur-sm
            ${icon ? "pl-10" : ""}
            ${error ? "border-destructive focus:ring-2 focus:ring-destructive/30" : "border-border focus:border-primary focus:ring-4 focus:ring-primary/15"}
            ${className ?? ""}`}
        />
      </div>
      {error ? (
        <span className="mt-1 block text-xs text-destructive">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>
      ) : null}
    </label>
  ),
);
Field.displayName = "Field";

type SelectProps = FieldProps & SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode };
export function SelectField({ label, icon, error, children, className, ...rest }: SelectProps) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="group relative">
        {icon && (
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary">
            {icon}
          </span>
        )}
        <select
          {...rest}
          className={`w-full appearance-none rounded-xl border bg-card/80 px-4 py-3 text-sm text-foreground transition-all outline-none backdrop-blur-sm
            ${icon ? "pl-10" : ""}
            ${error ? "border-destructive" : "border-border focus:border-primary focus:ring-4 focus:ring-primary/15"}
            ${className ?? ""}`}
        >
          {children}
        </select>
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground">▾</span>
      </div>
      {error && <span className="mt-1 block text-xs text-destructive">{error}</span>}
    </label>
  );
}
