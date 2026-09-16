import { Suspense } from "react";
import ResetPin from "@/components/ResetPin";

// Signed-out PIN recovery (docs/account-recovery-spec.md). Both halves live
// here: asking for a link, and spending the one that arrives by email.
export const metadata = {
  title: "DuoCount — Reset your PIN",
  description: "Reset your DuoCount PIN with your store code and confirmed recovery email.",
};

export default function ResetPage() {
  // useSearchParams needs a Suspense boundary to keep the route static-friendly.
  return <Suspense fallback={null}><ResetPin /></Suspense>;
}
