import { loadFont as loadSans } from "@remotion/google-fonts/IBMPlexSans";
import { loadFont as loadMono } from "@remotion/google-fonts/IBMPlexMono";

// Same palette and fonts as the dashboard's dark theme.
const sans = loadSans("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin"] });
const mono = loadMono("normal", { weights: ["400", "500", "600"], subsets: ["latin"] });

export const FONT = { sans: sans.fontFamily, mono: mono.fontFamily };

export const C = {
  bg: "#0b0d10",
  bgElevated: "#101318",
  surface: "#14171c",
  surface2: "#1a1e26",
  border: "#2a303a",
  borderStrong: "#3a4250",
  text: "#e8eaee",
  muted: "#9aa3b2",
  dim: "#808a9b",
  accent: "#5b8def",
  success: "#3dba7e",
  danger: "#e5484d",
  warning: "#e8a23a",
};

export const FPS = 30;
