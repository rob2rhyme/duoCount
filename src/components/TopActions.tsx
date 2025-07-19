// src/components/TopActions.tsx
import React, { CSSProperties } from "react";

interface Props {
  isDetail: boolean;
  onBack: () => void;
  onAdd: () => void;
  onSignOut: () => void;
}

const ACTION_BTN: CSSProperties = {
  padding: "0.75rem",
  border: "none",
  borderRadius: "25px",
  cursor: "pointer",
  fontWeight: 900,
  textAlign: "center",
};

export default function TopActions({
  isDetail,
  onBack,
  onAdd,
  onSignOut,
}: Props) {
  return (
    <div className="buttonRow">
      {isDetail && (
        <button
          style={{ ...ACTION_BTN, background: "#718096", color: "white" }}
          onClick={onBack}
        >
          く Back
        </button>
      )}
      <button
        style={{ ...ACTION_BTN, background: "#38a169", color: "white" }}
        onClick={onAdd}
      >
        + Add Product
      </button>
      <button
        style={{ ...ACTION_BTN, background: "#4a5568", color: "white" }}
        onClick={onSignOut}
      >
        Sign Out
      </button>

      <style jsx>{`
        .buttonRow {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1rem;
          width: 100%;
        }
        .buttonRow > button {
          flex: 1 1 auto;
        }
      `}</style>
    </div>
  );
}
