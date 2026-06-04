import { motion } from "framer-motion";
import { Link, useRouterState } from "@tanstack/react-router";
import { Activity, Stethoscope, UserRound, Waves, LineChart } from "lucide-react";
import { ReactNode } from "react";

const STEPS = [
  { path: "/doctor", label: "Doctor", icon: Stethoscope, n: 1 },
  { path: "/patient", label: "Patient", icon: UserRound, n: 2 },
  { path: "/therapy", label: "Therapy", icon: Waves, n: 3 },
  { path: "/dashboard", label: "Monitoring", icon: LineChart, n: 4 },
];

function Particles() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: 18 }).map((_, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-primary-glow/40 blur-[2px] animate-float"
          style={{
            width: `${4 + (i % 4) * 3}px`,
            height: `${4 + (i % 4) * 3}px`,
            top: `${(i * 53) % 100}%`,
            left: `${(i * 37) % 100}%`,
            animationDelay: `${(i % 6) * 0.7}s`,
            animationDuration: `${6 + (i % 5)}s`,
          }}
        />
      ))}
    </div>
  );
}

export function StepShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const currentStep = STEPS.find((s) => path.startsWith(s.path))?.n ?? 1;

  return (
    <div className="relative min-h-screen overflow-hidden bg-background gradient-mesh-bg">
      <Particles />
      {/* Soft glow blobs */}
      <div className="pointer-events-none absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full bg-primary-glow/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-[600px] w-[600px] rounded-full bg-primary/20 blur-3xl" />

      {/* Top bar */}
      <header className="sticky top-0 z-30 glass-panel border-b border-border/60">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/doctor" className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl gradient-primary text-primary-foreground shadow-glow">
              <Activity className="h-5 w-5" strokeWidth={2.5} />
            </div>
            <div className="leading-tight">
              <div className="font-display text-lg font-semibold text-foreground">Varmam<span className="text-primary-glow">.</span>Care</div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Therapy Monitoring Suite</div>
            </div>
          </Link>
          <div className="hidden items-center gap-2 rounded-full border border-border/60 bg-card/60 px-4 py-1.5 text-xs text-muted-foreground md:flex">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-glow opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary-glow" />
            </span>
            System Online · v3.2.1
          </div>
        </div>

        {/* Stepper */}
        <div className="mx-auto max-w-7xl px-6 pb-5">
          <div className="flex items-center gap-2 sm:gap-4">
            {STEPS.map((s, i) => {
              const active = currentStep === s.n;
              const done = currentStep > s.n;
              const Icon = s.icon;
              return (
                <div key={s.path} className="flex flex-1 items-center gap-2 sm:gap-4">
                  <div className="flex items-center gap-2">
                    <motion.div
                      initial={false}
                      animate={{ scale: active ? 1.05 : 1 }}
                      className={`relative grid h-10 w-10 place-items-center rounded-full border-2 text-sm font-semibold transition-colors ${
                        active
                          ? "border-primary bg-primary text-primary-foreground shadow-glow"
                          : done
                          ? "border-primary-glow bg-primary-glow/20 text-primary"
                          : "border-border bg-card text-muted-foreground"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {active && <span className="absolute inset-0 rounded-full pulse-ring" />}
                    </motion.div>
                    <div className="hidden sm:block">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Step 0{s.n}</div>
                      <div className={`text-sm font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}>{s.label}</div>
                    </div>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-border/70">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: done ? "100%" : active ? "50%" : "0%" }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                        className="h-full gradient-primary"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </header>

      <motion.main
        key={path}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="relative z-10 mx-auto max-w-7xl px-6 py-10"
      >
        {children}
      </motion.main>
    </div>
  );
}
