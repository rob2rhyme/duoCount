"use client";
import SessionProvider, { useSession } from "@/components/SessionProvider";
import PinLogin from "@/components/PinLogin";
import AppShell from "@/components/AppShell";
import Splash from "@/components/Splash";
import BrandingApplier from "@/components/BrandingApplier";

function Gate() {
  const { profile, vendor, ready } = useSession();
  if (!ready) return <Splash />;
  return profile && vendor ? <AppShell /> : <PinLogin />;
}

export default function Page() {
  return (
    <SessionProvider>
      {/* Applies the signed-in store's color palette + font + text size to <html>. */}
      <BrandingApplier />
      <Gate />
    </SessionProvider>
  );
}
