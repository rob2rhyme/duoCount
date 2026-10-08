"use client";
import SessionProvider, { useSession } from "@/components/SessionProvider";
import PinLogin from "@/components/PinLogin";
import MustChangePin from "@/components/MustChangePin";
import ConfirmEmail from "@/components/ConfirmEmail";
import AppShell from "@/components/AppShell";
import Splash from "@/components/Splash";
import BrandingApplier from "@/components/BrandingApplier";
import { needsEmailConfirm } from "@/lib/verify-code";

function Gate() {
  const { profile, vendor, ready } = useSession();
  if (!ready) return <Splash />;
  if (!profile || !vendor) return <PinLogin />;
  // A PIN somebody else chose (support's temporary one) opens nothing but the
  // screen that replaces it — see MustChangePin.
  if (profile.mustChangePin) return <MustChangePin />;
  // An owner whose address is missing or unconfirmed cannot be reached — not
  // for a billing notice, not for a policy change, not to recover their own
  // PIN. Ordered AFTER mustChangePin because a credential somebody else chose
  // is the more urgent of the two.
  if (needsEmailConfirm(profile)) return <ConfirmEmail />;
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
