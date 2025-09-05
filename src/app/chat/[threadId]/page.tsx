"use client";
import { use } from "react";
import ThreadClient from "./ThreadClient";

export default function Page(
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = use(params); // unwrap the promise
  return <ThreadClient threadId={threadId} />;
}
