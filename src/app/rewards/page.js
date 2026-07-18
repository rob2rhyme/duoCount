import BalanceCheck from "@/components/BalanceCheck";

// Public, customer-facing rewards balance check (rewards-program-spec.md,
// Phase 3) — a short URL a clerk can say out loud. No sign-in: the /api
// endpoint is rate-limited and returns only the balance, never a name.
export const metadata = {
  title: "DuoCount — Rewards balance",
  description: "Check your rewards points balance with your store code and phone number.",
};

export default function RewardsBalancePage() {
  return <BalanceCheck />;
}
