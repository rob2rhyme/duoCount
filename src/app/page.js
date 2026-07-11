"use client";
import SessionProvider, { useSession } from "@/components/SessionProvider";
import PinLogin from "@/components/PinLogin";
import AppShell from "@/components/AppShell";

function Gate() {
  const { profile, vendor, ready } = useSession();
  if (!ready) return <div className="min-h-screen grid place-items-center text-neutral-500">Loading…</div>;
  return profile && vendor ? <AppShell /> : <PinLogin />;
}

export default function Page() {
  return (
    <SessionProvider>
      <Gate />
    </SessionProvider>
  );
}
