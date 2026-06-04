import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity, AlertTriangle, BarChart3, Bell, CheckCircle2, ChevronLeft, FileText, Gauge,
  LayoutDashboard, Pause, Play, PlugZap, Settings, Square, TrendingUp, Cpu, Wifi, Bluetooth, Cable, Clock,
} from "lucide-react";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Area, AreaChart } from "recharts";
import { useWizard } from "@/lib/wizard-context";

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
  head: () => ({ meta: [{ title: "Live Monitoring — Varmam.Care" }] }),
});

// ── Backend URL ──────────────────────────────────────────────────────────────
const BACKEND_URL = "http://localhost:5000";

async function apiPost(path: string, body: object) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Server error: ${res.status}`);
  return res.json();
}

type Status = "idle" | "running" | "paused" | "ended";

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "sessions", label: "Sessions", icon: Clock },
  { id: "reports", label: "Reports", icon: FileText },
  { id: "device", label: "Device Status", icon: Cpu },
  { id: "settings", label: "Settings", icon: Settings },
];

function DashboardPage() {
  const { data, reset } = useWizard();
  const [status, setStatus] = useState<Status>("idle");
  const [matrix, setMatrix] = useState<number[][]>(() => Array.from({ length: 8 },()=>Array.from({length:8},()=>0)));
  const [series, setSeries] = useState<{ t: number; force: number }[]>([]);
  const [duration, setDuration] = useState(0);
  const tickRef = useRef(0);
  const [apiMsg, setApiMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // ── API Handlers ─────────────────────────────────────────────────────────
  async function handleStart() {
    try {
      await apiPost("/session-start", {
        doctorName: data.doctor.name,
        doctorExp: data.doctor.experience,
        designation: data.doctor.designation,
        patientName: data.patient.name,
        patientAge: Number(data.patient.age),
        gender: data.patient.gender,
        diseaseWitnessed: data.patient.disease,
        varmamPoint: data.therapy.point,
        varmamTechnique: data.therapy.technique,
        visitDate: data.patient.date,
        sessionNumber: Number(data.patient.session),
      });
      setStatus("running");
      setDuration(0);
      tickRef.current = 0;
      setApiMsg({ text: "✅ Session started & recorded", ok: true });
    } catch (e) {
      setApiMsg({ text: "❌ Could not reach backend — is server running?", ok: false });
    }
    setTimeout(() => setApiMsg(null), 4000);
  }

  async function handleEnd() {
    try {
      await apiPost("/end-session", {});
      setStatus("ended");
      reset();
      setApiMsg({ text: "✅ Session updated in MongoDB Atlas", ok: true });
    } catch (e) {
      setApiMsg({ text: "❌ End-session failed — check backend", ok: false });
      setStatus("ended"); // still stop UI
    }
    setTimeout(() => setApiMsg(null), 5000);
  }

  // Live updates from ESP32 hardware only
  useEffect(() => {
    if (status !== "running") return;
    const interval = setInterval(async ()=>{
      try {
        const res = await fetch(`${BACKEND_URL}/live-data`);
        const sensor = await res.json();
        if(sensor.matrix) setMatrix(sensor.matrix);
        if(sensor.force){
          setSeries((prev)=>[...prev.slice(-29),{t:prev.length?prev[prev.length-1].t+1:0,force:sensor.force}]);
        }
      } catch(e) {
        console.log("Waiting for ESP32 hardware data...");
      }
      setDuration((d)=>d+1);
    },1000);
    return ()=>clearInterval(interval);
  }, [status]);

  const flat = matrix.flat();
  const avg = +(flat.reduce((a, b) => a + b, 0) / flat.length).toFixed(1);
  const max = Math.max(...flat);
  const validation = avg < 35 ? "low" : avg > 75 ? "high" : "ok";

  const ConnIcon = data.therapy.connectivity === "WiFi" ? Wifi : data.therapy.connectivity === "Bluetooth" ? Bluetooth : Cable;

  return (
    <div className="flex min-h-screen bg-background gradient-mesh-bg">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-3 border-b border-sidebar-border px-6 py-5">
          <div className="grid h-9 w-9 place-items-center rounded-xl gradient-primary text-primary-foreground shadow-glow">
            <Activity className="h-4 w-4" strokeWidth={2.5} />
          </div>
          <div>
            <div className="font-display text-sm font-semibold">Varmam.Care</div>
            <div className="text-[10px] uppercase tracking-widest text-sidebar-foreground/60">Clinical Suite</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV.map((n) => {
            const Icon = n.icon;
            const active = n.id === "dashboard";
            return (
              <button
                key={n.id}
                className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-glow"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {n.label}
                {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-sidebar-primary-foreground" />}
              </button>
            );
          })}
        </nav>
        <div className="m-3 rounded-2xl border border-sidebar-border/80 bg-sidebar-accent/40 p-4">
          <div className="text-[10px] uppercase tracking-widest text-sidebar-foreground/70">Practitioner</div>
          <div className="mt-1 truncate font-display text-sm font-semibold">{data.doctor.name || "—"}</div>
          <div className="truncate text-[11px] text-sidebar-foreground/70">{data.doctor.designation || "—"}</div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-20 glass-panel border-b border-border/60">
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
            <div className="flex items-center gap-3">
              <Link to="/therapy" className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-card hover:border-primary hover:text-primary">
                <ChevronLeft className="h-4 w-4" />
              </Link>
              <div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Step 04 · Live Monitoring</div>
                <h1 className="font-display text-xl font-semibold text-foreground">
                  {data.patient.name || "Active Session"} · <span className="text-primary">{data.therapy.point || "Varmam Point"}</span>
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <StatusPill status={status} />
              <button className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground">
                <Bell className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 space-y-6 px-6 py-6">
          {/* Metric cards */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
            <Metric icon={Gauge} label="Average Force" value={`${avg}`} unit="N" trend="+2.4%" tone="primary" />
            <Metric icon={TrendingUp} label="Maximum Force" value={`${max}`} unit="N" trend="peak" tone="warning" />
            <Metric icon={ConnIcon} label="Connectivity" value={data.therapy.connectivity || "—"} unit="" trend="stable" tone="primary" />
            <Metric icon={CheckCircle2} label="Pressure" value={validation === "ok" ? "Optimal" : validation === "low" ? "Low" : "High"} unit="" trend={validation === "ok" ? "in range" : "alert"} tone={validation === "ok" ? "success" : "destructive"} />
            <Metric icon={Clock} label="Session" value={fmt(duration)} unit="" trend="elapsed" tone="primary" />
            <Metric icon={PlugZap} label="Device" value="Online" unit="" trend="92% bat" tone="success" />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
            {/* Pressure matrix */}
            <section className="glass-card rounded-3xl p-6">
              <CardHeader title="Live Pressure Matrix" sub="8 × 8 sensor grid · sampling @ 60Hz">
                <Legend />
              </CardHeader>
              <div className="mt-5 grid grid-cols-8 gap-1.5 sm:gap-2">
                {matrix.flatMap((row, r) =>
                  row.map((v, c) => (
                    <motion.div
                      key={`${r}-${c}`}
                      animate={{ backgroundColor: heatColor(v), scale: v > 80 ? 1.04 : 1 }}
                      transition={{ duration: 0.5 }}
                      className="aspect-square rounded-lg shadow-sm ring-1 ring-black/5"
                      style={{ backgroundColor: heatColor(v) }}
                    >
                      <div className="grid h-full place-items-center text-[9px] font-semibold text-white/90 mix-blend-overlay">
                        {Math.round(v)}
                      </div>
                    </motion.div>
                  )),
                )}
              </div>
            </section>

            {/* Force graph */}
            <section className="glass-card rounded-3xl p-6">
              <CardHeader title="Real-Time Force" sub="Newtons over time · 21 second window">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
                  <BarChart3 className="h-3 w-3" /> Live
                </span>
              </CardHeader>
              <div className="mt-5 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={series} margin={{ top: 10, right: 10, left: -16, bottom: 0 }}>
                    <defs>
                      <linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="oklch(0.55 0.18 150)" stopOpacity={0.6} />
                        <stop offset="100%" stopColor="oklch(0.55 0.18 150)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="oklch(0.9 0.03 150)" strokeDasharray="3 3" vertical={false} />
                    <XAxis label={{ value: "Time (seconds)", position: "insideBottom", offset: -5 }} dataKey="t" tick={{ fontSize: 10, fill: "oklch(0.5 0.04 155)" }} axisLine={false} tickLine={false} />
                    <YAxis label={{ value: "Pressure Force (N)", angle: -90, position: "insideLeft" }} tick={{ fontSize: 10, fill: "oklch(0.5 0.04 155)" }} axisLine={false} tickLine={false} domain={[0, 100]} />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, border: "1px solid oklch(0.9 0.03 150)", fontSize: 12, background: "white" }}
                      labelStyle={{ color: "oklch(0.5 0.04 155)" }}
                    />
                    <Area type="monotone" dataKey="force" stroke="oklch(0.45 0.14 150)" strokeWidth={2.5} fill="url(#g)" isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <MiniSpark data={series} />
            </section>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1fr_1.6fr]">
            {/* Validation alerts */}
            <section className="glass-card rounded-3xl p-6">
              <CardHeader title="Pressure Validation" sub="Real-time clinical thresholds" />
              <div className="mt-4 space-y-3">
                <AlertRow tone="success" icon={CheckCircle2} title="Correct Pressure" detail="Within 35–75 N optimal band" active={validation === "ok"} />
                <AlertRow tone="warning" icon={AlertTriangle} title="Low Pressure" detail="Therapist applying < 35 N" active={validation === "low"} />
                <AlertRow tone="destructive" icon={AlertTriangle} title="High Pressure" detail="Exceeds safe limit > 75 N" active={validation === "high"} />
              </div>
            </section>

            {/* Session controls */}
            <section className="glass-card rounded-3xl p-6">
              <CardHeader title="Session Controls" sub="Manage the active monitoring session" />
              <div className="mt-5 grid gap-3 sm:grid-cols-4">
                <ControlBtn icon={Play} label="Start" tone="primary" disabled={status === "running" || status === "ended"} onClick={handleStart} />
                <ControlBtn icon={Pause} label="Pause" tone="warning" disabled={status !== "running"} onClick={() => setStatus("paused")} />
                <ControlBtn icon={Play} label="Resume" tone="success" disabled={status !== "paused"} onClick={() => setStatus("running")} />
                <ControlBtn icon={Square} label="End" tone="destructive" disabled={status === "ended" || status === "idle"} onClick={handleEnd} />
              </div>
              <div className="mt-5 grid gap-3 rounded-2xl border border-border/70 bg-secondary/40 p-4 sm:grid-cols-3">
                <Info label="Patient" value={data.patient.name || "—"} />
                <Info label="Technique" value={data.therapy.technique || "—"} />
                <Info label="Session #" value={`#${data.patient.session || "—"}`} />
              </div>
            </section>
          </div>
        </main>
      </div>
      {/* API status toast */}
      {apiMsg && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-2xl px-5 py-3 text-sm font-medium shadow-lg transition-all ${
            apiMsg.ok ? "bg-green-600 text-white" : "bg-red-600 text-white"
          }`}
        >
          {apiMsg.text}
        </div>
      )}
    </div>
  );
}

/* ---------- helpers & sub components ---------- */


function clamp(n: number, a: number, b: number) { return Math.max(a, Math.min(b, n)); }

function heatColor(v: number) {
  if (v < 25) return "#2563eb";
  if (v < 50) return "#16a34a";
  if (v < 75) return "#eab308";
  return "#dc2626";
}

function fmt(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

function CardHeader({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="font-display text-base font-semibold text-foreground">{title}</h3>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

function Metric({
  icon: Icon, label, value, unit, trend, tone,
}: { icon: any; label: string; value: string; unit: string; trend: string; tone: "primary" | "success" | "warning" | "destructive" }) {
  const tones: Record<string, string> = {
    primary: "text-primary bg-primary/10",
    success: "text-success bg-success/15",
    warning: "text-warning bg-warning/15",
    destructive: "text-destructive bg-destructive/15",
  };
  return (
    <div className="glass-card rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <span className={`grid h-9 w-9 place-items-center rounded-xl ${tones[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{trend}</span>
      </div>
      <div className="mt-3 text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-display text-2xl font-semibold text-foreground">
        {value} <span className="text-sm font-medium text-muted-foreground">{unit}</span>
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
      <span className="h-2 w-6 rounded-full" style={{ background: "linear-gradient(90deg, oklch(0.86 0.16 150), oklch(0.78 0.17 105), oklch(0.65 0.22 28))" }} />
      Blue Low · Green Moderate · Yellow High · Red Very High
    </div>
  );
}

function AlertRow({ tone, icon: Icon, title, detail, active }: { tone: "success" | "warning" | "destructive"; icon: any; title: string; detail: string; active: boolean }) {
  const tones = {
    success: "border-success/40 bg-success/5 text-success",
    warning: "border-warning/40 bg-warning/10 text-warning",
    destructive: "border-destructive/40 bg-destructive/10 text-destructive",
  } as const;
  return (
    <div className={`relative flex items-start gap-3 rounded-2xl border p-3.5 ${tones[tone]}`}>
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/60">
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <div className="text-xs text-muted-foreground">{detail}</div>
      </div>
      <AnimatePresence>
        {active && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            className="relative flex h-2.5 w-2.5"
          >
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ backgroundColor: "currentColor" }} />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "currentColor" }} />
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

function ControlBtn({ icon: Icon, label, tone, disabled, onClick }: { icon: any; label: string; tone: "primary" | "warning" | "success" | "destructive"; disabled?: boolean; onClick?: () => void }) {
  const tones: Record<string, string> = {
    primary: "gradient-primary text-primary-foreground shadow-glow",
    success: "bg-success text-primary-foreground",
    warning: "bg-warning text-primary-deep",
    destructive: "bg-destructive text-destructive-foreground",
  };
  return (
    <motion.button
      whileHover={!disabled ? { y: -2 } : {}}
      whileTap={!disabled ? { scale: 0.97 } : {}}
      disabled={disabled}
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
        disabled ? "cursor-not-allowed bg-muted text-muted-foreground" : tones[tone]
      }`}
    >
      <Icon className="h-4 w-4" /> {label}
    </motion.button>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate font-display text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

function StatusPill({ status }: { status: Status }) {
  const map = {
    running: { c: "bg-success/15 text-success", t: "Live · Recording" },
    paused: { c: "bg-warning/20 text-warning", t: "Paused" },
    ended: { c: "bg-muted text-muted-foreground", t: "Session Ended" },
    idle: { c: "bg-muted text-muted-foreground", t: "Idle" },
  } as const;
  const s = map[status];
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ${s.c}`}>
      <span className="relative flex h-2 w-2">
        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${status === "running" ? "bg-success" : "bg-current"}`} />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
      </span>
      {s.t}
    </span>
  );
}

function MiniSpark({ data = [] }: { data?: { t: number; force: number }[] }) {

  const last = (data || []).slice(-12);

  const latestForce =
    last.length > 0
      ? (last[last.length - 1]?.force || 0).toFixed(1)
      : "0.0";

  return (
    <div className="mt-3 flex items-center justify-between rounded-2xl border border-border/60 bg-secondary/40 p-3">

      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
          12-tick trend
        </div>

        <div className="font-display text-sm font-semibold text-foreground">
          {latestForce} N
        </div>
      </div>

      <div className="h-8 w-32">
        <ResponsiveContainer>
          <LineChart data={last}>
            <Line
              type="monotone"
              dataKey="force"
              stroke="oklch(0.45 0.14 150)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}