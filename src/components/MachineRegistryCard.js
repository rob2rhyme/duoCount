"use client";
import { useState } from "react";
import { useLang } from "./LangProvider";
import { useSession } from "./SessionProvider";
import { addMachine, updateMachine } from "@/lib/data";
import { normalizeMachine, MACHINE_TYPES, CADENCES, DEFAULT_STORE_PCT } from "@/lib/gaming";
import Field from "./Field";

// Owner card: register each gaming/amusement machine the store hosts — its name,
// the company that owns it, the machine type, the store's split %, and the
// collection cadence. Config like drawers/items (client SDK, owner-only rules,
// soft-disable never delete). The collection ledger reads these contract terms
// server-side, so a machine's split can't be forged from the entry form.
const EMPTY = { name: "", company: "", type: "slot", storePct: String(DEFAULT_STORE_PCT), cadence: "weekly" };

export default function MachineRegistryCard({ machines = [], onToast }) {
  const { t } = useLang();
  const { vendor } = useSession();
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const reset = () => { setForm(EMPTY); setEditId(null); };
  const startEdit = (m) => {
    setForm({ name: m.name ?? "", company: m.company ?? "", type: m.type ?? "other",
      storePct: String(m.storePct ?? DEFAULT_STORE_PCT), cadence: m.cadence ?? "weekly" });
    setEditId(m.id);
  };

  const submit = async () => {
    const v = normalizeMachine(form);
    if (!v.ok) { onToast?.(t(`mach.err_${v.code}`)); return; }
    setBusy(true);
    try {
      if (editId) {
        await updateMachine(vendor.id, editId, v.value);
        onToast?.(t("mach.toast_saved", { name: v.value.name }));
      } else {
        await addMachine(vendor.id, v.value);
        onToast?.(t("mach.toast_added", { name: v.value.name }));
      }
      reset();
    } catch (err) {
      onToast?.(err.message);
    } finally { setBusy(false); }
  };

  const toggleActive = async (m) => {
    setBusy(true);
    try {
      const active = m.active === false;
      await updateMachine(vendor.id, m.id, { active });
      onToast?.(t(active ? "mach.toast_enabled" : "mach.toast_disabled", { name: m.name }));
      if (editId === m.id && !active) reset();
    } catch (err) {
      onToast?.(err.message);
    } finally { setBusy(false); }
  };

  return (
    <div id="adm-machines" className="card overflow-hidden scroll-mt-[calc(max(0.75rem,env(safe-area-inset-top))+100px)]">
      <div className="px-4 py-3.5 border-b border-line">
        <h2 className="font-semibold text-[15px]">{t("mach.title")}</h2>
        <p className="text-[13px] text-muted mt-0.5">{t("mach.sub")}</p>
      </div>

      <div className="p-4 border-b border-line bg-panel space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("mach.f_name")}>
            <input className="input" value={form.name} onChange={set("name")} placeholder={t("mach.ph_name")} />
          </Field>
          <Field label={t("mach.f_company")}>
            <input className="input" value={form.company} onChange={set("company")} placeholder={t("mach.ph_company")} />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label={t("mach.f_type")}>
            <select className="input" value={form.type} onChange={set("type")}>
              {MACHINE_TYPES.map((ty) => <option key={ty} value={ty}>{t(`mach.type_${ty}`)}</option>)}
            </select>
          </Field>
          <Field label={t("mach.f_pct")} hint={t("mach.pct_hint")}>
            <input className="input" inputMode="numeric" value={form.storePct} onChange={set("storePct")} placeholder="50" />
          </Field>
          <Field label={t("mach.f_cadence")}>
            <select className="input" value={form.cadence} onChange={set("cadence")}>
              {CADENCES.map((cd) => <option key={cd} value={cd}>{t(`mach.cad_${cd}`)}</option>)}
            </select>
          </Field>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-primary" disabled={busy} onClick={submit}>
            {editId ? t("mach.save") : t("mach.add")}
          </button>
          {editId && <button type="button" className="btn-ghost" disabled={busy} onClick={reset}>{t("mach.cancel")}</button>}
        </div>
        <p className="text-xs text-muted leading-relaxed">{t("mach.help")}</p>
      </div>

      <div className="p-4">
        {machines.length === 0 ? (
          <p className="text-sm text-muted">{t("mach.empty")}</p>
        ) : (
          machines.map((m) => (
            <div key={m.id} className="flex items-center gap-3 py-2 border-b border-line last:border-0">
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium truncate block">
                  {m.name} {m.active === false && <span className="text-xs text-muted font-normal">· {t("mach.disabled")}</span>}
                </span>
                <span className="text-xs text-muted">
                  {m.company} · {t(`mach.type_${MACHINE_TYPES.includes(m.type) ? m.type : "other"}`)} · {t("mach.split_label", { pct: m.storePct ?? DEFAULT_STORE_PCT })} · {t(`mach.cad_${CADENCES.includes(m.cadence) ? m.cadence : "weekly"}`)}
                </span>
              </div>
              <button type="button" className="btn-ghost text-[13px] px-2.5 py-1" disabled={busy}
                onClick={() => startEdit(m)}>{t("mach.edit")}</button>
              <button type="button" className="btn-ghost text-[13px] px-2.5 py-1" disabled={busy}
                onClick={() => toggleActive(m)}>{m.active === false ? t("mach.enable") : t("mach.disable")}</button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
