import { AppShell, Badge, StatePanel, Surface } from "@/components/flow-ui";
import {
  TEAM_ADMIN_ROLES,
  TEAM_VISIBLE_ROLES,
  getOrgStaff,
  type OrgRole,
  type OutletAssignment,
  type StaffMember,
  type StationAssignment
} from "@/lib/services/people";
import { requireAdminClient, requireWorkspaceContext, roleIn } from "@/lib/services/context";
import {
  addMemberAction,
  assignOutletAction,
  assignStationAction,
  deactivateMemberAction,
  reactivateMemberAction,
  removeOutletAction,
  revokeStationAction,
  updateMemberRoleAction
} from "./actions";

export const dynamic = "force-dynamic";

type OutletRow = { id: string; name: string };
type StationRow = { id: string; outlet_id: string; name: string };

const ROLE_LABELS: Record<OrgRole, string> = {
  organisation_owner: "Owner",
  organisation_admin: "Admin",
  manager: "Manager",
  cashier: "Cashier",
  waiter: "Waiter",
  kitchen: "Kitchen",
  storekeeper: "Storekeeper"
};

const ROLE_OPTIONS: Array<{ value: OrgRole; label: string }> = [
  { value: "organisation_admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "cashier", label: "Cashier" },
  { value: "waiter", label: "Waiter" },
  { value: "kitchen", label: "Kitchen" },
  { value: "storekeeper", label: "Storekeeper" }
];

export default async function TeamPage() {
  const context = await requireWorkspaceContext();

  if (!roleIn(context.role, TEAM_VISIBLE_ROLES)) {
    return (
      <AppShell
        role={context.role}
        subtitle="Manage your team's access and assignments."
        title="Team"
      >
        <StatePanel title="Forbidden" tone="forbidden">
          Team access requires Owner, Admin, or Manager role.
        </StatePanel>
      </AppShell>
    );
  }

  const result = await getOrgStaff(context);

  if (!result.ok) {
    return (
      <AppShell
        role={context.role}
        subtitle="Manage your team's access and assignments."
        title="Team"
      >
        <StatePanel
          title={result.reason === "unconfigured" ? "Not Configured" : "Unavailable"}
          tone={result.reason === "unconfigured" ? "neutral" : "error"}
        >
          {result.message}
        </StatePanel>
      </AppShell>
    );
  }

  const { members, scoped, reason } = result.data;
  const canEdit = roleIn(context.role, TEAM_ADMIN_ROLES);

  let outlets: OutletRow[] = [];
  let stations: StationRow[] = [];

  if (canEdit) {
    const admin = requireAdminClient();
    const [{ data: outletsData }, { data: stationsData }] = await Promise.all([
      admin
        .from("outlets")
        .select("id, name")
        .eq("org_id", context.orgId)
        .eq("is_active", true)
        .order("name"),
      admin
        .from("kitchen_stations")
        .select("id, outlet_id, name")
        .eq("org_id", context.orgId)
        .eq("is_active", true)
        .order("name")
    ]);

    outlets = (outletsData ?? []) as OutletRow[];
    stations = (stationsData ?? []) as StationRow[];
  }

  const activeMembers = members.filter((m) => m.isActive);
  const inactiveMembers = members.filter((m) => !m.isActive);

  return (
    <AppShell
      role={context.role}
      subtitle={`${context.orgName} — view and manage team access.`}
      title="Team"
    >
      {scoped && reason === "no_outlet_assignment" && (
        <StatePanel title="Scoped view" tone="neutral">
          You have no active outlet assignments. Contact an Admin or Owner to be assigned to an
          outlet.
        </StatePanel>
      )}

      {scoped && reason !== "no_outlet_assignment" && (
        <StatePanel title="Scoped view" tone="neutral">
          Showing only team members who share your outlet assignments.
        </StatePanel>
      )}

      {/* Add member — owner/admin only */}
      {canEdit && (
        <Surface className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#667064]">
            Add team member
          </p>
          <form action={addMemberAction} className="mt-3 flex flex-wrap gap-3">
            <input type="hidden" name="orgId" value={context.orgId} />
            <input
              className="min-w-48 flex-1 border border-[#d7d2c4] bg-white px-3 py-2 text-sm outline-none focus:border-[#17211b]"
              name="email"
              placeholder="Email address"
              required
              type="email"
            />
            <select
              className="border border-[#d7d2c4] bg-white px-3 py-2 text-sm"
              defaultValue="cashier"
              name="role"
              required
            >
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button
              className="min-h-10 border border-[#17211b] bg-[#17211b] px-4 text-sm font-semibold text-white hover:bg-[#263128]"
              type="submit"
            >
              Add member
            </button>
          </form>
          <p className="mt-3 text-xs text-[#667064]">
            The person must already have a Flow account. This links their existing profile to your
            organisation — no invitation email is sent.
          </p>
        </Surface>
      )}

      {/* Active members */}
      {activeMembers.length === 0 && !scoped && (
        <Surface className="p-5">
          <p className="text-sm text-[#667064]">
            No active team members yet.
            {canEdit ? " Use the form above to add the first member." : ""}
          </p>
        </Surface>
      )}

      {activeMembers.length === 0 && scoped && reason !== "no_outlet_assignment" && (
        <Surface className="p-5">
          <p className="text-sm text-[#667064]">No team members found in your assigned outlets.</p>
        </Surface>
      )}

      {activeMembers.map((member) => (
        <MemberCard
          canEdit={canEdit}
          key={member.userId}
          member={member}
          orgId={context.orgId}
          outlets={outlets}
          stations={stations}
        />
      ))}

      {/* Inactive members — owner/admin only */}
      {canEdit && inactiveMembers.length > 0 && (
        <>
          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#667064]">
            Deactivated members
          </p>
          {inactiveMembers.map((member) => (
            <MemberCard
              canEdit={canEdit}
              key={member.userId}
              member={member}
              orgId={context.orgId}
              outlets={[]}
              stations={[]}
            />
          ))}
        </>
      )}
    </AppShell>
  );
}

function roleTone(role: OrgRole): "dark" | "warning" | "neutral" | "success" {
  if (role === "organisation_owner") return "dark";
  if (role === "organisation_admin") return "warning";
  if (role === "manager") return "success";
  return "neutral";
}

function MemberCard({
  member,
  orgId,
  canEdit,
  outlets,
  stations
}: {
  member: StaffMember;
  orgId: string;
  canEdit: boolean;
  outlets: OutletRow[];
  stations: StationRow[];
}) {
  const isKitchen = member.orgRole === "kitchen";

  return (
    <Surface className="overflow-hidden">
      {/* Member header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#ebe7dc] bg-[#faf9f4] px-5 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-sm">
              {member.fullName ?? "Unknown"}
            </span>
            <Badge tone={roleTone(member.orgRole)}>
              {ROLE_LABELS[member.orgRole] ?? member.orgRole}
            </Badge>
            {!member.isActive && <Badge tone="danger">Deactivated</Badge>}
          </div>
          {member.email && (
            <p className="mt-0.5 text-xs text-[#667064]">{member.email}</p>
          )}
        </div>

        {/* Deactivate / Reactivate — owner/admin only */}
        {canEdit && (
          <div className="flex gap-2">
            {member.isActive ? (
              <form action={deactivateMemberAction}>
                <input type="hidden" name="orgId" value={orgId} />
                <input type="hidden" name="userId" value={member.userId} />
                <button
                  className="min-h-9 border border-[#d98a76] px-3 text-xs font-semibold text-[#9b3a26] hover:bg-[#fdf4f2]"
                  type="submit"
                >
                  Deactivate
                </button>
              </form>
            ) : (
              <form action={reactivateMemberAction}>
                <input type="hidden" name="orgId" value={orgId} />
                <input type="hidden" name="userId" value={member.userId} />
                <button
                  className="min-h-9 border border-[#73936a] px-3 text-xs font-semibold text-[#2d5429] hover:bg-[#f0f7ee]"
                  type="submit"
                >
                  Reactivate
                </button>
              </form>
            )}
          </div>
        )}
      </div>

      {/* Outlet assignments */}
      <OutletSection
        canEdit={canEdit}
        member={member}
        orgId={orgId}
        outlets={outlets}
      />

      {/* Station assignments — kitchen members only */}
      {isKitchen && (
        <StationSection
          canEdit={canEdit}
          member={member}
          orgId={orgId}
          outlets={outlets}
          stations={stations}
        />
      )}

      {/* Change role — owner/admin, active members only */}
      {canEdit && member.isActive && (
        <details className="border-t border-[#ebe7dc]">
          <summary className="cursor-pointer px-5 py-2 text-xs font-semibold text-[#667064] hover:text-[#17211b]">
            Change role
          </summary>
          <form action={updateMemberRoleAction} className="flex flex-wrap gap-3 px-5 pb-4 pt-2">
            <input type="hidden" name="orgId" value={orgId} />
            <input type="hidden" name="userId" value={member.userId} />
            <select
              className="border border-[#d7d2c4] bg-white px-3 py-2 text-sm"
              defaultValue={member.orgRole}
              name="role"
            >
              <option value="organisation_owner">Owner</option>
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button
              className="min-h-10 border border-[#17211b] bg-[#17211b] px-4 text-sm font-semibold text-white hover:bg-[#263128]"
              type="submit"
            >
              Update role
            </button>
          </form>
        </details>
      )}
    </Surface>
  );
}

function OutletSection({
  member,
  orgId,
  canEdit,
  outlets
}: {
  member: StaffMember;
  orgId: string;
  canEdit: boolean;
  outlets: OutletRow[];
}) {
  const activeAssignments: OutletAssignment[] = member.outletAssignments;
  const isOrgWide =
    member.orgRole === "organisation_owner" || member.orgRole === "organisation_admin";

  return (
    <div className="border-t border-[#ebe7dc] px-5 py-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#667064]">
        Outlets
      </p>
      {isOrgWide ? (
        <p className="text-xs text-[#667064]">Organisation-wide outlet access (no assignment needed).</p>
      ) : activeAssignments.length === 0 ? (
        <p className="text-xs text-[#667064]">Not assigned to any outlet.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {activeAssignments.map((a) => (
            <div className="flex items-center gap-1.5" key={a.outletId}>
              <Badge tone="neutral">{a.outletName}</Badge>
              {canEdit && member.isActive && (
                <form action={removeOutletAction}>
                  <input type="hidden" name="orgId" value={orgId} />
                  <input type="hidden" name="userId" value={member.userId} />
                  <input type="hidden" name="outletId" value={a.outletId} />
                  <button
                    className="text-[10px] font-semibold text-[#9b3a26] hover:underline"
                    title={`Remove from ${a.outletName}`}
                    type="submit"
                  >
                    Remove
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Assign outlet form */}
      {canEdit && member.isActive && !isOrgWide && outlets.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-semibold text-[#667064] hover:text-[#17211b]">
            Assign to outlet
          </summary>
          <form action={assignOutletAction} className="mt-2 flex flex-wrap gap-2">
            <input type="hidden" name="orgId" value={orgId} />
            <input type="hidden" name="userId" value={member.userId} />
            <select
              className="border border-[#d7d2c4] bg-white px-3 py-2 text-sm"
              name="outletId"
              required
            >
              <option value="">Select outlet</option>
              {outlets.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <button
              className="min-h-9 border border-[#17211b] bg-[#17211b] px-3 text-xs font-semibold text-white hover:bg-[#263128]"
              type="submit"
            >
              Assign
            </button>
          </form>
        </details>
      )}
    </div>
  );
}

function StationSection({
  member,
  orgId,
  canEdit,
  outlets,
  stations
}: {
  member: StaffMember;
  orgId: string;
  canEdit: boolean;
  outlets: OutletRow[];
  stations: StationRow[];
}) {
  const activeStations: StationAssignment[] = member.stationAssignments.filter(
    (s) => !s.isRevoked
  );

  return (
    <div className="border-t border-[#ebe7dc] px-5 py-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#667064]">
        Kitchen stations
      </p>
      {activeStations.length === 0 ? (
        <p className="text-xs text-[#667064]">No active station assignments.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {activeStations.map((s) => (
            <div className="flex items-center gap-1.5" key={`${s.outletId}-${s.stationId}`}>
              <Badge tone="neutral">{s.stationName}</Badge>
              {canEdit && member.isActive && (
                <form action={revokeStationAction}>
                  <input type="hidden" name="orgId" value={orgId} />
                  <input type="hidden" name="outletId" value={s.outletId} />
                  <input type="hidden" name="stationId" value={s.stationId} />
                  <input type="hidden" name="userId" value={member.userId} />
                  <button
                    className="text-[10px] font-semibold text-[#9b3a26] hover:underline"
                    title={`Revoke ${s.stationName}`}
                    type="submit"
                  >
                    Revoke
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Assign station form */}
      {canEdit && member.isActive && stations.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-semibold text-[#667064] hover:text-[#17211b]">
            Assign to station
          </summary>
          <form action={assignStationAction} className="mt-2 flex flex-wrap gap-2">
            <input type="hidden" name="orgId" value={orgId} />
            <input type="hidden" name="userId" value={member.userId} />
            <select
              className="border border-[#d7d2c4] bg-white px-3 py-2 text-sm"
              name="outletId"
              required
            >
              <option value="">Select outlet</option>
              {outlets.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <select
              className="border border-[#d7d2c4] bg-white px-3 py-2 text-sm"
              name="stationId"
              required
            >
              <option value="">Select station</option>
              {stations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              className="min-h-9 border border-[#17211b] bg-[#17211b] px-3 text-xs font-semibold text-white hover:bg-[#263128]"
              type="submit"
            >
              Assign
            </button>
          </form>
        </details>
      )}
    </div>
  );
}
