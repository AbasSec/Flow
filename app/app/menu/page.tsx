import { AppShell, Badge, StatePanel, Surface } from "@/components/flow-ui";
import { formatSen } from "@/lib/format";
import { getOutletMenuForManagement, type MenuCategory, type MenuStation } from "@/lib/services/menu-management";
import { MANAGEMENT_ROLES, requireWorkspaceContext, roleIn } from "@/lib/services/context";
import {
  archiveCategoryAction,
  archiveItemAction,
  createCategoryAction,
  createItemAction,
  setAvailabilityAction,
  updateCategoryAction,
  updateItemAction
} from "./actions";

export const dynamic = "force-dynamic";

export default async function MenuPage() {
  const context = await requireWorkspaceContext();

  if (!roleIn(context.role, MANAGEMENT_ROLES)) {
    return (
      <AppShell
        role={context.role}
        subtitle="Manage categories and items for your outlet."
        title="Menu Management"
      >
        <StatePanel title="Forbidden" tone="forbidden">
          Menu management requires Owner, Admin, or Manager access.
        </StatePanel>
      </AppShell>
    );
  }

  const result = await getOutletMenuForManagement(context);

  if (!result.ok) {
    return (
      <AppShell
        role={context.role}
        subtitle="Manage categories and items for your outlet."
        title="Menu Management"
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

  const { outletId, stations, categories } = result.data;
  const canEdit = roleIn(context.role, ["organisation_owner", "organisation_admin"]);

  return (
    <AppShell
      role={context.role}
      subtitle={`${context.orgName} — manage categories and items.`}
      title="Menu Management"
    >
      {canEdit && (
        <Surface className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#667064]">
            New category
          </p>
          <form action={createCategoryAction} className="mt-3 flex flex-wrap gap-3">
            <input type="hidden" name="outletId" value={outletId} />
            <input
              className="min-w-48 flex-1 border border-[#d7d2c4] bg-white px-3 py-2 text-sm outline-none focus:border-[#17211b]"
              name="name"
              placeholder="Category name"
              required
            />
            <input
              className="w-28 border border-[#d7d2c4] bg-white px-3 py-2 text-sm outline-none focus:border-[#17211b]"
              defaultValue="0"
              min="0"
              name="sortOrder"
              placeholder="Order"
              type="number"
            />
            <button
              className="min-h-10 border border-[#17211b] bg-[#17211b] px-4 text-sm font-semibold text-white hover:bg-[#263128]"
              type="submit"
            >
              Add category
            </button>
          </form>
          <p className="mt-3 text-xs text-[#667064]">
            Removing from the menu safely hides the item or category from active menus while
            preserving order history, reports, and audit records.
          </p>
        </Surface>
      )}

      {categories.length === 0 ? (
        <Surface className="p-5">
          <p className="text-sm text-[#667064]">
            No categories yet.{canEdit ? " Use the form above to create the first one." : ""}
          </p>
        </Surface>
      ) : (
        categories.map((category) => (
          <CategorySection
            canEdit={canEdit}
            category={category}
            key={category.id}
            outletId={outletId}
            stations={stations}
          />
        ))
      )}
    </AppShell>
  );
}

function CategorySection({
  category,
  outletId,
  stations,
  canEdit
}: {
  category: MenuCategory;
  outletId: string;
  stations: MenuStation[];
  canEdit: boolean;
}) {
  const hasActiveItems = category.items.length > 0;

  return (
    <Surface className="overflow-hidden">
      {/* Category header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#ebe7dc] bg-[#faf9f4] px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="font-semibold">{category.name}</span>
          <span className="text-xs text-[#667064]">sort {category.sortOrder}</span>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            {!hasActiveItems && (
              <form action={archiveCategoryAction}>
                <input type="hidden" name="outletId" value={outletId} />
                <input type="hidden" name="categoryId" value={category.id} />
                <button
                  className="min-h-9 border border-[#d98a76] px-3 text-xs font-semibold text-[#9b3a26] hover:bg-[#fdf4f2]"
                  type="submit"
                >
                  Remove category from menu
                </button>
              </form>
            )}
          </div>
        )}
      </div>

      {/* Edit category (Owner/Admin) */}
      {canEdit && (
        <details className="border-b border-[#ebe7dc]">
          <summary className="cursor-pointer px-5 py-2 text-xs font-semibold text-[#667064] hover:text-[#17211b]">
            Edit category
          </summary>
          <form action={updateCategoryAction} className="flex flex-wrap gap-3 px-5 pb-4 pt-2">
            <input type="hidden" name="outletId" value={outletId} />
            <input type="hidden" name="categoryId" value={category.id} />
            <input
              className="min-w-48 flex-1 border border-[#d7d2c4] bg-white px-3 py-2 text-sm outline-none focus:border-[#17211b]"
              defaultValue={category.name}
              name="name"
              required
            />
            <input
              className="w-28 border border-[#d7d2c4] bg-white px-3 py-2 text-sm outline-none focus:border-[#17211b]"
              defaultValue={category.sortOrder}
              min="0"
              name="sortOrder"
              type="number"
            />
            <button
              className="min-h-10 border border-[#17211b] bg-[#17211b] px-4 text-sm font-semibold text-white hover:bg-[#263128]"
              type="submit"
            >
              Save
            </button>
          </form>
        </details>
      )}

      {/* Items */}
      <div className="divide-y divide-[#ebe7dc]">
        {category.items.length === 0 && (
          <p className="px-5 py-4 text-sm text-[#667064]">No items in this category.</p>
        )}

        {category.items.map((item) => (
          <div className="px-5 py-3" key={item.id}>
            <div className="flex flex-wrap items-start gap-3">
              {/* Item info */}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-sm">{item.name}</span>
                  {item.isSoldOut && <Badge tone="warning">Sold out</Badge>}
                  {!item.isPublic && <Badge tone="neutral">Hidden</Badge>}
                  {item.stationName && <Badge tone="neutral">{item.stationName}</Badge>}
                </div>
                <p className="mt-0.5 text-sm text-[#667064]">
                  {formatSen(item.priceSen)}
                  {item.soldOutReason && (
                    <span className="ml-2 text-xs">— {item.soldOutReason}</span>
                  )}
                </p>
                {item.description && (
                  <p className="mt-0.5 text-xs text-[#667064]">{item.description}</p>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                {item.isSoldOut ? (
                  <form action={setAvailabilityAction}>
                    <input type="hidden" name="outletId" value={outletId} />
                    <input type="hidden" name="itemId" value={item.id} />
                    <input type="hidden" name="soldOut" value="false" />
                    <button
                      className="min-h-9 border border-[#73936a] px-3 text-xs font-semibold text-[#2d5429] hover:bg-[#f0f7ee]"
                      type="submit"
                    >
                      Mark available
                    </button>
                  </form>
                ) : (
                  <form action={setAvailabilityAction} className="flex gap-2">
                    <input type="hidden" name="outletId" value={outletId} />
                    <input type="hidden" name="itemId" value={item.id} />
                    <input type="hidden" name="soldOut" value="true" />
                    <input
                      className="w-40 border border-[#d7d2c4] bg-white px-2 py-1 text-xs outline-none focus:border-[#17211b]"
                      name="reason"
                      placeholder="Reason (optional)"
                    />
                    <button
                      className="min-h-9 border border-[#d6a751] px-3 text-xs font-semibold text-[#7a5a0e] hover:bg-[#fdf8ec]"
                      type="submit"
                    >
                      Mark sold out
                    </button>
                  </form>
                )}

                {canEdit && (
                  <form action={archiveItemAction}>
                    <input type="hidden" name="outletId" value={outletId} />
                    <input type="hidden" name="itemId" value={item.id} />
                    <button
                      className="min-h-9 border border-[#d98a76] px-3 text-xs font-semibold text-[#9b3a26] hover:bg-[#fdf4f2]"
                      type="submit"
                    >
                      Remove from menu
                    </button>
                  </form>
                )}
              </div>
            </div>

            {/* Edit item (Owner/Admin) */}
            {canEdit && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-semibold text-[#667064] hover:text-[#17211b]">
                  Edit item
                </summary>
                <form action={updateItemAction} className="mt-2 grid gap-3 sm:grid-cols-2">
                  <input type="hidden" name="outletId" value={outletId} />
                  <input type="hidden" name="itemId" value={item.id} />
                  <input
                    className="border border-[#d7d2c4] bg-white px-3 py-2 text-sm outline-none focus:border-[#17211b]"
                    defaultValue={item.name}
                    name="name"
                    placeholder="Name"
                    required
                  />
                  <input
                    className="border border-[#d7d2c4] bg-white px-3 py-2 text-sm outline-none focus:border-[#17211b]"
                    defaultValue={item.priceSen}
                    min="0"
                    name="priceSen"
                    placeholder="Price in sen"
                    required
                    type="number"
                  />
                  <input
                    className="border border-[#d7d2c4] bg-white px-3 py-2 text-sm outline-none focus:border-[#17211b] sm:col-span-2"
                    defaultValue={item.description ?? ""}
                    name="description"
                    placeholder="Description (optional)"
                  />
                  <div className="flex gap-3">
                    <select
                      className="flex-1 border border-[#d7d2c4] bg-white px-3 py-2 text-sm"
                      defaultValue={item.isPublic ? "true" : "false"}
                      name="isPublic"
                    >
                      <option value="true">Visible to customers</option>
                      <option value="false">Hidden</option>
                    </select>
                    <select
                      className="flex-1 border border-[#d7d2c4] bg-white px-3 py-2 text-sm"
                      defaultValue={item.stationId ?? ""}
                      name="stationId"
                    >
                      <option value="">No station</option>
                      {stations.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex justify-end sm:col-span-2">
                    <button
                      className="min-h-10 border border-[#17211b] bg-[#17211b] px-4 text-sm font-semibold text-white hover:bg-[#263128]"
                      type="submit"
                    >
                      Save changes
                    </button>
                  </div>
                </form>
              </details>
            )}
          </div>
        ))}

        {/* Add item form (Owner/Admin) */}
        {canEdit && (
          <div className="bg-[#faf9f4] px-5 py-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#667064]">
              Add item
            </p>
            <form action={createItemAction} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="outletId" value={outletId} />
              <input type="hidden" name="categoryId" value={category.id} />
              <input
                className="border border-[#d7d2c4] bg-white px-3 py-2 text-sm outline-none focus:border-[#17211b]"
                name="name"
                placeholder="Item name"
                required
              />
              <input
                className="border border-[#d7d2c4] bg-white px-3 py-2 text-sm outline-none focus:border-[#17211b]"
                min="0"
                name="priceSen"
                placeholder="Price in sen (e.g. 1200 = RM 12.00)"
                required
                type="number"
              />
              <input
                className="border border-[#d7d2c4] bg-white px-3 py-2 text-sm outline-none focus:border-[#17211b] sm:col-span-2"
                name="description"
                placeholder="Description (optional)"
              />
              <div className="flex gap-3">
                <select
                  className="flex-1 border border-[#d7d2c4] bg-white px-3 py-2 text-sm"
                  defaultValue="true"
                  name="isPublic"
                >
                  <option value="true">Visible to customers</option>
                  <option value="false">Hidden</option>
                </select>
                {stations.length > 0 && (
                  <select
                    className="flex-1 border border-[#d7d2c4] bg-white px-3 py-2 text-sm"
                    defaultValue=""
                    name="stationId"
                  >
                    <option value="">No station</option>
                    {stations.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="flex justify-end sm:col-span-2">
                <button
                  className="min-h-10 border border-[#17211b] bg-[#17211b] px-4 text-sm font-semibold text-white hover:bg-[#263128]"
                  type="submit"
                >
                  Add item
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </Surface>
  );
}
