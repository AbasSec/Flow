import { AutoRefresh } from "@/components/auto-refresh";
import { AppShell, StatePanel } from "@/components/flow-ui";
import { getWaiterData } from "@/lib/services/orders";
import { WaiterOrderClient } from "./waiter-order-client";

export const dynamic = "force-dynamic";

export default async function WaiterPage() {
  const result = await getWaiterData();

  if (!result.ok) {
    return (
      <AppShell
        subtitle="Table order entry is limited to operational order-entry roles."
        title="Waiter Order Entry"
      >
        <StatePanel
          title={result.reason === "forbidden" ? "Forbidden" : "Unavailable"}
          tone={result.reason === "forbidden" ? "forbidden" : "error"}
        >
          {result.message}
        </StatePanel>
      </AppShell>
    );
  }

  const { tables, menuItems } = result.data;

  return (
    <AppShell
      subtitle="Create a real table-service order from seeded BrewBite tables, menu, recipes, and stock."
      title="Waiter Order Entry"
    >
      <AutoRefresh intervalMs={8000} />
      {tables.length === 0 || menuItems.length === 0 ? (
        <StatePanel title="Empty setup">
          Seeded tables or menu items are not available yet.
        </StatePanel>
      ) : (
        <WaiterOrderClient menuItems={menuItems} tables={tables} />
      )}
    </AppShell>
  );
}
