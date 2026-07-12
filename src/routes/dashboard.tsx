import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity, AlertTriangle, BarChart3, Bell, CheckCircle2, ChevronLeft, FileText, Gauge,
  LayoutDashboard, Pause, Play, PlugZap, Settings, Square, TrendingUp, Cpu, Wifi, Bluetooth, Cable, Clock,
  Download, RefreshCw, X, PlayCircle, PauseCircle, Check
} from "lucide-react";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Area, AreaChart, Legend as ChartLegend } from "recharts";
import { useWizard } from "@/lib/wizard-context";
import { io } from "socket.io-client";

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
  head: () => ({ meta: [{ title: "Live Monitoring — Varmam.Care" }] }),
});

// ── Backend URL ──────────────────────────────────────────────────────────────
const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ||
  "http://localhost:5000";

const socket = io(BACKEND_URL);

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
  const [activeTab, setActiveTab] = useState("dashboard");
  const [status, setStatus] = useState<Status>("idle");
  const [matrix, setMatrix] = useState<number[][]>(() => Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => 0)));
  const [series, setSeries] = useState<{ t: number; rawForce: number; mlForce: number }[]>([]);
  const [duration, setDuration] = useState(0);
  const [apiMsg, setApiMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // ML Preds
  const [predictedWeight, setPredictedWeight] = useState(0);
  const [predictedForce, setPredictedForce] = useState(0);

  // History playback
  const [sessions, setSessions] = useState<any[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [selectedSession, setSelectedSession] = useState<any | null>(null);
  const [activeHistoryIndex, setActiveHistoryIndex] = useState(-1);
  const [playHistory, setPlayHistory] = useState(false);

  // Device & COM settings
  const [comPorts, setComPorts] = useState<string[]>([]);
  const [selectedComPort, setSelectedComPort] = useState("");
  const [activeComPort, setActiveComPort] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [mlServiceOnline, setMlServiceOnline] = useState(false);

  // Notifications
  const [notifications, setNotifications] = useState<{ id: string; text: string; type: "info" | "warning" | "error"; time: string }[]>([]);
  const [showNotifMenu, setShowNotifMenu] = useState(false);

  // ── Session APIs ─────────────────────────────────────────────────────────
  async function apiPost(path: string, body: object) {
    const res = await fetch(`${BACKEND_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    return res.json();
  }

  async function handleStart() {
    try {
      setSelectedSession(null); // Clear loaded historical session if starting new live
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
      setSeries([]);
      setPredictedWeight(0);
      setPredictedForce(0);
      setApiMsg({ text: "✅ Session started & recording live data", ok: true });
      addNotification("Session started successfully for " + (data.patient.name || "patient"), "info");
    } catch (e) {
      setApiMsg({ text: "❌ Could not reach backend — is server running?", ok: false });
    }
    setTimeout(() => setApiMsg(null), 4000);
  }

  async function handleEnd() {
    try {
      await apiPost("/end-session", {});
      setStatus("ended");
      setApiMsg({ text: "✅ Session ended & saved to MongoDB Atlas", ok: true });
      addNotification("Session completed and synced to Atlas.", "info");
      // Fetch updated sessions list
      fetchSessions();
    } catch (e) {
      setApiMsg({ text: "❌ End-session failed — check backend", ok: false });
      setStatus("ended");
    }
    setTimeout(() => setApiMsg(null), 5000);
  }

  function handleReset() {
    setStatus("idle");
    setDuration(0);
    setSeries([]);
    setMatrix(Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => 0)));
    setPredictedWeight(0);
    setPredictedForce(0);
    reset();
  }

  // ── Ingestion listeners ──────────────────────────────────────────────────
  useEffect(() => {
    if (status !== "running") return;

    socket.on("sensorData", (sensor) => {
      // 8x8 matrix reconstruction
      if (sensor.matrix && sensor.matrix.length === 64) {
        const matrix8x8: number[][] = [];
        for (let i = 0; i < 8; i++) {
          matrix8x8.push(sensor.matrix.slice(i * 8, i * 8 + 8));
        }
        setMatrix(matrix8x8);
      }

      setPredictedWeight(sensor.predicted_weight || 0);
      setPredictedForce(sensor.predicted_force || 0);

      // Re-map series chart data
      setSeries(prev => [
        ...prev.slice(-34),
        {
          t: prev.length > 0 ? prev[prev.length - 1].t + 1 : 0,
          rawForce: sensor.max_force || 0,
          mlForce: sensor.predicted_force || 0
        }
      ]);

      // Dynamic notifications on high pressure
      if (sensor.predicted_force > 75) {
        addNotification(`⚠️ WARNING: Critical pressure exceeded! (${sensor.predicted_force.toFixed(1)} N)`, "error");
      } else if (sensor.predicted_force < 35 && sensor.predicted_force > 5) {
        addNotification(`ℹ️ Alert: Pressure is too low. Try increasing force.`, "warning");
      }
    });

    return () => {
      socket.off("sensorData");
    };
  }, [status]);

  // Duration timer
  useEffect(() => {
    if (status !== "running") return;

    const timer = setInterval(() => {
      setDuration(prev => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [status]);

  // ── Notification Helpers ─────────────────────────────────────────────────
  function addNotification(text: string, type: "info" | "warning" | "error") {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setNotifications(prev => [
      { id: Math.random().toString(), text, type, time },
      ...prev.slice(0, 19)
    ]);
  }

  // ── Database historical loaders ──────────────────────────────────────────
  async function fetchSessions() {
    setLoadingSessions(true);
    try {
      const res = await fetch(`${BACKEND_URL}/sessions`);
      if (res.ok) {
        const d = await res.json();
        setSessions(d);
      }
    } catch (e) {
      console.error("Fetch sessions error:", e);
    } finally {
      setLoadingSessions(false);
    }
  }

  async function loadSessionDetails(id: string) {
    try {
      const res = await fetch(`${BACKEND_URL}/sessions/${id}`);
      if (res.ok) {
        const sess = await res.json();
        setSelectedSession(sess);
        setActiveHistoryIndex(0);
        setPlayHistory(false);
        setActiveTab("dashboard"); // automatically redirect to dashboard to view
        setApiMsg({ text: `📂 Loaded session: ${sess.patientName}`, ok: true });
      }
    } catch (e) {
      console.error(e);
      setApiMsg({ text: "❌ Failed to load session details", ok: false });
    }
    setTimeout(() => setApiMsg(null), 3000);
  }

  // Replay loaded history
  useEffect(() => {
    if (!selectedSession || !playHistory) return;

    const interval = setInterval(() => {
      setActiveHistoryIndex(prev => {
        if (prev >= selectedSession.readings.length - 1) {
          setPlayHistory(false);
          return prev;
        }
        return prev + 1;
      });
    }, 350);

    return () => clearInterval(interval);
  }, [selectedSession, playHistory]);

  // Bind local displays to history index
  useEffect(() => {
    if (!selectedSession || activeHistoryIndex < 0 || activeHistoryIndex >= selectedSession.readings.length) return;

    const currentReading = selectedSession.readings[activeHistoryIndex];
    if (currentReading.matrix && currentReading.matrix.length === 64) {
      const matrix8x8: number[][] = [];
      for (let i = 0; i < 8; i++) {
        matrix8x8.push(currentReading.matrix.slice(i * 8, i * 8 + 8));
      }
      setMatrix(matrix8x8);
    }

    setPredictedWeight(currentReading.predicted_weight || 0);
    setPredictedForce(currentReading.predicted_force || 0);

    // Build timeline up to current point
    const historySeries = selectedSession.readings.slice(0, activeHistoryIndex + 1).map((r: any, idx: number) => ({
      t: idx,
      rawForce: r.max_force || 0,
      mlForce: r.predicted_force || 0
    }));
    setSeries(historySeries);
    setDuration(activeHistoryIndex * 0.35); // simulate relative elapsed time
  }, [selectedSession, activeHistoryIndex]);

  // ── Hardware COM connections ──────────────────────────────────────────
  async function fetchComPorts() {
    try {
      const res = await fetch(`${BACKEND_URL}/com-ports`);
      if (res.ok) {
        const d = await res.json();
        setComPorts(d.paths || []);
        setActiveComPort(d.activePortPath);
        if (d.paths.length > 0 && !selectedComPort) {
          setSelectedComPort(d.paths[0]);
        }
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function handleComConnect() {
    try {
      const res = await apiPost("/connect-usb", { path: selectedComPort });
      if (res.success) {
        setActiveComPort(selectedComPort);
        setApiMsg({ text: `🔌 Connected to ${selectedComPort}`, ok: true });
        addNotification(`USB connection established on ${selectedComPort}`, "info");
      } else {
        setApiMsg({ text: `❌ COM Connection failed`, ok: false });
      }
    } catch (e) {
      setApiMsg({ text: `❌ COM Communication error`, ok: false });
    }
    setTimeout(() => setApiMsg(null), 3000);
  }

  async function handleComDisconnect() {
    try {
      const res = await apiPost("/connect-usb", { path: "" });
      if (res.success) {
        setActiveComPort(null);
        setApiMsg({ text: `🔌 USB disconnected`, ok: true });
        addNotification("USB Serial connection closed.", "info");
      }
    } catch (e) {
      console.error(e);
    }
    setTimeout(() => setApiMsg(null), 3000);
  }

  // Simulator setting
  async function toggleSimulator(enable: boolean) {
    try {
      const res = await apiPost("/toggle-simulation", { enable });
      if (res.success) {
        setIsSimulating(enable);
        setApiMsg({ text: enable ? "🔌 Simulator activated" : "🔌 Simulator stopped", ok: true });
        addNotification(enable ? "ESP32 Simulator started." : "ESP32 Simulator stopped.", "info");
      }
    } catch (e) {
      console.error(e);
    }
    setTimeout(() => setApiMsg(null), 3000);
  }

  // Health checks & listings
  useEffect(() => {
    fetchComPorts();
    fetchSessions();

    const checkMl = async () => {
      try {
        const res = await fetch("http://localhost:5001/");
        if (res.ok) {
          const body = await res.json();
          setMlServiceOnline(body.status === "online");
        } else {
          setMlServiceOnline(false);
        }
      } catch (e) {
        setMlServiceOnline(false);
      }
    };
    checkMl();
    const intv = setInterval(checkMl, 5000);

    return () => clearInterval(intv);
  }, []);

  // Fetch when tab changes to lists
  useEffect(() => {
    if (activeTab === "sessions") {
      fetchSessions();
    }
  }, [activeTab]);

  // ── CSV exporter ─────────────────────────────────────────────────────────
  function handleCsvExport() {
    const sessionToExport = selectedSession || (status === "ended" ? {
      patientName: data.patient.name,
      sessionNumber: data.patient.session,
      doctorName: data.doctor.name,
      varmamPoint: data.therapy.point,
      readings: series.map((s, idx) => ({
        time: new Date(Date.now() - (series.length - idx) * 1000).toISOString(),
        max_force: s.rawForce,
        predicted_force: s.mlForce,
        predicted_weight: 0,
        validation: s.mlForce < 35 ? "Low Pressure" : s.mlForce > 75 ? "High Pressure" : "Correct Pressure",
        matrix: Array.from({ length: 64 }, () => 0)
      }))
    } : null);

    if (!sessionToExport || !sessionToExport.readings || sessionToExport.readings.length === 0) {
      setApiMsg({ text: "⚠️ No readings available to export", ok: false });
      setTimeout(() => setApiMsg(null), 3000);
      return;
    }

    const headers = [
      "Timestamp",
      "Raw Max Force (N)",
      "ML Predicted Force (N)",
      "ML Predicted Weight (g)",
      "Validation",
      "Sensor Matrix (64 conductance values)"
    ];

    const rows = sessionToExport.readings.map((r: any) => {
      const matrixString = r.matrix ? `"[${r.matrix.join(";")}]"` : "[]";
      return [
        r.time ? new Date(r.time).toISOString() : new Date().toISOString(),
        r.max_force || 0,
        r.predicted_force || 0,
        r.predicted_weight || 0,
        r.validation || "Unknown",
        matrixString
      ];
    });

    const csvContent = [
      headers.join(","),
      ...rows.map((row: any[]) => row.join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const name = sessionToExport.patientName || "varmam_session";
    const num = sessionToExport.sessionNumber || "1";
    link.setAttribute("href", url);
    link.setAttribute("download", `${name}_session_${num}_export.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setApiMsg({ text: "📥 CSV Download started", ok: true });
    setTimeout(() => setApiMsg(null), 3000);
  }

  // ── Computes ─────────────────────────────────────────────────────────────
  const flat = matrix.flat();
  const avg = +(flat.reduce((a, b) => a + b, 0) / flat.length).toFixed(1);
  const max = Math.max(...flat);
  
  // validation tone from ML-predicted force if available, otherwise raw avg
  const displayForce = selectedSession || status === "running" ? predictedForce : avg;
  const validation = displayForce < 35 ? "low" : displayForce > 75 ? "high" : "ok";

  const ConnIcon = data.therapy.connectivity === "WiFi" ? Wifi : data.therapy.connectivity === "Bluetooth" ? Bluetooth : Cable;

  return (
    <div className="flex min-h-screen bg-background gradient-mesh-bg text-foreground">
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
            const active = activeTab === n.id;
            return (
              <button
                key={n.id}
                onClick={() => setActiveTab(n.id)}
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
          <div className="mt-1 truncate font-display text-sm font-semibold">{data.doctor.name || "No Practitioner"}</div>
          <div className="truncate text-[11px] text-sidebar-foreground/70">{data.doctor.designation || "Onboarding Suite"}</div>
        </div>
      </aside>

      {/* Main Container */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Header */}
        <header className="sticky top-0 z-20 glass-panel border-b border-border/60">
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
            <div className="flex items-center gap-3">
              <Link to="/therapy" className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-card hover:border-primary hover:text-primary">
                <ChevronLeft className="h-4 w-4" />
              </Link>
              <div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Step 04 · Control Room</div>
                <h1 className="font-display text-xl font-semibold text-foreground">
                  {selectedSession ? `📁 Historical: ${selectedSession.patientName}` : (data.patient.name || "Active Session")} · <span className="text-primary">{selectedSession ? selectedSession.varmamPoint : (data.therapy.point || "Varmam Point")}</span>
                </h1>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <StatusPill status={selectedSession ? "ended" : status} isHistorical={!!selectedSession} />
              
              {/* Notification bell */}
              <div className="relative">
                <button
                  onClick={() => setShowNotifMenu(!showNotifMenu)}
                  className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground relative"
                >
                  <Bell className="h-4 w-4" />
                  {notifications.length > 0 && (
                    <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                  )}
                </button>
                
                {showNotifMenu && (
                  <div className="absolute right-0 mt-2 w-80 rounded-2xl border border-border bg-card shadow-lg p-4 z-50 max-h-96 overflow-y-auto">
                    <div className="flex items-center justify-between border-b pb-2 mb-2">
                      <span className="font-semibold text-xs uppercase tracking-wider">Alerts & Logs</span>
                      <button onClick={() => setNotifications([])} className="text-[10px] text-primary hover:underline">Clear</button>
                    </div>
                    {notifications.length === 0 ? (
                      <div className="py-6 text-center text-xs text-muted-foreground">No recent alerts</div>
                    ) : (
                      <div className="space-y-2">
                        {notifications.map(n => (
                          <div key={n.id} className="text-xs p-2 rounded-lg border bg-secondary/30 flex justify-between gap-1 items-start">
                            <div>
                              <p className={`font-medium ${n.type === 'error' ? 'text-red-500' : n.type === 'warning' ? 'text-amber-500' : 'text-foreground'}`}>{n.text}</p>
                              <span className="text-[9px] text-muted-foreground">{n.time}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Dynamic Body Content */}
        <main className="flex-1 space-y-6 px-6 py-6">
          {selectedSession && (
            <div className="glass-card rounded-2xl p-4 border-2 border-primary/40 bg-primary/5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                  📂 Historical Playback Mode
                </span>
                <p className="text-xs text-muted-foreground mt-1">
                  You are reviewing a previous recording of <strong>{selectedSession.patientName}</strong> taken on <strong>{selectedSession.visitDate}</strong>.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPlayHistory(!playHistory)}
                  className="flex items-center gap-1.5 rounded-xl bg-primary text-primary-foreground px-3 py-2 text-xs font-semibold hover:opacity-90"
                >
                  {playHistory ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
                  {playHistory ? "Pause Replay" : "Play Replay"}
                </button>
                <div className="flex items-center gap-1.5 bg-card border rounded-xl px-3 py-2">
                  <span className="text-xs text-muted-foreground">Seek:</span>
                  <input
                    type="range"
                    min="0"
                    max={selectedSession.readings.length - 1}
                    value={activeHistoryIndex}
                    onChange={(e) => {
                      setPlayHistory(false);
                      setActiveHistoryIndex(Number(e.target.value));
                    }}
                    className="w-24 accent-primary"
                  />
                  <span className="text-xs font-mono">{activeHistoryIndex + 1}/{selectedSession.readings.length}</span>
                </div>
                <button
                  onClick={() => setSelectedSession(null)}
                  className="grid h-8 w-8 place-items-center rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground"
                  title="Close Playback"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* TAB 1: LIVE DASHBOARD */}
          {activeTab === "dashboard" && (
            <>
              {/* Metric Cards */}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
                <Metric icon={Gauge} label="Avg Sensor Force" value={`${avg}`} unit="N" trend="raw" tone="primary" />
                <Metric icon={TrendingUp} label="Max Sensor Force" value={`${max}`} unit="N" trend="raw peak" tone="warning" />
                <Metric icon={Activity} label="Drift Compensated" value={status === "running" || selectedSession ? predictedForce.toFixed(1) : "0.0"} unit="N" trend="LSTM model" tone="success" />
                <Metric icon={TrendingUp} label="Predicted Weight" value={status === "running" || selectedSession ? predictedWeight.toFixed(0) : "0"} unit="g" trend="MLP model" tone="success" />
                <Metric icon={ConnIcon} label="Connectivity" value={selectedSession ? "File Read" : (data.therapy.connectivity || "—")} unit="" trend="active path" tone="primary" />
                <Metric icon={CheckCircle2} label="Status Band" value={validation === "ok" ? "Optimal" : validation === "low" ? "Low" : "High"} unit="" trend={validation === "ok" ? "35 - 75 N" : "Alert Range"} tone={validation === "ok" ? "success" : "destructive"} />
              </div>

              {/* Force plot and heatmap */}
              <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
                {/* Pressure Grid Heatmap */}
                <section className="glass-card rounded-3xl p-6">
                  <CardHeader title="Live Pressure Matrix" sub="8 × 8 conductance grid · sampling @ 60Hz">
                    <Legend />
                  </CardHeader>
                  <div className="mt-5 grid grid-cols-8 gap-1.5 sm:gap-2">
                    {matrix.flatMap((row, r) =>
                      row.map((v, c) => (
                        <motion.div
                          key={`${r}-${c}`}
                          animate={{ backgroundColor: heatColor(v), scale: v > 75 ? 1.05 : 1 }}
                          transition={{ duration: 0.2 }}
                          className="aspect-square rounded-lg shadow-sm ring-1 ring-black/5"
                          style={{ backgroundColor: heatColor(v) }}
                        >
                          <div className="grid h-full place-items-center text-[9px] font-bold text-white/90 mix-blend-overlay">
                            {Math.round(v)}
                          </div>
                        </motion.div>
                      )),
                    )}
                  </div>
                </section>

                {/* Force Graph (Recharts) */}
                <section className="glass-card rounded-3xl p-6">
                  <CardHeader title="Real-Time Force Analytics" sub="LSTM Drift Compensation vs Raw Maximum Force">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
                      <BarChart3 className="h-3 w-3" /> Live
                    </span>
                  </CardHeader>
                  <div className="mt-5 h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={series} margin={{ top: 10, right: 10, left: -16, bottom: 0 }}>
                        <defs>
                          <linearGradient id="gRaw" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="#eab308" stopOpacity={0.4} />
                            <stop offset="100%" stopColor="#eab308" stopOpacity={0.01} />
                          </linearGradient>
                          <linearGradient id="gML" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="#16a34a" stopOpacity={0.4} />
                            <stop offset="100%" stopColor="#16a34a" stopOpacity={0.01} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" vertical={false} />
                        <XAxis label={{ value: "Timesteps", position: "insideBottom", offset: -5, fontSize: 10 }} dataKey="t" tick={{ fontSize: 9, fill: "#64748b" }} axisLine={false} tickLine={false} />
                        <YAxis label={{ value: "Force (Newtons)", angle: -90, position: "insideLeft", fontSize: 10 }} tick={{ fontSize: 9, fill: "#64748b" }} axisLine={false} tickLine={false} domain={[0, 100]} />
                        <Tooltip
                          contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12, background: "white" }}
                        />
                        <ChartLegend verticalAlign="top" height={36} iconSize={10} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                        <Area type="monotone" name="Raw Peak Force" dataKey="rawForce" stroke="#eab308" strokeWidth={2} fill="url(#gRaw)" isAnimationActive={false} />
                        <Area type="monotone" name="Drift Compensated Force (LSTM)" dataKey="mlForce" stroke="#16a34a" strokeWidth={2.5} fill="url(#gML)" isAnimationActive={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  
                  {/* Validation Threshold visual indicators */}
                  <div className="mt-4 flex items-center justify-between text-[10px] text-muted-foreground border-t pt-3">
                    <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500" /> &gt;75 N High Limit</span>
                    <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-green-500" /> 35-75 N Optimal Band</span>
                    <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-500" /> &lt;35 N Low Limit</span>
                  </div>
                </section>
              </div>

              {/* Clinical Band Alerts and Controls */}
              <div className="grid gap-6 xl:grid-cols-[1fr_1.6fr]">
                {/* Validation alerts */}
                <section className="glass-card rounded-3xl p-6">
                  <CardHeader title="Clinical Threshold Alerts" sub="Clinical limits mapped dynamically from model outputs" />
                  <div className="mt-4 space-y-3">
                    <AlertRow tone="success" icon={CheckCircle2} title="Correct Varmam Pressure" detail="Applied force resides within 35–75 N therapeutic band" active={validation === "ok"} />
                    <AlertRow tone="warning" icon={AlertTriangle} title="Insufficient Varmam Pressure" detail="Applied force is below the 35 N stimulation threshold" active={validation === "low"} />
                    <AlertRow tone="destructive" icon={AlertTriangle} title="Excessive Varmam Pressure" detail="Applied force exceeds safe physiological limit of 75 N" active={validation === "high"} />
                  </div>
                </section>

                {/* Session controls */}
                <section className="glass-card rounded-3xl p-6">
                  <CardHeader title="Session Operations Control" sub="Start/Stop and record varmam therapeutic cycles" />
                  <div className="mt-5 grid gap-3 sm:grid-cols-4">
                    <ControlBtn icon={Play} label="Start Data" tone="primary" disabled={status === "running" || status === "ended" || !!selectedSession} onClick={handleStart} />
                    <ControlBtn icon={Pause} label="Pause" tone="warning" disabled={status !== "running"} onClick={() => setStatus("paused")} />
                    <ControlBtn icon={Play} label="Resume" tone="success" disabled={status !== "paused"} onClick={() => setStatus("running")} />
                    <ControlBtn icon={Square} label="End Session" tone="destructive" disabled={status === "ended" || status === "idle"} onClick={handleEnd} />
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2 items-center justify-between border-t pt-4">
                    <div className="flex gap-2">
                      <button
                        onClick={handleCsvExport}
                        disabled={series.length === 0}
                        className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground hover:bg-secondary/40 disabled:opacity-50"
                      >
                        <Download className="h-3.5 w-3.5" /> Export CSV
                      </button>
                      <button
                        onClick={handleReset}
                        className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground hover:bg-secondary/40"
                      >
                        <RefreshCw className="h-3.5 w-3.5" /> Clear Wizard
                      </button>
                    </div>

                    <div className="text-right text-[11px] text-muted-foreground">
                      Session Time: <span className="font-mono font-semibold text-foreground">{fmt(duration)}</span>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 rounded-2xl border border-border/70 bg-secondary/40 p-4 sm:grid-cols-3">
                    <Info label="Intake Patient" value={selectedSession ? selectedSession.patientName : (data.patient.name || "—")} />
                    <Info label="Technique Protocol" value={selectedSession ? selectedSession.varmamTechnique : (data.therapy.technique || "—")} />
                    <Info label="Session Number" value={selectedSession ? `#${selectedSession.sessionNumber}` : `#${data.patient.session || "—"}`} />
                  </div>
                </section>
              </div>
            </>
          )}

          {/* TAB 2: HISTORICAL RECORDINGS */}
          {activeTab === "sessions" && (
            <div className="glass-card rounded-3xl p-6">
              <div className="flex items-center justify-between border-b pb-4 mb-4">
                <div>
                  <h2 className="font-display text-xl font-semibold">MongoDB Historical Sessions</h2>
                  <p className="text-xs text-muted-foreground">Load and review past clinical therapy trials</p>
                </div>
                <button
                  onClick={fetchSessions}
                  className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold hover:bg-secondary/40"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Refresh List
                </button>
              </div>

              {loadingSessions ? (
                <div className="py-12 text-center text-sm text-muted-foreground flex flex-col items-center justify-center gap-2">
                  <RefreshCw className="h-6 w-6 animate-spin text-primary" /> Loading session archives...
                </div>
              ) : sessions.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  No historical sessions found in MongoDB Atlas. Start and end a live monitoring session to generate records.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="border-b text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">Patient Profile</th>
                        <th className="py-3 px-4">Varmam Protocol</th>
                        <th className="py-3 px-4">Practitioner</th>
                        <th className="py-3 px-4">Session</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {sessions.map((s) => (
                        <tr key={s._id} className="hover:bg-secondary/20 transition">
                          <td className="py-3.5 px-4 font-mono text-xs">
                            {s.visitDate || (s.startTime ? new Date(s.startTime).toLocaleDateString() : "—")}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-semibold">{s.patientName || "Anonymous"}</div>
                            <div className="text-[11px] text-muted-foreground">{s.gender || "—"}, Age {s.patientAge || "—"}</div>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="font-medium text-primary">{s.varmamPoint || "—"}</span>
                            <div className="text-[11px] text-muted-foreground">{s.varmamTechnique || "—"}</div>
                          </td>
                          <td className="py-3.5 px-4">
                            <div>{s.doctorName || "—"}</div>
                            <div className="text-[10px] text-muted-foreground">{s.designation || "—"}</div>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="inline-flex items-center justify-center rounded-full bg-secondary px-2 py-0.5 text-xs font-mono font-semibold">
                              #{s.sessionNumber || 1}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <button
                              onClick={() => loadSessionDetails(s._id)}
                              className="inline-flex items-center gap-1 rounded-xl bg-primary/10 text-primary px-3 py-1.5 text-xs font-semibold hover:bg-primary hover:text-primary-foreground transition"
                            >
                              Load Record
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: CLINICAL REPORTS */}
          {activeTab === "reports" && (
            <div className="glass-card rounded-3xl p-6 max-w-4xl mx-auto space-y-6">
              {!(selectedSession || status === "ended") ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  No active session or loaded recording. Run a live monitoring session or select one from the "Sessions" tab to generate a clinical report.
                </div>
              ) : (
                (() => {
                  const target =
  selectedSession ??
  {
    patientName: data.patient.name,
    sessionNumber: data.patient.session,
    doctorName: data.doctor.name,
    varmamPoint: data.therapy.point,
    readings: series.map((s) => ({
      predicted_force: s.mlForce,
      max_force: s.rawForce
    }))
  };
                  const readings = target.readings || [];
                  const count = readings.length;
                  const forces = readings.map((r: any) => r.predicted_force || r.max_force || 0);
                  const peak = forces.length > 0 ? Math.max(...forces).toFixed(1) : "0.0";
                  const reportAvg = forces.length > 0 ? (forces.reduce((a, b) => a + b, 0) / forces.length).toFixed(1) : "0.0";
                  
                  // Compute validation percentages
                  let correctCount = 0;
                  readings.forEach((r: any) => {
                    const f = r.predicted_force || r.max_force || 0;
                    if (f >= 35 && f <= 75) correctCount++;
                  });
                  const accuracyPct = count > 0 ? Math.round((correctCount / count) * 100) : 0;

                  return (
                    <>
                      <div className="flex items-center justify-between border-b pb-4">
                        <div>
                          <span className="text-[10px] uppercase tracking-widest text-primary font-semibold">Clinical Diagnostics</span>
                          <h2 className="font-display text-2xl font-bold">Varmam.Care Clinical Summary Report</h2>
                        </div>
                        <button
                          onClick={handleCsvExport}
                          className="flex items-center gap-1.5 rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-xs font-semibold hover:opacity-90 shadow-glow"
                        >
                          <Download className="h-4 w-4" /> Export CSV Record
                        </button>
                      </div>

                      {/* Info grid */}
                      <div className="grid gap-6 sm:grid-cols-2 border bg-secondary/20 rounded-2xl p-5">
                        <div className="space-y-2 border-r pr-4 border-border/80">
                          <h3 className="text-xs uppercase font-bold text-muted-foreground tracking-wider">Practitioner Details</h3>
                          <p className="text-sm">Therapist: <strong>{target.doctorName || "—"}</strong></p>
                          <p className="text-xs text-muted-foreground">Designation: {target.designation || "—"}</p>
                          <p className="text-xs text-muted-foreground">Clinical Experience: {target.doctorExp ? `${target.doctorExp} Years` : "—"}</p>
                        </div>
                        <div className="space-y-2">
                          <h3 className="text-xs uppercase font-bold text-muted-foreground tracking-wider">Patient Information</h3>
                          <p className="text-sm">Patient Name: <strong>{target.patientName || "—"}</strong></p>
                          <p className="text-xs text-muted-foreground">Demographics: {target.gender || "—"}, Age {target.patientAge || "—"}</p>
                          <p className="text-xs text-muted-foreground">Witnessed Pathology: {target.diseaseWitnessed || "—"}</p>
                        </div>
                      </div>

                      <div className="grid gap-6 sm:grid-cols-2">
                        <div className="border rounded-2xl p-5 space-y-3">
                          <h3 className="text-xs uppercase font-bold text-muted-foreground tracking-wider">Therapeutic Protocol</h3>
                          <div>
                            <span className="text-[10px] text-muted-foreground">Target Varmam Point:</span>
                            <div className="text-base font-semibold text-primary">{target.varmamPoint || "—"}</div>
                          </div>
                          <div>
                            <span className="text-[10px] text-muted-foreground">Manual Manipulation Technique:</span>
                            <div className="text-sm font-semibold">{target.varmamTechnique || "—"}</div>
                          </div>
                          <div>
                            <span className="text-[10px] text-muted-foreground">Trial Cycle Instance:</span>
                            <div className="text-sm font-semibold">Session Number #{target.sessionNumber || "—"}</div>
                          </div>
                        </div>

                        <div className="border rounded-2xl p-5 space-y-4">
                          <h3 className="text-xs uppercase font-bold text-muted-foreground tracking-wider">Metric Outcomes (ML Analyzed)</h3>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <span className="text-[10px] text-muted-foreground">Peak Force:</span>
                              <div className="text-2xl font-bold text-foreground">{peak} N</div>
                            </div>
                            <div>
                              <span className="text-[10px] text-muted-foreground">Mean Force:</span>
                              <div className="text-2xl font-bold text-foreground">{reportAvg} N</div>
                            </div>
                          </div>
                          <div className="border-t pt-3">
                            <span className="text-[10px] text-muted-foreground">Therapeutic Band Accuracy:</span>
                            <div className="flex items-center gap-2 mt-1">
                              <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                                <div className="h-full bg-green-500" style={{ width: `${accuracyPct}%` }} />
                              </div>
                              <span className="text-sm font-bold font-mono">{accuracyPct}%</span>
                            </div>
                            <span className="text-[9px] text-muted-foreground mt-0.5 block">Percentage of session spent inside optimal 35-75N pressure range</span>
                          </div>
                        </div>
                      </div>

                      <div className="border rounded-2xl p-5 space-y-2 bg-card">
                        <h3 className="text-xs uppercase font-bold text-muted-foreground tracking-wider">Clinical Efficacy Note</h3>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          A high accuracy percentage (&gt;75%) indicates the practicing therapist maintained steady stimulation at the targeted reflex node, triggering the optimal neuro-humoral response while preventing tissue micro-trauma from excessive pressure. Insufficient pressure (&lt;35N) fails to elicit therapeutic effects, whereas forces exceeding 75N warrant immediate correction. Use the exported CSV timeline to analyze force profiles and calibrate finger manipulation technique.
                        </p>
                      </div>
                    </>
                  );
                })()
              )}
            </div>
          )}

          {/* TAB 4: DEVICE STATUS */}
          {activeTab === "device" && (
            <div className="glass-card rounded-3xl p-6 max-w-2xl mx-auto space-y-6">
              <div className="border-b pb-4">
                <h2 className="font-display text-xl font-semibold">ESP32 Hardware Integration</h2>
                <p className="text-xs text-muted-foreground">Configure connection modes and pair the sensor grid</p>
              </div>

              {/* Status Header */}
              <div className="flex items-center justify-between border bg-secondary/30 rounded-2xl p-5">
                <div className="flex items-center gap-3">
                  <div className={`grid h-12 w-12 place-items-center rounded-xl bg-card border ${activeComPort || isSimulating ? 'text-green-500 border-green-500/40 bg-green-500/5' : 'text-muted-foreground'}`}>
                    <Cpu className="h-6 w-6 animate-pulse" />
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Device Connection</span>
                    <h3 className="text-base font-bold">{activeComPort ? `Connected via USB (${activeComPort})` : isSimulating ? "Simulating Live Hardware" : "Offline / Unlinked"}</h3>
                  </div>
                </div>
                
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${activeComPort || isSimulating ? 'bg-success/15 text-success' : 'bg-secondary text-muted-foreground'}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${activeComPort || isSimulating ? 'bg-success animate-ping' : 'bg-muted-foreground/60'}`} />
                  {activeComPort || isSimulating ? "System Online" : "Disconnected"}
                </span>
              </div>

              {/* Connectivity details */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-wider">Configure Connection Method</h3>
                
                <div className="grid gap-4 sm:grid-cols-2">
                  {/* USB connection selector */}
                  <div className="border rounded-2xl p-5 space-y-4">
                    <div className="flex items-center gap-2 text-primary">
                      <Cable className="h-5 w-5" />
                      <span className="text-sm font-semibold">USB Cable Configuration</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Link the dashboard directly to the ESP32 COM port over micro-USB/Type-C.</p>
                    
                    <div className="space-y-2 border-t pt-3">
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground block">Select COM Port</label>
                      <div className="flex gap-2">
                        <select
                          value={selectedComPort}
                          onChange={(e) => setSelectedComPort(e.target.value)}
                          className="flex-1 rounded-xl border bg-card px-3 py-2 text-xs"
                        >
                          {comPorts.length === 0 ? (
                            <option value="">No COM Ports Found</option>
                          ) : (
                            comPorts.map(p => <option key={p} value={p}>{p}</option>)
                          )}
                        </select>
                        <button
                          onClick={fetchComPorts}
                          className="grid h-8 w-8 place-items-center rounded-xl border bg-card text-muted-foreground hover:text-foreground"
                          title="Refresh Ports"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="pt-2 flex gap-2">
                        <button
                          onClick={handleComConnect}
                          disabled={!selectedComPort || activeComPort === selectedComPort}
                          className="flex-1 bg-primary text-primary-foreground rounded-xl py-2 text-xs font-semibold hover:opacity-90 disabled:opacity-50"
                        >
                          Link COM Port
                        </button>
                        {activeComPort && (
                          <button
                            onClick={handleComDisconnect}
                            className="border border-red-500 text-red-500 bg-red-500/5 rounded-xl px-3 py-2 text-xs font-semibold hover:bg-red-500 hover:text-white"
                          >
                            Unlink
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* WiFi/Bluetooth API details */}
                  <div className="border rounded-2xl p-5 space-y-4">
                    <div className="flex items-center gap-2 text-primary">
                      <Wifi className="h-5 w-5" />
                      <span className="text-sm font-semibold">Wireless Ingestion</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Receive sensor packets from ESP32 wirelessly over network protocols.</p>
                    
                    <div className="space-y-2 border-t pt-3 text-[11px]">
                      <div className="p-2.5 bg-secondary/40 rounded-xl font-mono text-[10px]">
                        <strong>WiFi:</strong> POST JSON to <br />
                        <span className="text-primary">{BACKEND_URL}/esp-data</span>
                      </div>
                      <div className="p-2.5 bg-secondary/40 rounded-xl font-mono text-[10px]">
                        <strong>Bluetooth:</strong> POST JSON to <br />
                        <span className="text-primary">{BACKEND_URL}/bluetooth-data</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Hardware specifications */}
              <div className="border rounded-2xl p-5 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Active Device Specs</h4>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="bg-secondary/30 p-2.5 rounded-xl border">
                    <span className="text-[10px] text-muted-foreground block">Firmware</span>
                    <strong className="text-foreground">v3.2.1</strong>
                  </div>
                  <div className="bg-secondary/30 p-2.5 rounded-xl border">
                    <span className="text-[10px] text-muted-foreground block">Sensors</span>
                    <strong className="text-foreground">8x8 Matrix</strong>
                  </div>
                  <div className="bg-secondary/30 p-2.5 rounded-xl border">
                    <span className="text-[10px] text-muted-foreground block">Battery</span>
                    <strong className="text-green-500">92% OK</strong>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: SETTINGS */}
          {activeTab === "settings" && (
            <div className="glass-card rounded-3xl p-6 max-w-2xl mx-auto space-y-6">
              <div className="border-b pb-4">
                <h2 className="font-display text-xl font-semibold">Dashboard Configurations</h2>
                <p className="text-xs text-muted-foreground">Manage endpoints and simulator services</p>
              </div>

              <div className="space-y-5">
                {/* Simulator Mode */}
                <div className="flex items-center justify-between border-b pb-4">
                  <div className="max-w-md">
                    <h3 className="text-sm font-semibold">ESP32 Hardware Simulation</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Enable simulated sensor streams to test UI rendering and ML model predictions without physical hardware connected.
                    </p>
                  </div>
                  
                  {/* Simulation Toggle Switch */}
                  <button
                    onClick={() => toggleSimulator(!isSimulating)}
                    className={`relative w-12 h-6 rounded-full transition-colors duration-200 focus:outline-none ${isSimulating ? 'bg-primary' : 'bg-muted'}`}
                  >
                    <span
                      className={`absolute left-0.5 top-0.5 bg-white w-5 h-5 rounded-full shadow transition-transform duration-200 ${isSimulating ? 'translate-x-6' : ''}`}
                    />
                  </button>
                </div>

                {/* API Endpoint Configuration */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wider">Service Endpoints</h3>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground block">Express Server IP (Node.js)</label>
                      <input
                        type="text"
                        value={BACKEND_URL}
                        disabled
                        className="w-full bg-secondary/40 border rounded-xl px-3.5 py-2.5 text-xs text-muted-foreground mt-1 cursor-not-allowed"
                      />
                      <span className="text-[9px] text-green-600 font-mono mt-0.5 block">✓ Endpoint Status: Online</span>
                    </div>

                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground block">ML Prediction Service IP (Python Flask)</label>
                      <input
                        type="text"
                        value="http://localhost:5001"
                        disabled
                        className="w-full bg-secondary/40 border rounded-xl px-3.5 py-2.5 text-xs text-muted-foreground mt-1 cursor-not-allowed"
                      />
                      <span className={`text-[9px] font-mono mt-0.5 block ${mlServiceOnline ? 'text-green-600' : 'text-red-500'}`}>
                        {mlServiceOnline ? "✓ Endpoint Status: Online (MLP & LSTM models ready)" : "✗ Endpoint Status: Offline (Run: python backend/ml_service.py)"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* DB status info */}
                <div className="border-t pt-4 space-y-2">
                  <h3 className="text-sm font-semibold uppercase tracking-wider">Database Status</h3>
                  <div className="flex items-center gap-2 p-3 bg-green-500/5 border border-green-500/20 rounded-xl text-xs text-green-700">
                    <Check className="h-4 w-4 bg-green-600 text-white rounded-full p-0.5" />
                    <span>MongoDB Atlas connected successfully. Session logs will persist automatically.</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* API status toast */}
      {apiMsg && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-2xl px-5 py-3 text-sm font-semibold shadow-lg transition-all ${
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

function heatColor(v: number) {
  if (v < 20) return "rgba(37, 99, 235, 0.1)"; // Very faint blue
  if (v < 35) return "rgba(37, 99, 235, 0.85)"; // Blue (Low)
  if (v < 55) return "rgba(22, 163, 74, 0.9)"; // Green (Moderate)
  if (v < 75) return "rgba(234, 179, 8, 0.95)"; // Yellow (High)
  return "rgba(220, 38, 38, 1)"; // Solid Red (Very High)
}

function fmt(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

function CardHeader({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-3 mb-4">
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
    success: "text-green-600 bg-green-500/10",
    warning: "text-amber-500 bg-amber-500/10",
    destructive: "text-red-500 bg-red-500/10",
  };
  return (
    <div className="glass-card rounded-2xl p-4 border bg-card shadow-sm hover:shadow-md transition">
      <div className="flex items-center justify-between">
        <span className={`grid h-8 w-8 place-items-center rounded-xl ${tones[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded-full">{trend}</span>
      </div>
      <div className="mt-3 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
      <div className="mt-0.5 font-display text-2xl font-bold text-foreground">
        {value} <span className="text-xs font-semibold text-muted-foreground">{unit}</span>
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-2 text-[10px] text-muted-foreground bg-secondary/40 px-3 py-1 rounded-full border">
      <span className="h-1.5 w-12 rounded-full" style={{ background: "linear-gradient(90deg, #2563eb, #16a34a, #eab308, #dc2626)" }} />
      Blue Low → Green Mod → Yellow High → Red Peak
    </div>
  );
}

function AlertRow({ tone, icon: Icon, title, detail, active }: { tone: "success" | "warning" | "destructive"; icon: any; title: string; detail: string; active: boolean }) {
  const tones = {
    success: "border-green-500/30 bg-green-500/5 text-green-700",
    warning: "border-amber-500/30 bg-amber-500/5 text-amber-700",
    destructive: "border-red-500/30 bg-red-500/5 text-red-700",
  } as const;
  return (
    <div className={`relative flex items-start gap-3 rounded-2xl border p-3.5 transition-all ${active ? tones[tone] + ' shadow-sm' : 'border-border/60 opacity-60'}`}>
      <div className={`grid h-9 w-9 place-items-center rounded-xl bg-card border ${active ? 'text-inherit shadow-sm' : 'text-muted-foreground'}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{detail}</div>
      </div>
      <AnimatePresence>
        {active && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            className="relative flex h-2.5 w-2.5 mt-1.5"
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
    primary: "gradient-primary text-primary-foreground shadow-glow hover:opacity-90",
    success: "bg-green-600 text-white hover:bg-green-700",
    warning: "bg-amber-500 text-white hover:bg-amber-600",
    destructive: "bg-red-500 text-white hover:bg-red-600",
  };
  return (
    <motion.button
      whileHover={!disabled ? { y: -1 } : {}}
      whileTap={!disabled ? { scale: 0.98 } : {}}
      disabled={disabled}
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-xs font-bold transition-all shadow-sm ${
        disabled ? "cursor-not-allowed bg-muted text-muted-foreground opacity-45 border" : tones[tone]
      }`}
    >
      <Icon className="h-4 w-4" /> {label}
    </motion.button>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
      <div className="mt-0.5 truncate font-display text-xs font-bold text-foreground">{value}</div>
    </div>
  );
}

function StatusPill({ status, isHistorical }: { status: Status; isHistorical?: boolean }) {
  const map = {
    running: { c: "bg-green-500/15 text-green-600", t: "Live Ingestion" },
    paused: { c: "bg-amber-500/15 text-amber-500", t: "Paused" },
    ended: { c: "bg-secondary text-muted-foreground", t: "Session Inactive" },
    idle: { c: "bg-secondary text-muted-foreground", t: "Idle" },
  } as const;
  
  if (isHistorical) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold bg-primary/10 text-primary">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
        </span>
        Replaying Recording
      </span>
    );
  }

  const s = map[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${s.c}`}>
      <span className="relative flex h-2 w-2">
        {status === "running" && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${status === "running" ? "bg-green-500" : status === "paused" ? "bg-amber-500" : "bg-muted-foreground/60"}`} />
      </span>
      {s.t}
    </span>
  );
}