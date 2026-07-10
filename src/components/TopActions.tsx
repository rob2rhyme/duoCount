// src/components/TopActions.tsx
import React, { CSSProperties } from "react";
import { appConfig } from "@/config/app.config";

interface Props {
  isDetail: boolean;
  canAdd: boolean;
  onBack: () => void;
  onAdd: () => void;
}

const ACTION_BTN: CSSProperties = {
  padding: "0.75rem",
  border: "none",
  borderRadius: "25px",
  cursor: "pointer",
  fontWeight: 900,
  textAlign: "center",
};

export default function TopActions({ isDetail, canAdd, onBack, onAdd }: Props) {
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
      {canAdd && (
        <button
          style={{ ...ACTION_BTN, background: "#38a169", color: "white" }}
          onClick={onAdd}
        >
          + Add {appConfig.labels.item}
        </button>
      )}

      <style jsx>{`
        .buttonRow {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 0.5rem;
          width: 100%;
        }
        .buttonRow > button {
          flex: 1 1 auto;
        }
      `}</style>
    </div>
  );
}
