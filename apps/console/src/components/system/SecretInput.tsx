import { forwardRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import {
  RiEyeLine as Eye,
  RiEyeOffLine as EyeOff,
} from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  /** Accessible label announced to screen readers (also used by the reveal toggle). */
  "aria-label": string;
  /** Rendered alongside the input, outside of it, so value attributes stay clean. */
  trailing?: ReactNode;
};

/**
 * Credential input (SSH keys, TOTP codes, tokens): masked by default with a
 * keyboard-accessible reveal toggle. Values live in component state only —
 * callers must send them in request bodies, never in URLs or query keys.
 */
export const SecretInput = forwardRef<HTMLInputElement, Props>(function SecretInput(
  { className, "aria-label": ariaLabel, trailing, ...props },
  ref,
) {
  const [visible, setVisible] = useState(false);
  return (
    <span className={className ?? "inline-flex items-center gap-1.5"}>
      <Input
        ref={ref}
        type={visible ? "text" : "password"}
        aria-label={ariaLabel}
        autoComplete="off"
        spellCheck={false}
        {...props}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="shrink-0 px-2"
        aria-label={visible ? `Hide ${ariaLabel}` : `Show ${ariaLabel}`}
        aria-pressed={visible}
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </Button>
      {trailing}
    </span>
  );
});
