export const THEME_STORAGE_KEY = "elhadidy-web-theme-mode";

export const webThemes = {
  dark: {
    mode: "dark",
    bg: "#0F1115",
    surface: "#171A21",
    surfaceAlt: "#20242D",
    card: "#171A21",
    border: "#C9A24D",
    borderSoft: "#2A2F3A",
    text: "#F5F7FA",
    subText: "#B8C0CC",
    muted: "#8B93A1",
    accent: "#C9A24D",
    accentAlt: "#F0D27A",
    danger: "#E5484D",
    success: "#22C55E",
    info: "#38BDF8",
    buttonText: "#101216",
    overlay: "rgba(15,17,21,0.92)",
    gradient: "linear-gradient(135deg, #C9A24D, #F0D27A)",
    panelGradient: "linear-gradient(135deg, #171A21, #101216)",
  },
  light: {
    mode: "light",
    bg: "#F6F7FB",
    surface: "#FFFFFF",
    surfaceAlt: "#F1F4F8",
    card: "#FFFFFF",
    border: "#B7791F",
    borderSoft: "#CBD5E1",
    text: "#111827",
    subText: "#4B5563",
    muted: "#7C8796",
    accent: "#9A5F00",
    accentAlt: "#D6A531",
    danger: "#D93025",
    success: "#15803D",
    info: "#0B6B99",
    buttonText: "#FFFFFF",
    overlay: "rgba(17,24,39,0.60)",
    gradient: "linear-gradient(135deg, #9A5F00, #D6A531)",
    panelGradient: "linear-gradient(135deg, #FFFFFF, #EEF2F7)",
  },
};

export function resolveWebTheme(mode) {
  return webThemes[mode] || webThemes.dark;
}
