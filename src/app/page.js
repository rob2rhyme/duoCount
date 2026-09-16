"use client";
import SessionProvider, { useSession } from "@/components/SessionProvider";
import PinLogin from "@/components/PinLogin";
import MustChangePin from "@/components/MustChangePin";
import AppShell from "@/components/AppShell";
import Splash from "@/components/Splash";
import BrandingApplier from "@/components/BrandingApplier";

function Gate() {
  const { profile, vendor, ready } = useSession();
  if (!ready) return <Splash />;
  if (!profile || !vendor) return <PinLogin />;
  // A PIN somebody else chose (support's temporary one) opens nothing but the
  // screen that replaces it — see MustChangePin.
  if (profile.mustChangePin) return <MustChangePin />;
  return <AppShell />;
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
