import { forwardRef, useState, type ComponentProps } from "react";
import { Check, Eye, EyeOff, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const base =
  "flex h-11 w-full rounded-xl border border-input bg-background/70 pl-10 pr-3 text-base outline-none transition-all placeholder:text-muted-foreground hover:border-primary/40 focus:border-primary focus:bg-background focus:ring-4 focus:ring-primary/15 md:text-sm aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/15";

/** Campo com ícone à esquerda e marca de "ok" quando o valor está preenchido e válido. */
export const IconInput = forwardRef<
  HTMLInputElement,
  ComponentProps<"input"> & { icon: LucideIcon; valid?: boolean }
>(({ icon: Icon, valid, className, ...props }, ref) => (
  <div className="group relative">
    <Icon
      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary"
      aria-hidden="true"
    />
    <input ref={ref} className={cn(base, valid && "pr-9", className)} {...props} />
    {valid && (
      <Check
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-success"
        aria-hidden="true"
      />
    )}
  </div>
));
IconInput.displayName = "IconInput";

/** Mede a força da senha de 0 a 4. */
export function passwordStrength(pw: string) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw) || pw.length >= 12) score++;
  return score;
}

const LABELS = ["Muito fraca", "Fraca", "Razoável", "Boa", "Forte"];
const COLORS = ["bg-destructive", "bg-destructive", "bg-warning", "bg-success/80", "bg-success"];

/** Campo de senha com botão "mostrar" e (opcional) medidor de força. */
export const PasswordInput = forwardRef<
  HTMLInputElement,
  ComponentProps<"input"> & { meter?: boolean; value?: string }
>(({ meter, className, value, onChange, ...props }, ref) => {
  const [show, setShow] = useState(false);
  const [local, setLocal] = useState("");
  const pw = (value ?? local) as string;
  const score = passwordStrength(pw);
  return (
    <div>
      <div className="group relative">
        <input
          ref={ref}
          type={show ? "text" : "password"}
          className={cn(base, "pl-3 pr-11", className)}
          onChange={(e) => {
            setLocal(e.target.value);
            onChange?.(e);
          }}
          {...props}
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          aria-label={show ? "Ocultar senha" : "Mostrar senha"}
          className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {meter && pw.length > 0 && (
        <div className="mt-2" aria-live="polite">
          <div className="flex gap-1" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={cn("h-1.5 flex-1 rounded-full transition-all duration-300", i < score ? COLORS[score] : "bg-muted")}
              />
            ))}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Força da senha: <strong className="text-foreground">{LABELS[score]}</strong>
          </p>
        </div>
      )}
    </div>
  );
});
PasswordInput.displayName = "PasswordInput";
