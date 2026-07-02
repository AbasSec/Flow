import "server-only";

import { createSupabaseServerClient } from "@/lib/db/server";
import type { ActiveMembershipSummary } from "@/lib/auth/access";

type MembershipRow = {
  org_id: string;
  role: string;
  organisations: { name: string } | { name: string }[] | null;
};

function getOrganisationName(
  organisations: MembershipRow["organisations"]
): string {
  if (Array.isArray(organisations)) {
    return organisations[0]?.name ?? "Organisation";
  }

  return organisations?.name ?? "Organisation";
}

export async function getAuthenticatedUser() {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return { supabase: null, user: null };
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  return { supabase, user };
}

export async function getActiveMembershipForCurrentUser(): Promise<{
  membership: ActiveMembershipSummary | null;
  isConfigured: boolean;
}> {
  const { supabase, user } = await getAuthenticatedUser();

  if (!supabase || !user) {
    return { membership: null, isConfigured: Boolean(supabase) };
  }

  const { data, error } = await supabase
    .from("org_memberships")
    .select("org_id, role, organisations(name)")
    .eq("user_id", user.id)
    .is("deactivated_at", null)
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return { membership: null, isConfigured: true };
  }

  const row = data as MembershipRow;

  return {
    isConfigured: true,
    membership: {
      orgId: row.org_id,
      orgName: getOrganisationName(row.organisations),
      role: row.role
    }
  };
}
