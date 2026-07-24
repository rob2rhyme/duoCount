"use client";
import { useRef, useState } from "react";
import { addScratchCensus } from "@/lib/data";
import { parseScratchBarcode, packIdFromParts, packDisplayParts } from "@/lib/scratch-barcode";
import { useSaveState } from "@/lib/use-save-state";
import { useSession } from "./SessionProvider";
import { useLang } from "./LangProvider";
import BarcodeScanner from "./BarcodeScanner";
import SaveError from "./SaveError";
import Field from "./Field";

const today = () => new Date().toISOString().slice(0, 10);
const packLabel = (id) => { const { gameNo, bookNo } = packDisplayParts(id); return gameNo ? `${gameNo}-${bookNo}` : bookNo || id; };

// "Books on hand" census: scan (or type) every scratch book physically present
// and save ONE signed, server-timed snapshot. The owner report reconciles it
// against the counts to catch a book that walked — including one never even
// ticket-counted, the blind spot a shift-boundary count can't see. Capture only;
// the reconcile lives in the owner ScratchReport.
export default function ScratchCensus({ locations = [], locName = () => "" }) {
  const { profile, vendor, isManager } = useSession();
  const { t } = useLang();
  const lockedLoc = !isManager && profile.locationId ? profile.locationId : null;
  const [locationId, setLocationId] = useState(lockedLoc || locations[0]?.id || "");
  const [packs, setPacks] = useState([]);        // canonical pack IDs, scan order
  const [scanOpen, setScanOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [gameNo, setGameNo] = useState("");
  const [book, setBook] = useState("");
  const { busy, error, run } = useSaveState();
  const seenRef = useRef(new Set());

  const addPack = (raw) => {
    const pack = String(raw || "").trim();
    if (!pack) return false;
    if (seenRef.current.has(pack)) { setStatus(t("census.dup", { pack: packLabel(pack) })); return false; }
    seenRef.current.add(pack);
    setPacks((p) => [...p, pack]);
    setStatus(t("census.added", { pack: packLabel(pack) }));
    return true;
  };
  const onScan = (code) => { const parsed = parseScratchBarcode(code); addPack(parsed?.pack || code); };
  const addManual = () => { if (addPack(packIdFromParts(gameNo, book))) { setGameNo(""); setBook(""); } };
  const removeAt = (i) => { const id = packs[i]; seenRef.current.delete(id); setPacks((p) => p.filter((_, j) => j !== i)); };

  const save = async () => {
    if (!packs.length || !locationId) return;
    const n = packs.length;
    await addScratchCensus(vendor.id, {
      packs, locationId, locationName: locName(locationId),
      by: profile.name, byId: profile.id, byRole: profile.role, date: today(),
    });
    setPacks([]); seenRef.current = new Set();
    setStatus(t("census.saved", { n }));
  };

  return (
    <div className="p-4 space-y-3.5">
      <div>
        <h3 className="font-semibold text-[15px]">{t("census.title")}</h3>
        <p className="text-[12px] text-muted mt-0.5">{t("census.sub")}</p>
      </div>
      <Field label={t("common.location")}>
        <select className="input" value={locationId} onChange={(e) => setLocationId(e.target.value)} disabled={!!lockedLoc}>
          {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </Field>
      <button type="button" className="btn-primary w-auto" onClick={() => setScanOpen(true)}>📷 {t("census.scan_btn")}</button>

      {/* Manual add for a book that won't scan */}
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
        <Field label={t("census.game_label")}><input className="input font-mono" inputMode="numeric" value={gameNo} onChange={(e) => setGameNo(e.target.value)} placeholder="1792" /></Field>
        <Field label={t("census.book_label")}><input className="input font-mono" inputMode="numeric" value={book} onChange={(e) => setBook(e.target.value)} placeholder="0011361" /></Field>
        <button type="button" className="btn-ghost w-auto" onClick={addManual} disabled={!book.trim()}>{t("census.add")}</button>
      </div>
      {status && <p className="text-[12px] text-muted" role="status">{status}</p>}

      {/* Running list of scanned books */}
      <div className="card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-line text-[13px] font-semibold">{t("census.count", { n: packs.length })}</div>
        {packs.length === 0 ? (
          <div className="px-4 py-6 text-center text-[13px] text-muted">{t("census.empty")}</div>
        ) : (
          <ul className="divide-y divide-line-soft max-h-72 overflow-y-auto">
            {packs.map((id, i) => (
              <li key={`${id}-${i}`} className="px-4 py-2 flex items-center justify-between gap-3 text-[13px]">
                <span className="font-mono tabular-nums truncate">{packLabel(id)}</span>
                <button type="button" className="text-neg text-[12px] flex-shrink-0" onClick={() => removeAt(i)}>{t("census.remove")}</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <SaveError message={error} onRetry={() => run(save)} busy={busy} />
      <button type="button" className="btn-primary" disabled={busy || !packs.length || !locationId} onClick={() => run(save)}>
        {busy ? t("common.saving") : t("census.save")}
      </button>

      <BarcodeScanner open={scanOpen} onClose={() => setScanOpen(false)}
        continuous status={status}
        title={t("census.scan_title")} hint={t("census.scan_hint")}
        onDetected={onScan} />
    </div>
  );
}
