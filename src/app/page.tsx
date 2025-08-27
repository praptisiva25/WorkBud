"use client"; 

import { Button } from "../components/ui/button";
import { SignInButton, SignUpButton, UserButton, useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function HomePage() {
  const { userId, isLoaded } = useAuth(); 
  const router = useRouter();

  useEffect(() => {
    
    if (isLoaded && userId != null) {
      router.push("/events");
    }
  }, [isLoaded, userId, router]); 

  if (!isLoaded) {
    return <div>Loading...</div>; 
  }

  return (
    <div className="min-h-screen bg-[url('/bggray.png')] bg-cover bg-center flex items-center justify-center">
    <div className="text-center container my-4 mx-0">
      <h1 className="text-5xl font-serif mb-4">Welcome To Calen</h1>
      <div className="flex gap-2 justify-center">
        <Button asChild>
          <SignInButton />
        </Button>
        <Button asChild>
          <SignUpButton />
        </Button>
        <UserButton />
      </div>
    </div>
    </div>
   
  );
}