grant usage on schema public to authenticated, service_role;

grant select, insert, update on table
  public.profiles,
  public.platform_admins,
  public.organisations,
  public.sites,
  public.outlets,
  public.org_memberships,
  public.site_memberships,
  public.teams,
  public.team_memberships,
  public.permission_grants,
  public.support_access_grants,
  public.audit_events,
  public.outbox_events,
  public.communication_retention_policies,
  public.communication_policy_acknowledgements,
  public.communication_rooms,
  public.room_memberships,
  public.messages,
  public.message_reads,
  public.work_item_threads,
  public.communication_review_access_grants,
  public.communication_review_events,
  public.menu_categories,
  public.kitchen_stations,
  public.menu_items,
  public.ingredients,
  public.recipe_versions,
  public.recipe_lines,
  public.stock_lots,
  public.inventory_ledger,
  public.table_sessions,
  public.orders,
  public.order_lines,
  public.kitchen_tickets,
  public.ticket_lines
to service_role;

grant select on table
  public.profiles,
  public.platform_admins,
  public.organisations,
  public.sites,
  public.outlets,
  public.org_memberships,
  public.site_memberships,
  public.teams,
  public.team_memberships,
  public.permission_grants,
  public.support_access_grants,
  public.audit_events,
  public.outbox_events,
  public.communication_retention_policies,
  public.communication_policy_acknowledgements,
  public.communication_rooms,
  public.room_memberships,
  public.messages,
  public.message_reads,
  public.work_item_threads,
  public.communication_review_access_grants,
  public.communication_review_events,
  public.menu_categories,
  public.kitchen_stations,
  public.menu_items,
  public.ingredients,
  public.recipe_versions,
  public.recipe_lines,
  public.stock_lots,
  public.inventory_ledger,
  public.table_sessions,
  public.orders,
  public.order_lines,
  public.kitchen_tickets,
  public.ticket_lines
to authenticated;

grant insert on table
  public.communication_policy_acknowledgements,
  public.messages,
  public.message_reads
to authenticated;

grant update on table
  public.message_reads
to authenticated;
