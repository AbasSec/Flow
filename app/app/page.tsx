import { redirect } from "next/navigation";
import { signOutAction } from "./actions";
import {
  getActiveMembershipForCurrentUser,
  getAuthenticatedUser
} from "@/lib/auth/session";

export default async function AppPage() {
  const { supabase, user } = await getAuthenticatedUser();

  if (!supabase || !user) {
    redirect("/login");
  }

  const { membership } = await getActiveMembershipForCurrentUser();

  return (
    <main className="min-h-screen bg-[#f7f7f2] text-[#1f2933]">
      <section className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-6 py-16">
        <p className="mb-3 text-sm font-medium uppercase tracking-[0.18em] text-[#5f6f52]">
          Flow Workspace
        </p>
        {membership ? (
          <>
            <h1 className="text-3xl font-semibold tracking-normal">
              {membership.orgName}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[#4b5563]">
              Signed in with role{" "}
              <span className="font-semibold">{membership.role}</span>. This is
              a neutral protected workspace placeholder.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-semibold tracking-normal">
              No active organisation membership
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[#4b5563]">
              Your session is authenticated, but this route requires an active
              organisation membership before any workspace data can be shown.
            </p>
          </>
        )}
        <p className="mt-6 max-w-2xl text-sm leading-6 text-[#6b7280]">
          No orders, chat, kitchen, inventory, dashboard, reports, admin review,
          payment, QR, or business workflow UI is implemented in Milestone 2A.
        </p>
        <form action={signOutAction} className="mt-8">
          <button
            className="border border-[#1f2933] px-4 py-2 text-sm font-semibold text-[#1f2933]"
            type="submit"
          >
            Sign out
          </button>
        </form>
      </section>
    </main>
  );
}
