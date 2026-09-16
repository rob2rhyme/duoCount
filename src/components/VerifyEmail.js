"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import RecoveryShell from "./RecoveryShell";
import { useLang } from "./LangProvider";
import { CATALOG } from "@/lib/i18n";
import { apiVerifyEmail } from "@/lib/data";

// Confirm a recovery address. Signed out on purpose: the link is opened from a
// mailbox, often on a different device from the one the app is installed on.
export default function VerifyEmail() {
  const { t } = useLang();
  const token = useSearchParams().get("t") || "";
  const [state, setState] = useState("checking"); // checking | ok | failed
  const [email, setEmail] = useState("");
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!token) { setState("failed"); setErr({ code: "link_missing" }); return undefined; }
    let live = true;
    apiVerifyEmail(token)
      .then((r) => { if (live) { setEmail(r.email || ""); setState("ok"); } })
      .catch((e) => { if (live) { setErr(e); setState("failed"); } });
    return () => { live = false; };
  }, [token]);

  const errText = (e) => (e?.code && CATALOG.en[`autherr.${e.code}`]
    ? t(`autherr.${e.code}`) : e?.message || String(e || ""));

  if (state === "checking") return <RecoveryShell title={t("verify.title")}><span /></RecoveryShell>;

  if (state === "ok") {
    return (
      <RecoveryShell title={t("verify.ok_title")} sub={t("verify.ok_body", { email })}>
        <Link href="/" className="btn-primary inline-flex justify-center w-full">{t("verify.back")}</Link>
      </RecoveryShell>
    );
  }

  return (
    <RecoveryShell title={t("verify.failed_title")} sub={errText(err)}>
      <Link href="/" className="btn-primary inline-flex justify-center w-full">{t("verify.back")}</Link>
    </RecoveryShell>
  );
}
