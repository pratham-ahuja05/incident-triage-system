import { loadFont as loadSans } from "@remotion/google-fonts/SourceSans3";
import { loadFont as loadMono } from "@remotion/google-fonts/SourceCodePro";

// Same palette and fonts as the dashboard's dark "Ember" theme.
const sans = loadSans("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin"] });
const mono = loadMono("normal", { weights: ["400", "500", "600"], subsets: ["latin"] });

export const FONT = { sans: sans.fontFamily, mono: mono.fontFamily };

export const C = {
  bg: "#12100e",
  bgElevated: "#171411",
  surface: "#1c1916",
  surface2: "#24201c",
  border: "#342e28",
  borderStrong: "#4d453c",
  text: "#f2ebe2",
  muted: "#b4a897",
  dim: "#968a7b",
  accent: "#e8863a",
  onAccent: "#1d1108",
  success: "#93c36d",
  danger: "#f2545f",
  warning: "#e9c25a",
};

export const FPS = 30;

// Accent glow at a given opacity, for radial backdrops and focus rings.
export const accentGlow = (alpha) => `rgba(232, 134, 58, ${alpha})`;
