import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260703000100_public_tracking_alignment.sql"
  ),
  "utf8"
);

const publicStatusPage = readFileSync(
  join(process.cwd(), "app", "order", "[publicOrderId]", "page.tsx"),
  "utf8"
);

const dashboardPage = readFileSync(
  join(process.cwd(), "app", "app", "page.tsx"),
  "utf8"
);

const publicOrderingService = readFileSync(
  join(process.cwd(), "lib", "services", "public-ordering.ts"),
  "utf8"
);

const orderDetailPage = readFileSync(
  join(process.cwd(), "app", "app", "orders", "[id]", "page.tsx"),
  "utf8"
);

describe("public tracking alignment guards", () => {
  it("maps NEW public QR tickets to ORDER_RECEIVED instead of ACCEPTED", () => {
    expect(migration).toContain("when 'NEW' then 1");
    expect(migration).toContain("when ticket_progress = 1 then 'ORDER_RECEIVED'");
    expect(migration).toContain("else 'ORDER_RECEIVED'");
    expect(migration).not.toContain("when 'SUBMITTED' then 'ACCEPTED'");
  });

  it("only exposes accepted, preparing, and ready after matching ticket progress", () => {
    expect(migration).toContain("when 'ACCEPTED' then 2");
    expect(migration).toContain("when ticket_progress = 2 then 'ACCEPTED'");
    expect(migration).toContain("when 'PREPARING' then 3");
    expect(migration).toContain("when ticket_progress = 3 then 'PREPARING'");
    expect(migration).toContain("when 'READY' then 4");
    expect(migration).toContain("when ticket_progress = 4 then 'READY'");
  });

  it("uses one neutral terminal public label aligned with internal presentation", () => {
    expect(migration).toContain(
      "when target_order.service_status in ('SERVED_OR_COLLECTED', 'COMPLETED') then 'ORDER_COMPLETE'"
    );
    expect(migration).toContain("when ticket_progress = 5 then 'ORDER_COMPLETE'");
    expect(publicStatusPage).toContain("ORDER_COMPLETE: \"Order complete\"");
    expect(publicStatusPage).not.toContain("SERVED:");
    expect(publicStatusPage).not.toContain("COLLECTED:");
    expect(publicOrderingService).toContain("function normalizePublicStatus");
    expect(publicOrderingService).toContain("status === \"SERVED\"");
    expect(publicOrderingService).toContain("status === \"COLLECTED\"");
    expect(publicOrderingService).toContain("return \"ORDER_COMPLETE\"");
    expect(orderDetailPage).toContain("SERVED_OR_COLLECTED: \"Order complete\"");
    expect(orderDetailPage).toContain("COMPLETED: \"Order complete\"");
  });

  it("keeps public tracking safe, opaque, and token scoped", () => {
    expect(migration).toContain("public_tracking_token = public_order_token");
    expect(migration).toContain("public_tracking_expires_at > now()");
    expect(migration).toContain("'table_label'");
    expect(migration).toContain("'payment_label', 'Pay at counter'");
    expect(migration).not.toContain("'order_id'");
    expect(migration).not.toContain("'ticket_id'");
    expect(migration).not.toContain("'room_id'");
    expect(migration).not.toContain("'payment_status'");
    expect(migration).not.toContain("'staff'");
  });

  it("builds dashboard QR links from a trusted origin and non-empty opaque token", () => {
    expect(dashboardPage).toContain(
      "const PRODUCTION_PUBLIC_ORIGIN = \"https://flow-ops-rho.vercel.app\""
    );
    expect(dashboardPage).toContain("process.env.NEXT_PUBLIC_APP_URL?.trim()");
    expect(dashboardPage).toContain("localhost");
    expect(dashboardPage).toContain("isValidPublicTableToken(tableQrSource?.tableToken)");
    expect(dashboardPage).toContain("/^[A-Za-z0-9_-]{32,128}$/.test(token)");
    expect(dashboardPage).toContain("`${origin}/t/${tableQrSource.tableToken}`");
    expect(dashboardPage).not.toContain("`${origin}/t/${tableQrSource?.tableToken}`");
  });

  it("uses the exact same complete tokenized URL for QR payload and open link", () => {
    expect(dashboardPage).toContain("QRCode.toDataURL(tableQrUrl");
    expect(dashboardPage).toContain("href={tableQrUrl}");
    expect(dashboardPage).toContain("Open table link");
  });

  it("hides QR and links when no active unexpired opaque token exists", () => {
    expect(publicOrderingService).toContain(".in(\"status\", [\"AVAILABLE\", \"OPEN\"])");
    expect(publicOrderingService).toContain(".not(\"public_token_expires_at\", \"is\", null)");
    expect(publicOrderingService).toContain(".gt(\"public_token_expires_at\", new Date().toISOString())");
    expect(publicOrderingService).toContain("isValidPublicTableToken(row?.public_table_token)");
    expect(dashboardPage).toContain("tableQrSource && tableQrDataUrl && tableQrUrl");
    expect(dashboardPage).toContain("Table QR links will appear here");
  });

  it("preserves public RPC grant hardening without direct anonymous table grants", () => {
    expect(migration).toContain(
      "security definer\nset search_path = pg_catalog, pg_temp"
    );
    expect(migration).toContain(
      "revoke all on function public.flow_m4_public_order_status(text) from public"
    );
    expect(migration).toContain(
      "revoke all on function public.flow_m4_public_order_status(text) from anon"
    );
    expect(migration).toContain(
      "revoke all on function public.flow_m4_public_order_status(text) from authenticated"
    );
    expect(migration).toContain(
      "grant execute on function public.flow_m4_public_order_status(text) to anon, authenticated"
    );
    expect(migration).not.toMatch(/grant\s+(select|insert|update|delete|usage)[\s\S]+to\s+anon/i);
  });
});
