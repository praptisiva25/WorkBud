// src/server/users.ts
import { db } from "./db";
import * as schema from "../drizzle/schema"; // adjust path if different
import { eq } from "drizzle-orm";
import { ilike, or } from "drizzle-orm";


export type UpsertUserInput = {
  id: string;                 // Clerk user id
  email?: string | null;
  displayName?: string | null;
  imageUrl?: string | null;
};

export async function upsertUser(input: UpsertUserInput) {
  const { id, email = null, displayName = null, imageUrl = null } = input;

  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.id, id))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(schema.users).values({
      id,
      email,
      displayName,
      imageUrl,
    });
  } else {
    await db
      .update(schema.users)
      .set({
        email,
        displayName,
        imageUrl,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, id));
  }
}

export async function searchUsers(query: string, limit = 20) {
  const q = query.trim();
  if (!q) return [];
  const pattern = `%${q}%`;

  const rows = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      displayName: schema.users.displayName,
      imageUrl: schema.users.imageUrl,
    })
    .from(schema.users)
    .where(
      or(
        ilike(schema.users.email, pattern),
        ilike(schema.users.displayName, pattern)
      )
    )
    .limit(limit);
  return rows;
}