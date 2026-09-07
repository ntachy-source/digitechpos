export interface AccentPreset {
  id: string;
  label: string;
  /** HSL triplet without hsl() */
  primary: string;
  glow: string;
  ring: string;
  swatch: string;
}

export const ACCENTS: AccentPreset[] = [
  { id: "blue", label: "Ocean Blue", primary: "221 83% 53%", glow: "217 91% 65%", ring: "221 83% 53%", swatch: "#2563eb" },
  { id: "emerald", label: "Emerald", primary: "160 84% 39%", glow: "158 64% 52%", ring: "160 84% 39%", swatch: "#10b981" },
  { id: "violet", label: "Violet", primary: "262 83% 58%", glow: "258 90% 70%", ring: "262 83% 58%", swatch: "#7c3aed" },
  { id: "amber", label: "Amber", primary: "32 95% 44%", glow: "38 92% 55%", ring: "32 95% 44%", swatch: "#d97706" },
  { id: "rose", label: "Rose", primary: "347 77% 50%", glow: "350 89% 65%", ring: "347 77% 50%", swatch: "#e11d48" },
  { id: "teal", label: "Teal", primary: "185 85% 35%", glow: "187 85% 45%", ring: "185 85% 35%", swatch: "#0d9488" },
  { id: "slate", label: "Graphite", primary: "222 30% 30%", glow: "222 25% 45%", ring: "222 30% 30%", swatch: "#3b4863" },
];

const KEY = "accent-color";

export const getStoredAccent = (): string => {
  if (typeof window === "undefined") return "blue";
  return localStorage.getItem(KEY) || "blue";
};

export const applyAccent = (id: string) => {
  const a = ACCENTS.find(x => x.id === id) ?? ACCENTS[0];
  const root = document.documentElement;
  root.style.setProperty("--primary", a.primary);
  root.style.setProperty("--primary-glow", a.glow);
  root.style.setProperty("--ring", a.ring);
  root.style.setProperty("--sidebar-primary", a.primary);
  root.style.setProperty("--sidebar-ring", a.ring);
  root.style.setProperty("--gradient-primary", `linear-gradient(135deg, hsl(${a.primary}), hsl(${a.glow}))`);
  localStorage.setItem(KEY, a.id);
};
