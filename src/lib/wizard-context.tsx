
import { createContext, useContext, useState, ReactNode } from "react";

export type WizardData = {
  doctor: { name: string; experience: string; designation: string };
  patient: { name: string; age: string; gender: string; disease: string; session: string; date: string; time: string };
  therapy: { point: string; technique: string; connectivity: "USB Cable" | "WiFi" | "Bluetooth" | "" };
};

export const DEFAULT: WizardData = {
  doctor: { name: "", experience: "", designation: "" },
  patient: { name: "", age: "", gender: "", disease: "", session: "1", date: "", time: "" },
  therapy: { point: "", technique: "", connectivity: "" },
};

type Ctx = {
  data: WizardData;
  update: <K extends keyof WizardData>(k: K, v: Partial<WizardData[K]>) => void;
  reset: () => void;
};

const WizardContext = createContext<Ctx | null>(null);

export function WizardProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<WizardData>(DEFAULT);

  const update: Ctx["update"] = (k, v) => setData((d) => ({ ...d, [k]: { ...d[k], ...v } }));

  const reset = () => {
    setData({
      doctor: { name: "", experience: "", designation: "" },
      patient: { name: "", age: "", gender: "", disease: "", session: "1", date: "", time: "" },
      therapy: { point: "", technique: "", connectivity: "" },
    });
  };

  return <WizardContext.Provider value={{ data, update, reset }}>{children}</WizardContext.Provider>;
}

export function useWizard() {
  const ctx = useContext(WizardContext);
  if (!ctx) throw new Error("useWizard must be used inside WizardProvider");
  return ctx;
}
