// schema.ts
import {
  pgTable, pgEnum,
  text, uuid, timestamp, integer, boolean, jsonb,
  index, uniqueIndex
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/* ────────────────────────────────────────────────────────────────────────────
   ENUMS
   ──────────────────────────────────────────────────────────────────────────── */
export const messageRole = pgEnum("message_role", ["user", "assistant", "tool", "system"]); // AI chat roles
export const intentEnum = pgEnum("intent", ["note", "event", "reminder", "query", "other"]);
export const reminderStatus = pgEnum("reminder_status", ["scheduled", "sent", "snoozed", "done", "failed"]);
export const providerEnum = pgEnum("oauth_provider", ["google"]);
export const refTypeEnum = pgEnum("ref_type", ["note", "message"]);

export const threadType = pgEnum("thread_type", ["user_chat", "group_chat", "copilot"]);
export const chatMessageKind = pgEnum("chat_message_kind", ["text", "image", "file"]);
export const chatMessageSource = pgEnum("chat_message_source", ["manual", "copilot", "system"]);

export const noteAttachmentKind = pgEnum("note_attachment_kind", ["image", "video", "file"]);

/* ────────────────────────────────────────────────────────────────────────────
   USERS (Clerk user id as PK)
   ──────────────────────────────────────────────────────────────────────────── */
export const users = pgTable("users", {
  id: text("id").primaryKey(), // Clerk user id (e.g., "user_abc123")
  email: text("email").unique(),
  displayName: text("display_name"),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/* ────────────────────────────────────────────────────────────────────────────
   AI CHAT HISTORY (agentic conversations; roles user/assistant/tool/system)
   ──────────────────────────────────────────────────────────────────────────── */
export const messages = pgTable("messages", {
  id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: messageRole("role").notNull(),
  content: text("content").notNull(),
  meta: jsonb("meta_json"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  userTimeIdx: index("messages_user_created_idx").on(t.userId, t.createdAt),
}));

/* ────────────────────────────────────────────────────────────────────────────
   HUMAN↔HUMAN CHAT (threads + participants + chat messages)
   Copilot can WRITE into user threads (source='copilot'); READ rules enforced in API.
   ──────────────────────────────────────────────────────────────────────────── */
export const threads = pgTable("threads", {
  id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
  type: threadType("type").default("user_chat").notNull(), // user_chat | group_chat | copilot
  title: text("title"),
  dmKey: text("dm_key"),
  isArchived: boolean("is_archived").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  typeUpdatedIdx: index("threads_type_updated_idx").on(t.type, t.updatedAt),
  dmKeyUidx: uniqueIndex("threads_dm_key_uidx").on(t.dmKey),
}));

export const threadParticipants = pgTable("thread_participants", {
  threadId: uuid("thread_id").notNull().references(() => threads.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role"), // optional: "owner" | "member"
  joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  uniq: uniqueIndex("thread_participants_uidx").on(t.threadId, t.userId),
  userIdx: index("thread_participants_user_idx").on(t.userId),
}));

export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
  threadId: uuid("thread_id").notNull().references(() => threads.id, { onDelete: "cascade" }),
  senderId: text("sender_id").notNull().references(() => users.id, { onDelete: "restrict" }),

  source: chatMessageSource("source").default("manual").notNull(), // manual | copilot | system
  kind: chatMessageKind("kind").default("text").notNull(),         // text | image | file

  // text content (if kind === 'text')
  content: text("content"),

  // attachment fields (if kind === 'image' | 'file')
  fileUrl: text("file_url"),
  fileName: text("file_name"),
  fileSize: integer("file_size"),
  fileMeta: jsonb("file_meta"), // e.g., { mime, width, height, duration }

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  threadTimeIdx: index("chat_messages_thread_created_idx").on(t.threadId, t.createdAt),
  senderTimeIdx: index("chat_messages_sender_created_idx").on(t.senderId, t.createdAt),
}));

// Optional: read/delivered receipts per participant
export const messageReceipts = pgTable("message_receipts", {
  messageId: uuid("message_id").notNull().references(() => chatMessages.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  readAt: timestamp("read_at", { withTimezone: true }),
}, (t) => ({
  uniq: uniqueIndex("message_receipts_uidx").on(t.messageId, t.userId),
  userReadIdx: index("message_receipts_user_read_idx").on(t.userId, t.readAt),
}));

/* ────────────────────────────────────────────────────────────────────────────
   NOTES (+ attachments; notes can be created manually or by Copilot)
   ──────────────────────────────────────────────────────────────────────────── */
export const notes = pgTable("notes", {
  id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  body: text("body").notNull(),
  tags: text("tags").array(), // free-form tags/categories
  sourceMessageId: uuid("source_message_id").references(() => messages.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  userCreatedIdx: index("notes_user_created_idx").on(t.userId, t.createdAt),
}));

export const noteAttachments = pgTable("note_attachments", {
  id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
  noteId: uuid("note_id").notNull().references(() => notes.id, { onDelete: "cascade" }),
  kind: noteAttachmentKind("kind").notNull(), // image | video | file
  url: text("url").notNull(),                 // S3/Cloudinary/Supabase Storage URL
  name: text("name"),
  size: integer("size"),
  meta: jsonb("meta_json"),                   // { mime, width, height, duration, ... }
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  noteIdx: index("note_attachments_note_idx").on(t.noteId, t.createdAt),
}));

/* ────────────────────────────────────────────────────────────────────────────
   EVENTS (Google Calendar bridge)
   ──────────────────────────────────────────────────────────────────────────── */
export const events = pgTable("events", {
  id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  startAtUtc: timestamp("start_at_utc", { withTimezone: true }).notNull(),
  endAtUtc: timestamp("end_at_utc", { withTimezone: true }).notNull(),
  sourceTz: text("source_tz").notNull(),
  location: text("location"),
  description: text("description"),
  googleCalendarId: text("google_calendar_id"),
  googleEventId: text("google_event_id"),
  sourceMessageId: uuid("source_message_id").references(() => messages.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  userStartIdx: index("events_user_start_idx").on(t.userId, t.startAtUtc),
  uniqExternal: uniqueIndex("events_user_google_event_uidx").on(t.userId, t.googleEventId),
}));

/* ────────────────────────────────────────────────────────────────────────────
   REMINDERS
   ──────────────────────────────────────────────────────────────────────────── */
export const reminders = pgTable("reminders", {
  id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  body: text("body"),
  dueAtUtc: timestamp("due_at_utc", { withTimezone: true }).notNull(),
  sourceTz: text("source_tz").notNull(),
  status: reminderStatus("status").default("scheduled").notNull(),
  channelPrefs: jsonb("channel_prefs"),
  recurrenceRrule: text("recurrence_rrule"),
  sourceMessageId: uuid("source_message_id").references(() => messages.id, { onDelete: "set null" }),
  lastError: text("last_error"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  statusDueIdx: index("reminders_status_due_idx").on(t.status, t.dueAtUtc),
  userStatusIdx: index("reminders_user_status_idx").on(t.userId, t.status),
}));

/* ────────────────────────────────────────────────────────────────────────────
   DEVICE SUBSCRIPTIONS (Web Push) — optional
   ──────────────────────────────────────────────────────────────────────────── */
export const deviceSubscriptions = pgTable("device_subscriptions", {
  id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull(),
  p256dhKey: text("p256dh_key").notNull(),
  authKey: text("auth_key").notNull(),
  userAgent: text("user_agent"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  userIdx: index("device_subs_user_idx").on(t.userId),
  endpointUidx: uniqueIndex("device_subs_endpoint_uidx").on(t.endpoint),
}));

/* ────────────────────────────────────────────────────────────────────────────
   OAUTH TOKENS (Google) — optional but useful for Calendar/Gmail
   ──────────────────────────────────────────────────────────────────────────── */
export const oauthTokens = pgTable("oauth_tokens", {
  id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: providerEnum("provider").default("google").notNull(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  scope: text("scope"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  uniqUserProvider: uniqueIndex("oauth_tokens_user_provider_uidx").on(t.userId, t.provider),
}));

/* ────────────────────────────────────────────────────────────────────────────
   OBSERVABILITY (Slim agent runs) — pairs with LangSmith traces
   ──────────────────────────────────────────────────────────────────────────── */
export const agentRuns = pgTable("agent_runs", {
  id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),

  userId: text("user_id").notNull(), // (optional) add .references(() => users.id) if you want strict FK
  intent: intentEnum("intent").notNull(),

  // Optional link to the triggering AI-chat message
  sourceMessageId: uuid("source_message_id"),

  ok: boolean("ok").default(true).notNull(),
  latencyMs: integer("latency_ms").notNull(),

  // short summary for dashboards; full traces live in LangSmith/etc.
  error: text("error"),

  // Link to deep trace (or store just an ID)
  traceUrl: text("trace_url"),
  externalTraceId: text("external_trace_id"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  userIdx: index("agent_runs_user_idx").on(t.userId, t.createdAt),
  intentIdx: index("agent_runs_intent_idx").on(t.intent, t.createdAt),
  okIdx: index("agent_runs_ok_idx").on(t.ok, t.createdAt),
}));

/* ────────────────────────────────────────────────────────────────────────────
   NOTE: Enable pgcrypto once in your DB for gen_random_uuid():
   CREATE EXTENSION IF NOT EXISTS pgcrypto;
   ──────────────────────────────────────────────────────────────────────────── */
