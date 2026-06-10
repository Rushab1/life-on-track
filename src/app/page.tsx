"use client";

import { Suspense } from "react";
import { useAuth } from "@/hooks/useAuth";
import AuthForm from "@/components/AuthForm";
import DayLogger from "@/components/DayLogger";

export default function Home() {
  const { user, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-stone-500">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return <AuthForm />;
  }

  return (
    <Suspense>
      <DayLogger userId={user.id} onSignOut={signOut} />
    </Suspense>
  );
}
