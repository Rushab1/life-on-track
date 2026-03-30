"use client";

import { useAuth } from "@/hooks/useAuth";
import AuthForm from "@/components/AuthForm";
import DayLogger from "@/components/DayLogger";

export default function Home() {
  const { user, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return <AuthForm />;
  }

  return <DayLogger userId={user.id} onSignOut={signOut} />;
}
