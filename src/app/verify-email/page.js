import { Suspense } from "react";
import VerifyEmail from "@/components/VerifyEmail";

// Confirms the recovery address on an account — the step that makes a
// self-serve PIN reset possible (docs/account-recovery-spec.md).
export const metadata = {
  title: "DuoCount — Confirm your email",
  description: "Confirm the recovery email on your DuoCount account.",
};

export default function VerifyEmailPage() {
  return <Suspense fallback={null}><VerifyEmail /></Suspense>;
}
