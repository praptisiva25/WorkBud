"use client"; // Ensure this file is a client component

import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { ReactNode, useEffect } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  const { userId } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (userId != null) {
      // Redirect user if authenticated
      router.push("/");
    }
  }, [userId, router]);

  return (
    <div className="min-h-screen flex flex-col justify-center items-center">
      {children}
    </div>
  );
}