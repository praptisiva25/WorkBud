ALTER TABLE "threads" ADD COLUMN "dm_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "threads_dm_key_uidx" ON "threads" USING btree ("dm_key");