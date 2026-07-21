"use client";
import { useEffect } from "react";

// Last-resort boundary: catches errors thrown by the root layout itself, where
// the normal error.js can't help. It REPLACES the layout, so it must render its
// own <html>/<body> and can't rely on the theme, Tailwind, or LangProvider being
// available — hence inline styles and a short bilingual (EN / ES) message rather
// than t(). Kept deliberately minimal so it can't itself throw.
export default function GlobalError({ error, reset }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "#101511", color: "#e8eee9", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", padding: "24px" }}>
        <div style={{ maxWidth: "360px", textAlign: "center" }}>
          <div style={{ fontSize: "40px", marginBottom: "8px" }} aria-hidden="true">⚠️</div>
          <h1 style={{ fontSize: "18px", margin: "0 0 8px" }}>Something went wrong</h1>
          <p style={{ fontSize: "14px", lineHeight: 1.6, color: "#a2a5a3", margin: "0 0 6px" }}>
            The app hit an unexpected error. Please try again.
          </p>
          <p style={{ fontSize: "13px", lineHeight: 1.6, color: "#a2a5a3", margin: "0 0 20px" }}>
            La aplicación tuvo un error inesperado. Inténtalo de nuevo.
          </p>
          <button onClick={() => reset()} style={{ appearance: "none", border: "none", cursor: "pointer",
            background: "#14532d", color: "#ffffff", fontSize: "15px", fontWeight: 600, padding: "11px 20px", borderRadius: "10px" }}>
            Try again · Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
