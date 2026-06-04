import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

type Props = {
  prev?: { to: string; label?: string };
  next?: { to: string; label?: string; disabled?: boolean; onClick?: () => void };
};

export function WizardNav({ prev, next }: Props) {
  return (
    <div className="mt-10 flex items-center justify-between gap-4">
      {prev ? (
        <Link
          to={prev.to}
          className="group inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-5 py-2.5 text-sm font-medium text-foreground transition hover:border-primary hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          {prev.label ?? "Previous"}
        </Link>
      ) : <span />}

      {next && (
        <motion.div whileHover={!next.disabled ? { scale: 1.02 } : {}} whileTap={!next.disabled ? { scale: 0.98 } : {}}>
          {next.disabled ? (
            <button
              disabled
              className="inline-flex cursor-not-allowed items-center gap-2 rounded-full bg-muted px-7 py-3 text-sm font-semibold text-muted-foreground"
            >
              {next.label ?? "Continue"}
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <Link
              to={next.to}
              onClick={next.onClick}
              className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full gradient-primary px-7 py-3 text-sm font-semibold text-primary-foreground shadow-glow transition"
            >
              <span className="relative z-10">{next.label ?? "Continue"}</span>
              <ArrowRight className="relative z-10 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
            </Link>
          )}
        </motion.div>
      )}
    </div>
  );
}
