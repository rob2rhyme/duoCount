import HelpDesk from "@/components/HelpDesk";

// Public "can't sign in?" page — the in-store fixes first, then the signed-out
// route to support for the one case the app can't fix by itself
// (docs/account-recovery-spec.md).
export const metadata = {
  title: "DuoCount — Can't sign in?",
  description: "What to do if you've forgotten your DuoCount PIN, and how to reach support.",
};

export default function HelpPage() {
  return <HelpDesk />;
}
