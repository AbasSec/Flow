import { AppShell, StatePanel } from "@/components/flow-ui";

export default function Loading() {
  return (
    <AppShell subtitle="Refreshing committed database state." title="Loading Flow">
      <StatePanel title="Loading">Fetching the latest workspace state.</StatePanel>
    </AppShell>
  );
}
