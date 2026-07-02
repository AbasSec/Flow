import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "supabase", "migrations");

function migrationText(): string {
  return readdirSync(migrationsDir)
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort()
    .map((fileName) => readFileSync(join(migrationsDir, fileName), "utf8"))
    .join("\n");
}

describe("database migration static validation", () => {
  it("preserves separate site and outlet primary keys with unique outlet site mapping", () => {
    const sql = migrationText();

    expect(sql).toContain("create table public.sites");
    expect(sql).toContain("create table public.outlets");
    expect(sql).toContain("site_id uuid not null unique references public.sites(id)");
  });

  it("keeps payment callback and P1 communication tables out of Milestone 2A", () => {
    const sql = migrationText();

    expect(sql).not.toMatch(/create table public\.payment_attempts/i);
    expect(sql).not.toMatch(/create table public\.payment_callbacks/i);
    expect(sql).not.toMatch(/create table public\.message_attachments/i);
    expect(sql).not.toMatch(/create table public\.message_mentions/i);
  });

  it("enables RLS for tenant-owned foundation tables", () => {
    const sql = migrationText();

    for (const tableName of [
      "organisations",
      "communication_rooms",
      "messages",
      "orders",
      "inventory_ledger"
    ]) {
      expect(sql).toContain(
        `alter table public.${tableName} enable row level security`
      );
    }
  });
});
