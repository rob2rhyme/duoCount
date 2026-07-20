"use client";
import { useMemo, useState } from "react";
import { useLang } from "./LangProvider";
import { apiCatalog } from "@/lib/data";
import { normalizeGameEntry } from "@/lib/catalog-entry";
import { money } from "@/lib/utils";
import { searchTerms, matchesTerms } from "@/lib/text-match";
import Field from "./Field";
import ShowMore, { usePaged } from "./ShowMore";

// Owner card: type the scratch games this store sells (game #, name, ticket
// price, tickets-per-pack) so a scan or a typed pack fills the Game name +
// Ticket price on its own — the same per-store catalog the CSV "games" import
// writes, just entered by hand. Pure reference data: it never carries a count
// or an audited ticket number. Mounted only when the scratch module is on and
// only inside Admin (owner-only), so no extra role gate is needed here.
const EMPTY = { game: "", name: "", price: "", perPack: "" };

export default function ScratchGamesCard({ scratchCatalog = null, onToast }) {
  const { t } = useLang();
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(false); // editing an existing game #
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const list = Object.entries(scratchCatalog || {}).map(([game, g]) => ({ game, ...g }));
    list.sort((a, b) => Number(b.game) - Number(a.game)); // newest game # first
    return list;
  }, [scratchCatalog]);
  const terms = useMemo(() => searchTerms(q), [q]);
  const shown = useMemo(
    () => (terms.length ? rows.filter((r) => matchesTerms(`${r.game} ${r.name}`, terms)) : rows),
    [rows, terms]
  );
  const page = usePaged(shown, { resetKey: q });

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const reset = () => { setForm(EMPTY); setEditing(false); };
  const startEdit = (r) => {
    setForm({ game: r.game, name: r.name ?? "", price: r.price ?? "", perPack: r.perPack ?? "" });
    setEditing(true);
    if (typeof window !== "undefined") window.scrollTo({ top: document.getElementById("adm-games")?.offsetTop ?? 0, behavior: "smooth" });
  };

  const submit = async () => {
    const v = normalizeGameEntry(form);
    if (!v.ok) { onToast?.(t(`games.err_${v.code}`)); return; }
    setBusy(true);
    try {
      await apiCatalog({ action: "upsert", game: form.game, name: form.name, price: form.price, perPack: form.perPack });
      onToast?.(t(editing ? "games.toast_saved" : "games.toast_added", { game: v.game }));
      reset();
    } catch (err) {
      onToast?.(err.message);
    } finally { setBusy(false); }
  };

  const remove = async (r) => {
    if (typeof window !== "undefined" && !window.confirm(t("games.confirm_remove", { game: r.game, name: r.name })))
      return;
    setBusy(true);
    try {
      await apiCatalog({ action: "remove", game: r.game });
      onToast?.(t("games.toast_removed", { game: r.game }));
      if (form.game === r.game) reset();
    } catch (err) {
      onToast?.(err.message);
    } finally { setBusy(false); }
  };

  return (
    <div id="adm-games" className="card overflow-hidden scroll-mt-[calc(max(0.75rem,env(safe-area-inset-top))+100px)]">
      <div className="px-4 py-3.5 border-b border-line">
        <h2 className="font-semibold text-[15px]">{t("games.title")}</h2>
        <p className="text-[13px] text-muted mt-0.5">{t("games.sub")}</p>
      </div>

      <div className="p-4 border-b border-line bg-panel space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("games.f_game")}>
            <input className="input font-mono" inputMode="numeric" value={form.game}
              onChange={set("game")} disabled={editing} placeholder="1801" />
          </Field>
          <Field label={t("games.f_price")}>
            <input className="input" inputMode="decimal" value={form.price}
              onChange={set("price")} placeholder="5" />
          </Field>
        </div>
        <Field label={t("games.f_name")}>
          <input className="input" value={form.name} onChange={set("name")} placeholder={t("games.ph_name")} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("games.f_perpack")} hint={t("games.perpack_hint")}>
            <input className="input" inputMode="numeric" value={form.perPack}
              onChange={set("perPack")} placeholder="100" />
          </Field>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-primary" disabled={busy} onClick={submit}>
            {editing ? t("games.save") : t("games.add")}
          </button>
          {editing && (
            <button type="button" className="btn-ghost" disabled={busy} onClick={reset}>{t("games.cancel")}</button>
          )}
        </div>
        <p className="text-xs text-muted leading-relaxed">{t("games.help")}</p>
      </div>

      <div className="p-4">
        {rows.length > 0 && (
          <input className="input mb-3" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={t("games.search_ph")} aria-label={t("games.search_ph")} />
        )}
        {shown.length === 0 ? (
          <p className="text-sm text-muted">{rows.length === 0 ? t("games.empty") : t("games.no_match")}</p>
        ) : (
          <>
            {page.visible.map((r) => (
              <div key={r.game} className="flex items-center gap-3 py-2 border-b border-line last:border-0">
                <span className="font-mono text-sm text-muted w-14 flex-shrink-0">{r.game}</span>
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium truncate block">{r.name}</span>
                  <span className="text-xs text-muted">
                    {money(r.price)}{r.perPack ? ` · ${t("games.n_tickets", { n: r.perPack })}` : ""}
                  </span>
                </div>
                <button type="button" className="btn-ghost text-[13px] px-2.5 py-1" disabled={busy}
                  onClick={() => startEdit(r)}>{t("games.edit")}</button>
                <button type="button" className="btn-ghost text-[13px] px-2.5 py-1 text-neg" disabled={busy}
                  onClick={() => remove(r)}>{t("games.remove")}</button>
              </div>
            ))}
            <ShowMore hasMore={page.hasMore} nextStep={page.nextStep} onMore={page.showMore} />
          </>
        )}
      </div>
    </div>
  );
}
