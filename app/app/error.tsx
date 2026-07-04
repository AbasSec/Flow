"use client";

import { AppShell, StatePanel } from "@/components/flow-ui";

export default function AppError() {
  return (
    <AppShell subtitle="The workspace could not render." title="Flow Error">
      <StatePanel title="Error" tone="error">
        The workspace could not be loaded safely. Refresh and try again.
      </StatePanel>
    </AppShell>
  );
}
