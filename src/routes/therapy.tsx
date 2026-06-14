import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Bluetooth, Cable, CheckCircle2, Loader2, Wifi, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { StepShell } from "@/components/StepShell";
import { Field, SelectField } from "@/components/Field";
import { WizardNav } from "@/components/WizardNav";
import { useWizard } from "@/lib/wizard-context";
import device from "@/assets/esp32-device.png";
import body from "@/assets/varmam-points.png";
import { VARMAM_POINTS } from "@/data/varmamPoints";

export const Route = createFileRoute("/therapy")({
  component: TherapyPage,
  head: () => ({ meta: [{ title: "Therapy Details — Varmam.Care" }] }),
});

const MODES = [
  { id: "USB Cable", icon: Cable, sub: "Wired · 480 Mbps" },
  { id: "WiFi", icon: Wifi, sub: "2.4GHz · Stable" },
  { id: "Bluetooth", icon: Bluetooth, sub: "BLE 5.2 · Low-Latency" },
] as const;

function TherapyPage() {
  const { data, update } = useWizard();
  const t = data.therapy;
  const [connecting, setConnecting] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const selectedPoint = VARMAM_POINTS.find((p)=>p.pointName===t.point);
  const filteredPoints = VARMAM_POINTS;
  useEffect(() => {
    if (t.connectivity) setConnected(true);
  }, [t.connectivity]);

  const valid = useMemo(() => t.point && t.technique && t.connectivity && connected, [t, connected]);

  useEffect(() => {
  if (selectedPoint) {
    update("therapy", {
      technique: selectedPoint.techniques.join(", "),
    });
  }
}, [t.point]);

  const pickMode = (mode: typeof MODES[number]["id"]) => {
    setConnecting(mode);
    setConnected(false);
    update("therapy", { connectivity: mode });
    setTimeout(() => {
      setConnecting(null);
      setConnected(true);
    }, 1400);
  };

  return (
    <StepShell>
      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div className="glass-card rounded-3xl p-8 sm:p-10">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Step 03</div>
          <h2 className="mt-1 font-display text-3xl font-semibold text-foreground">Therapy Configuration</h2>
          <p className="mt-2 text-sm text-muted-foreground">Select the Varmam point, technique and pair the ESP32 sensor device.</p>

          <div className="mt-8 space-y-5">
            <SelectField label="Varmam Point" value={t.point} onChange={(e) => update("therapy", { point: e.target.value })}>
              <option value="">Select point</option>
              {filteredPoints.map((p) => <option key={p.id} value={p.pointName}>{p.id}. {p.pointName} ({p.bodyRegion})</option>)}
            </SelectField>
            {selectedPoint && (
  <div className="rounded-2xl border border-border bg-secondary/40 p-4">
    <div className="mb-3 flex items-center justify-between">
      <h3 className="font-semibold">Varmam Teachniques applied</h3>

      <span className="rounded-full bg-primary/10 px-3 py-1 text-xs text-primary">
        {selectedPoint.techniques.length} Techniques
      </span>
    </div>

    <div className="space-y-2">
      {selectedPoint.techniques.map((tech, idx) => (
        <div
          key={idx}
          className="flex items-center rounded-xl bg-background p-3"
        >
          <span>{tech}</span>
        </div>
      ))}
    </div>
  </div>
)}
          </div>

          <div className="mt-8">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-foreground">Connectivity Mode</h3>
              {connected && t.connectivity && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-3 py-1 text-xs font-medium text-success">
                  <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" /> Device Linked
                </span>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {MODES.map((m) => {
                const Icon = m.icon;
                const active = t.connectivity === m.id;
                const isConnecting = connecting === m.id;
                return (
                  <motion.button
                    key={m.id}
                    type="button"
                    whileHover={{ y: -2 }}
                    onClick={() => pickMode(m.id)}
                    className={`relative overflow-hidden rounded-2xl border p-5 text-left transition ${
                      active ? "border-primary bg-primary/5 shadow-glow" : "border-border bg-card/70 hover:border-primary/40"
                    }`}
                  >
                    <div className={`grid h-10 w-10 place-items-center rounded-xl ${active ? "gradient-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="mt-3 font-display text-sm font-semibold text-foreground">{m.id}</div>
                    <div className="text-xs text-muted-foreground">{m.sub}</div>
                    <div className="mt-3 flex items-center gap-1.5 text-[11px] font-medium">
                      {isConnecting ? (
                        <><Loader2 className="h-3 w-3 animate-spin text-primary" /> <span className="text-primary">Pairing…</span></>
                      ) : active ? (
                        <><CheckCircle2 className="h-3 w-3 text-success" /> <span className="text-success">Connected</span></>
                      ) : (
                        <><span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" /> <span className="text-muted-foreground">Idle</span></>
                      )}
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </div>

          <WizardNav prev={{ to: "/patient" }} next={{ to: "/dashboard", label: "Begin Monitoring", disabled: !valid }} />
        </div>

        <div className="space-y-6">
          <div className="glass-card relative overflow-hidden rounded-3xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Hardware</div>
                <div className="font-display text-lg font-semibold text-foreground">VARMAM-ESP32 v3</div>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-primary">
                <Zap className="h-3 w-3" /> 8×8 Matrix
              </span>
            </div>
            <div className="relative mt-4 flex items-center justify-center">
              <div className="absolute h-44 w-44 rounded-full bg-primary-glow/30 blur-3xl" />
              <motion.img
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                src={device}
                alt="ESP32 sensor device"
                className="relative h-44 w-auto drop-shadow-2xl"
                width={1024}
                height={1024}
                loading="lazy"
              />
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              {[
                { k: "Battery", v: "92%" },
                { k: "Firmware", v: "v3.2.1" },
                { k: "Sensors", v: "64" },
              ].map((s) => (
                <div key={s.k} className="rounded-xl bg-secondary/60 px-2 py-2">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{s.k}</div>
                  <div className="font-display text-sm font-semibold text-foreground">{s.v}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-card relative overflow-hidden rounded-3xl p-6">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Body Mapping</div>
            <div className="font-display text-lg font-semibold text-foreground">Varmam Pressure Points</div>
            <div className="relative mt-2 flex justify-center">
              <img src={body} alt="Anatomical Varmam pressure points" className="h-64 w-auto" width={768} height={1024} loading="lazy" />
            </div>
          </div>
        </div>
      </div>
    </StepShell>
  );
}