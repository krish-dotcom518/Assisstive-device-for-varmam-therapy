import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { CalendarDays, Clock, Hash, HeartPulse, User, Users } from "lucide-react";
import { StepShell } from "@/components/StepShell";
import { Field, SelectField } from "@/components/Field";
import { WizardNav } from "@/components/WizardNav";
import { useWizard } from "@/lib/wizard-context";
import bg from "@/assets/clinic-bg.jpg";

export const Route = createFileRoute("/patient")({
  component: PatientPage,
  head: () => ({ meta: [{ title: "Patient Details — Varmam.Care" }] }),
});

function PatientPage() {
  const { data, update } = useWizard();
  const p = data.patient;

  useEffect(() => {
    const updateDateTime = () => {
      const now = new Date();
      const date = now.toISOString().slice(0, 10);
      const time = now.toTimeString().slice(0, 5);
      update("patient", { date, time });
    };

    updateDateTime();

    const interval = setInterval(updateDateTime, 60000);

    return () => clearInterval(interval);
  }, [update]);

  useEffect(() => {
    const fetchSession = async () => {
      if (!p.name.trim()) {
        update("patient", { session: "1" });
        return;
      }

      try {
        const res = await fetch(`http://localhost:5000/next-session/${encodeURIComponent(p.name)}`);
        const data = await res.json();

        update("patient", {
          session: String(data.nextSession || 1)
        });
      } catch {
        update("patient", { session: "1" });
      }
    };

    const timeout = setTimeout(fetchSession, 500);

    return () => clearTimeout(timeout);
  }, [p.name]);

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (p.age && (!/^\d+$/.test(p.age) || +p.age <= 0 || +p.age > 130)) e.age = "Enter valid age";
    return e;
  }, [p]);

  const valid =
    p.name.trim().length > 1 &&
    p.age && !errors.age &&
    p.gender && p.disease.trim() && p.session;

  return (
    <StepShell>
      <div className="relative overflow-hidden rounded-3xl">
        <img src={bg} alt="" className="absolute inset-0 h-full w-full object-cover opacity-35" width={1280} height={896} loading="lazy" />
        <div className="absolute inset-0 bg-gradient-to-br from-background/70 via-background/85 to-background" />
        <div className="relative z-10 grid gap-8 p-8 lg:grid-cols-[1fr_2fr] lg:p-10">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Step 02</div>
            <h2 className="mt-1 font-display text-3xl font-semibold text-foreground">Patient Intake</h2>
            <p className="mt-3 max-w-sm text-sm text-muted-foreground">
              Capture demographic details and the witnessed condition to tailor the Varmam protocol.
            </p>
            <div className="mt-8 space-y-3">
              {[
                { i: HeartPulse, t: "Vitals captured automatically", s: "Synced from connected sensors" },
                { i: CalendarDays, t: "Auto-stamped session metadata", s: "Date and time captured at intake" },
                { i: Users, t: "Multi-session continuity", s: "Linked to patient history" },
              ].map(({ i: Icon, t, s }) => (
                <div key={t} className="flex items-start gap-3 rounded-2xl border border-border/60 bg-card/70 p-4 backdrop-blur">
                  <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-foreground">{t}</div>
                    <div className="text-xs text-muted-foreground">{s}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-card rounded-3xl p-8 sm:p-10">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                label="Patient Name"
                icon={<User className="h-4 w-4" />}
                placeholder="Meera Krishnan"
                value={p.name}
                onChange={(e) => update("patient", { name: e.target.value })}
              />
              <Field
                label="Age"
                icon={<Hash className="h-4 w-4" />}
                type="number"
                placeholder="34"
                value={p.age}
                onChange={(e) => update("patient", { age: e.target.value })}
                error={errors.age}
              />
              <SelectField
                label="Gender"
                icon={<Users className="h-4 w-4" />}
                value={p.gender}
                onChange={(e) => update("patient", { gender: e.target.value })}
              >
                <option value="">Select gender</option>
                <option>Female</option>
                <option>Male</option>
                <option>Non-binary</option>
                <option>Prefer not to say</option>
              </SelectField>
              <Field
                label="Session Number"
                icon={<Hash className="h-4 w-4" />}
                type="number"
                min={1}
                value={p.session}
                disabled
                readOnly
                hint="Auto-generated based on previous sessions"
              />
              <div className="sm:col-span-2">
                <Field
                  label="Disease Witnessed"
                  icon={<HeartPulse className="h-4 w-4" />}
                  placeholder="Chronic lower back pain, sciatic nerve compression…"
                  value={p.disease}
                  onChange={(e) => update("patient", { disease: e.target.value })}
                />
              </div>
              <Field
                label="Visit Date"
                icon={<CalendarDays className="h-4 w-4" />}
                type="date"
                value={p.date}
                disabled
                readOnly
                hint="Auto-updated every minute"
              />
              <Field
                label="Visit Time"
                icon={<Clock className="h-4 w-4" />}
                type="time"
                value={p.time}
                disabled
                readOnly
                hint="Auto-updated every minute"
              />
            </div>

            <WizardNav prev={{ to: "/doctor" }} next={{ to: "/therapy", disabled: !valid }} />
          </div>
        </div>
      </div>
    </StepShell>
  );
}
