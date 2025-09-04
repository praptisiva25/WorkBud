// src/components/SyncMe.tsx
"use client";
import { useEffect } from "react";
import { useUser } from "@clerk/nextjs";

export default function SyncMe() {
  const { isSignedIn } = useUser();
  useEffect(() => {
    if (!isSignedIn) return;
    fetch("/api/me/sync", { method: "POST" }).catch(console.error);
  }, [isSignedIn]);
  return null;
}
