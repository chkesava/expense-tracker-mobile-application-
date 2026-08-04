import { getSharedStorage } from "../storage/memoryStorage";

export type QrStyleId = "indigo" | "emerald" | "violet" | "sunset" | "ocean" | "rose";

export type QrStyle = {
  id: QrStyleId;
  label: string;
  fg: string;
  bg: string;
  /** Legacy Tailwind gradient classes (web); ignore on native or map to tokens later */
  frame: string;
  header: string;
  swatch: string;
};

export const QR_STYLES: QrStyle[] = [
  {
    id: "indigo",
    label: "Indigo",
    fg: "#4f46e5",
    bg: "#f5f3ff",
    frame: "from-indigo-500 via-violet-500 to-indigo-600",
    header: "from-indigo-600 via-violet-600 to-indigo-700",
    swatch: "bg-indigo-500",
  },
  {
    id: "emerald",
    label: "Emerald",
    fg: "#059669",
    bg: "#ecfdf5",
    frame: "from-emerald-500 via-teal-500 to-emerald-600",
    header: "from-emerald-600 via-teal-600 to-emerald-700",
    swatch: "bg-emerald-500",
  },
  {
    id: "violet",
    label: "Violet",
    fg: "#7c3aed",
    bg: "#f5f3ff",
    frame: "from-violet-500 via-purple-500 to-fuchsia-500",
    header: "from-violet-600 via-purple-600 to-fuchsia-600",
    swatch: "bg-violet-500",
  },
  {
    id: "sunset",
    label: "Sunset",
    fg: "#ea580c",
    bg: "#fff7ed",
    frame: "from-orange-500 via-rose-500 to-amber-500",
    header: "from-orange-600 via-rose-600 to-amber-600",
    swatch: "bg-orange-500",
  },
  {
    id: "ocean",
    label: "Ocean",
    fg: "#0284c7",
    bg: "#f0f9ff",
    frame: "from-sky-500 via-cyan-500 to-blue-600",
    header: "from-sky-600 via-cyan-600 to-blue-700",
    swatch: "bg-sky-500",
  },
  {
    id: "rose",
    label: "Rose",
    fg: "#e11d48",
    bg: "#fff1f2",
    frame: "from-rose-500 via-pink-500 to-rose-600",
    header: "from-rose-600 via-pink-600 to-rose-700",
    swatch: "bg-rose-500",
  },
];

const STORAGE_KEY = "expense-tracker-qr-style";

export function getStoredQrStyleId(): QrStyleId {
  try {
    const raw = getSharedStorage().getItem(STORAGE_KEY);
    if (raw && QR_STYLES.some((s) => s.id === raw)) return raw as QrStyleId;
  } catch {
    /* ignore */
  }
  return "indigo";
}

export function storeQrStyleId(id: QrStyleId): void {
  try {
    getSharedStorage().setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function getQrStyle(id: QrStyleId): QrStyle {
  return QR_STYLES.find((s) => s.id === id) ?? QR_STYLES[0];
}
