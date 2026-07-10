// src/components/ThemeToggle.tsx
import React from "react";
import { useTheme } from "@/context/ThemeContext";
import styles from "@/styles/Header.module.css";

const ICON: Record<string, string> = {
  system: "🖥️",
  light: "☀️",
  dark: "🌙",
};

const LABEL: Record<string, string> = {
  system: "System theme",
  light: "Light theme",
  dark: "Dark theme",
};

const ThemeToggle: React.FC = () => {
  const { theme, cycle } = useTheme();
  return (
    <button
      className={styles.themeToggle}
      onClick={cycle}
      title={`${LABEL[theme]} (click to change)`}
      aria-label={`${LABEL[theme]} — click to change`}
    >
      <span aria-hidden>{ICON[theme]}</span>
    </button>
  );
};

export default ThemeToggle;
