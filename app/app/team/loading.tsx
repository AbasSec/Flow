import { AppShell, StatePanel } from "@/components/flow-ui";

export default function Loading() {
  return (
    <AppShell
      reserveCounterSlot
      reserveMenuSlot
      reserveTeamSlot
      subtitle="Loading team roster."
      title="Team"
    >
      <StatePanel title="Loading">Fetching workspace members.</StatePanel>
    </AppShell>
  );
}
