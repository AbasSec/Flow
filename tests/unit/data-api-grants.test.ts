import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const grantMigration = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260702000600_data_api_privileges.sql"
  ),
  "utf8"
);

type Privilege = "select" | "insert" | "update" | "delete";

function normalizeTableName(tableName: string): string {
  return tableName.trim().replace(/^public\./, "");
}

function tableGrantsFor(role: string, tableName: string): Set<Privilege> {
  const grants = new Set<Privilege>();
  const grantPattern =
    /grant\s+([a-z,\s]+)\s+on\s+table\s+([\s\S]*?)\s+to\s+([a-z_]+);/gi;

  for (const match of grantMigration.matchAll(grantPattern)) {
    const [, privilegeText, tableText, grantRole] = match;

    if (grantRole !== role) {
      continue;
    }

    const tables = tableText.split(",").map(normalizeTableName);

    if (!tables.includes(tableName)) {
      continue;
    }

    for (const privilege of privilegeText.split(",")) {
      grants.add(privilege.trim() as Privilege);
    }
  }

  return grants;
}

function tablesFor(role: string, privilege: Privilege): Set<string> {
  const tables = new Set<string>();
  const grantPattern =
    /grant\s+([a-z,\s]+)\s+on\s+table\s+([\s\S]*?)\s+to\s+([a-z_]+);/gi;

  for (const match of grantMigration.matchAll(grantPattern)) {
    const [, privilegeText, tableText, grantRole] = match;

    if (grantRole !== role) {
      continue;
    }

    const privileges = privilegeText.split(",").map((item) => item.trim());

    if (!privileges.includes(privilege)) {
      continue;
    }

    for (const tableName of tableText.split(",").map(normalizeTableName)) {
      tables.add(tableName);
    }
  }

  return tables;
}

const seedRequiredTables = [
  "profiles",
  "organisations",
  "sites",
  "outlets",
  "org_memberships",
  "site_memberships",
  "teams",
  "team_memberships",
  "communication_retention_policies",
  "communication_rooms",
  "room_memberships",
  "kitchen_stations",
  "menu_categories",
  "menu_items",
  "ingredients",
  "recipe_versions",
  "recipe_lines",
  "stock_lots",
  "inventory_ledger"
];

describe("Data API privilege migration", () => {
  it("grants service_role access to profiles and all seed-required tables", () => {
    for (const tableName of seedRequiredTables) {
      expect(tableGrantsFor("service_role", tableName)).toEqual(
        new Set(["select", "insert", "update"])
      );
    }
  });

  it("keeps authenticated writes narrower than service_role writes", () => {
    expect(tablesFor("authenticated", "insert")).toEqual(
      new Set([
        "communication_policy_acknowledgements",
        "messages",
        "message_reads"
      ])
    );
    expect(tablesFor("authenticated", "update")).toEqual(
      new Set(["message_reads"])
    );

    expect(tablesFor("service_role", "insert").size).toBeGreaterThan(
      tablesFor("authenticated", "insert").size
    );
    expect(tablesFor("service_role", "update").size).toBeGreaterThan(
      tablesFor("authenticated", "update").size
    );
  });

  it("does not grant anonymous or public tenant-table access", () => {
    expect(grantMigration).not.toMatch(/\bto\s+anon\b/i);
    expect(grantMigration).not.toMatch(/\bto\s+public\b/i);
    expect(grantMigration).not.toMatch(/grant\s+.*\s+to\s+PUBLIC\b/);
  });

  it("does not add broad future-table grants or weaken RLS posture", () => {
    expect(grantMigration).not.toMatch(/all\s+tables\s+in\s+schema/i);
    expect(grantMigration).not.toMatch(/default\s+privileges/i);
    expect(grantMigration).not.toMatch(/disable\s+row\s+level\s+security/i);
    expect(grantMigration).not.toMatch(/\bto\s+platform_admin/i);
  });
});
