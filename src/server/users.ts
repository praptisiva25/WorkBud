import { db } from "./db";
import * as schema from "../drizzle/schema";
import { and, or, ilike, ne, eq } from "drizzle-orm";

export type UpsertUserInput = {
  id: string; // Clerk user id
  email?: string | null;
  displayName?: string | null;
  imageUrl?: string | null;
};

type SearchUsersOpts = {
  limit?: number;
  excludeUserId?: string; // current user id
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

/**
 * Search users (case-insensitive) by email/displayName.
 * Optionally exclude the current user.
 */
export async function searchUsers(query: string, opts: SearchUsersOpts = {}) {
  const q = query.trim();
  const limit = opts.limit ?? 20;
  if (!q) return [];

  const pattern = `%${q}%`;
  const u = schema.users;

  // If excludeUserId is provided → exclude the logged-in user
  if (opts.excludeUserId) {
    const rows = await db
      .select({
        id: u.id,
        email: u.email,
        displayName: u.displayName,
        imageUrl: u.imageUrl,
      })
      .from(u)
      .where(
        and(
          ne(u.id, opts.excludeUserId),
          or(ilike(u.email, pattern), ilike(u.displayName, pattern))
        )
      )
      .orderBy(u.displayName)
      .limit(limit);

    return rows;
  }

  // Fallback when excludeUserId not given
  const rows = await db
    .select({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      imageUrl: u.imageUrl,
    })
    .from(u)
    .where(or(ilike(u.email, pattern), ilike(u.displayName, pattern)))
    .orderBy(u.displayName)
    .limit(limit);

  return rows;
}
