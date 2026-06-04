import { createFileRoute } from "@tanstack/react-router";
import { Stethoscope, BadgeCheck, GraduationCap, User } from "lucide-react";
import { useMemo } from "react";
import { StepShell } from "@/components/StepShell";
import { Field } from "@/components/Field";
import { WizardNav } from "@/components/WizardNav";
import { useWizard } from "@/lib/wizard-context";
import roomImg from "@/assets/therapy-room.jpg";

export const Route = createFileRoute("/doctor")({
  component: DoctorPage,
  head: () => ({ meta: [{ title: "Doctor Details — Varmam.Care" }] }),
});

function DoctorPage() {
  const { data, update } = useWizard();
  const d = data.doctor;

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (d.name && !/^[A-Za-z .'-]+$/.test(d.name)) e.name = "Letters only";
    return e;
  }, [d]);

  const valid = d.name.trim().length > 1 && !errors.name && d.experience.trim() && d.designation.trim();

  return (
    <StepShell>
      <div className="grid items-stretch gap-8 lg:grid-cols-[1.05fr_1fr]">
        {/* Hero / illustration */}
        <div className="relative overflow-hidden rounded-3xl shadow-elevated">
          <img src={roomImg} alt="Varmam therapy treatment room" className="absolute inset-0 h-full w-full object-cover" width={1280} height={1280} />
          <div className="absolute inset-0 bg-gradient-to-br from-primary-deep/85 via-primary/55 to-primary-glow/30" />
          <div className="relative z-10 flex h-full min-h-[520px] flex-col justify-between p-8 text-primary-foreground sm:p-10">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em] backdrop-blur">
                <Stethoscope className="h-3.5 w-3.5" /> Practitioner Onboarding
              </span>
              <h1 className="mt-6 font-display text-4xl font-semibold leading-tight sm:text-5xl">
                Begin a precise<br /> Varmam therapy session.
              </h1>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-white/85">
                Enter your credentials to initialize the device and unlock the live monitoring suite. Your profile is stored locally with your patient session.
              </p>
            </div>
            <div className="mt-10 grid grid-cols-3 gap-3">
              {[
                { k: "ISO", v: "13485" },
                { k: "HIPAA", v: "Compliant" },
                { k: "Latency", v: "<40ms" },
              ].map((s) => (
                <div key={s.k} className="rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur-md">
                  <div className="text-[10px] uppercase tracking-widest text-white/70">{s.k}</div>
                  <div className="mt-1 font-display text-base font-semibold">{s.v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Form card */}
        <div className="glass-card rounded-3xl p-8 sm:p-10">
          <div className="mb-6">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Step 01</div>
            <h2 className="mt-1 font-display text-3xl font-semibold text-foreground">Doctor Details</h2>
            <p className="mt-2 text-sm text-muted-foreground">Identify the practicing therapist for this session record.</p>
          </div>

          <div className="space-y-5">
            <Field
              label="Doctor Name"
              icon={<User className="h-4 w-4" />}
              placeholder="Dr. Aravind Subramanian"
              value={d.name}
              onChange={(e) => update("doctor", { name: e.target.value })}
              error={errors.name}
            />
            <Field
              label="Years of Experience"
              icon={<GraduationCap className="h-4 w-4" />}
              type="number"
              min={0}
              placeholder="12"
              value={d.experience}
              onChange={(e) => update("doctor", { experience: e.target.value })}
            />
            <Field
              label="Designation"
              icon={<BadgeCheck className="h-4 w-4" />}
              placeholder="Senior Varmam Therapist"
              value={d.designation}
              onChange={(e) => update("doctor", { designation: e.target.value })}
            />
          </div>

          <WizardNav next={{ to: "/patient", disabled: !valid }} />
        </div>
      </div>
    </StepShell>
  );
}
