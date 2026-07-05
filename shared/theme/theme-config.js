export const THEME_STORAGE_KEY = "elhadidy-theme-mode";

export const webThemes = {
  dark: {
    mode: "dark",
    bg: "#050505",
    surface: "#0d0d0d",
    surfaceAlt: "#111111",
    card: "#0a0a0a",
    border: "#1a1a1a",
    borderSoft: "#222222",
    text: "#ffffff",
    subText: "#888888",
    muted: "#666666",
    accent: "#D4AF37",
    accentAlt: "#b5952f",
    danger: "#ff4444",
    success: "#4CAF50",
    info: "#00c8ff",
    buttonText: "#000000",
    overlay: "rgba(0,0,0,0.95)",
    gradient: "linear-gradient(45deg, #D4AF37, #b5952f)",
    panelGradient: "linear-gradient(135deg, #171717, #090909)",
  },
  light: {
    mode: "light",
    bg: "#f5f1e8",
    surface: "#fffdf8",
    surfaceAlt: "#f2eadb",
    card: "#ffffff",
    border: "#dfd2bb",
    borderSoft: "#d5c5aa",
    text: "#221b12",
    subText: "#705f49",
    muted: "#8d7a61",
    accent: "#9a6b12",
    accentAlt: "#c4912f",
    danger: "#c63f2f",
    success: "#2f8f57",
    info: "#116f91",
    buttonText: "#ffffff",
    overlay: "rgba(245,241,232,0.92)",
    gradient: "linear-gradient(45deg, #9a6b12, #c4912f)",
    panelGradient: "linear-gradient(135deg, #fffdf8, #efe4d1)",
  },
};

export const mobileThemes = {
  dark: {
    mode: "dark",
    bg: "#050505",
    card: "#0a0a0a",
    cardAlt: "#111111",
    border: "#1a1a1a",
    borderSoft: "#222222",
    text: "#ffffff",
    subText: "#888888",
    muted: "#555555",
    accent: "#D4AF37",
    accentAlt: "#b5952f",
    danger: "#ff4444",
    success: "#4CAF50",
    info: "#00c8ff",
    headerStart: "#1a1a1a",
    headerEnd: "#050505",
    buttonText: "#000000",
  },
  light: {
    mode: "light",
    bg: "#f5f1e8",
    card: "#fffdf8",
    cardAlt: "#efe4d1",
    border: "#dfd2bb",
    borderSoft: "#d5c5aa",
    text: "#221b12",
    subText: "#705f49",
    muted: "#8d7a61",
    accent: "#9a6b12",
    accentAlt: "#c4912f",
    danger: "#c63f2f",
    success: "#2f8f57",
    info: "#116f91",
    headerStart: "#fffdf8",
    headerEnd: "#efe4d1",
    buttonText: "#ffffff",
  },
};

export function resolveWebTheme(mode) {
  return webThemes[mode] || webThemes.dark;
}

export function resolveMobileTheme(mode) {
  return mobileThemes[mode] || mobileThemes.dark;
}
