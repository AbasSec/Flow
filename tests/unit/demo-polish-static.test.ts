import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const routeFiles = [
  "app/page.tsx",
  "app/app/page.tsx",
  "app/app/waiter/page.tsx",
  "app/app/waiter/waiter-order-client.tsx",
  "app/app/kitchen/page.tsx",
  "app/app/connect/page.tsx",
  "app/app/orders/[id]/page.tsx",
  "app/t/[tableToken]/page.tsx",
  "app/t/[tableToken]/public-menu-client.tsx",
  "app/order/[publicOrderId]/page.tsx"
] as const;

const routeSource = routeFiles
  .map((file) => readFileSync(join(process.cwd(), file), "utf8"))
  .join("\n");

describe("demo polish presentation boundaries", () => {
  it("keeps the root page free of milestone and bootstrap wording", () => {
    const rootPage = readFileSync(join(process.cwd(), "app", "page.tsx"), "utf8");

    expect(rootPage).toContain("Flow for F&B");
    expect(rootPage).toContain("Staff sign in");
    expect(rootPage).toContain('href="/login"');
    expect(rootPage.toLowerCase()).not.toContain("milestone");
    expect(rootPage.toLowerCase()).not.toContain("bootstrap");
    expect(rootPage).not.toContain("No Supabase project");
  });

  it("humanizes dashboard enum labels for judge-facing presentation", () => {
    const dashboard = readFileSync(
      join(process.cwd(), "app", "app", "page.tsx"),
      "utf8"
    );

    expect(dashboard).toContain("ORGANISATION_OWNER: \"Owner\"");
    expect(dashboard).toContain(
      "KITCHEN_TICKET_STATUS_CHANGED: \"Kitchen ticket updated\""
    );
    expect(dashboard).toContain("SERVED_OR_COLLECTED: \"Served / collected\"");
    expect(dashboard).toContain("COMPLETED: \"Completed\"");
    expect(dashboard).toContain("kitchen_tickets: \"Kitchen operations\"");
    expect(dashboard).toContain("<RoleBadge>{formatRole(data.context.role)}</RoleBadge>");
    expect(dashboard).toContain("function RoleBadge");
    expect(dashboard).toContain("formatStatus(order.serviceStatus)");
    expect(dashboard).toContain("formatActivity(event.action)");
    expect(dashboard).toContain("formatObjectType(event.objectType)");
  });

  it("keeps judge-facing demo routes free of seeded setup wording", () => {
    expect(routeSource.toLowerCase()).not.toContain("seeded");
  });

  it("keeps public QR ordering framed as pay-at-counter service", () => {
    const publicMenu = readFileSync(
      join(process.cwd(), "app", "t", "[tableToken]", "public-menu-client.tsx"),
      "utf8"
    );
    const publicStatus = readFileSync(
      join(process.cwd(), "app", "order", "[publicOrderId]", "page.tsx"),
      "utf8"
    );

    expect(publicMenu).toContain("pay at counter");
    expect(publicStatus).toContain("Payment is due at the counter");
    expect(`${publicMenu}\n${publicStatus}`.toLowerCase()).not.toContain("billplz");
    expect(`${publicMenu}\n${publicStatus}`.toLowerCase()).not.toContain("gateway");
  });

  it("uses touch-sized controls and keyboard focus states on polished routes", () => {
    expect(routeSource).toContain("min-h-11");
    expect(routeSource).toContain("min-h-12");
    expect(routeSource).toContain("focus-visible:ring-2");
  });
});
