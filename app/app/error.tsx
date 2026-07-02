"use client";

import { AppShell, StatePanel } from "@/components/flow-ui";

export default function AppError({ error }: { error: Error }) {
  return (
    <AppShell subtitle="The workspace could not render." title="Flow Error">
      <StatePanel title="Error" tone="error">
        {error.message}
      </StatePanel>
    </AppShell>
  );
}
