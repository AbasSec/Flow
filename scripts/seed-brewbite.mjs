import { createClient } from "@supabase/supabase-js";

const roleEnv = [
  ["organisation_owner", "DEMO_OWNER_EMAIL", "DEMO_OWNER_PASSWORD", "Maya Owner"],
  ["organisation_admin", "DEMO_ADMIN_EMAIL", "DEMO_ADMIN_PASSWORD", "Ari Admin"],
  ["manager", "DEMO_MANAGER_EMAIL", "DEMO_MANAGER_PASSWORD", "Nora Manager"],
  ["cashier", "DEMO_CASHIER_EMAIL", "DEMO_CASHIER_PASSWORD", "Cal Cashier"],
  ["waiter", "DEMO_WAITER_EMAIL", "DEMO_WAITER_PASSWORD", "Wani Waiter"],
  ["kitchen", "DEMO_KITCHEN_EMAIL", "DEMO_KITCHEN_PASSWORD", "Kai Kitchen"]
];

function readEnv(name) {
  const value = process.env[name]?.trim();
  return value || "";
}

function requireEnv(names) {
  const missing = names.filter((name) => !readEnv(name));

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }
}

function supabaseSecretKey() {
  return readEnv("SUPABASE_SECRET_KEY");
}

async function ensureAuthUser(supabase, email, password, fullName) {
  const created = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName
    }
  });

  if (!created.error && created.data.user) {
    return created.data.user.id;
  }

  const listed = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000
  });

  if (listed.error) {
    throw listed.error;
  }

  const existing = listed.data.users.find((user) => user.email === email);

  if (!existing) {
    throw created.error;
  }

  return existing.id;
}

async function maybeSingle(supabase, table, column, value) {
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq(column, value)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function insertAndReturn(supabase, table, values) {
  const { data, error } = await supabase
    .from(table)
    .insert(values)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function upsertOrThrow(supabase, table, values, options) {
  const { error } = await supabase.from(table).upsert(values, options);

  if (error) {
    throw error;
  }
}

async function ensureByName(supabase, table, name, values) {
  const existing = await maybeSingle(supabase, table, "name", name);

  if (existing) {
    return existing;
  }

  return insertAndReturn(supabase, table, values);
}

async function ensureMembership(supabase, table, values, match) {
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .match(match)
    .is(table === "team_memberships" ? "left_at" : "deactivated_at", null)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (data) {
    return data;
  }

  return insertAndReturn(supabase, table, values);
}

async function main() {
  const required = [
    "NEXT_PUBLIC_SUPABASE_URL",
    ...roleEnv.flatMap(([, emailName, passwordName]) => [emailName, passwordName])
  ];

  requireEnv(required);

  if (!supabaseSecretKey()) {
    throw new Error("Missing SUPABASE_SECRET_KEY for server-only seeding.");
  }

  const supabase = createClient(
    readEnv("NEXT_PUBLIC_SUPABASE_URL"),
    supabaseSecretKey(),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );

  const users = [];

  for (const [role, emailName, passwordName, fullName] of roleEnv) {
    const email = readEnv(emailName);
    const userId = await ensureAuthUser(
      supabase,
      email,
      readEnv(passwordName),
      fullName
    );

    await upsertOrThrow(supabase, "profiles", {
      id: userId,
      email,
      full_name: fullName,
      is_active: true
    });

    users.push({ id: userId, role, fullName });
  }

  const owner = users.find((user) => user.role === "organisation_owner");
  if (!owner) {
    throw new Error("Owner user was not prepared.");
  }

  const org = await ensureByName(supabase, "organisations", "BrewBite Kitchen", {
    name: "BrewBite Kitchen",
    legal_name: "BrewBite Kitchen Sdn. Bhd.",
    timezone: "Asia/Kuala_Lumpur",
    currency: "MYR",
    owner_user_id: owner.id,
    communication_policy_version: 1
  });

  const site = await ensureByName(supabase, "sites", "BrewBite Main Outlet", {
    org_id: org.id,
    name: "BrewBite Main Outlet",
    site_type: "restaurant",
    timezone: "Asia/Kuala_Lumpur",
    address: {
      city: "Kuala Lumpur",
      country: "MY"
    }
  });

  const existingOutlet = await maybeSingle(
    supabase,
    "outlets",
    "site_id",
    site.id
  );
  const outlet =
    existingOutlet ??
    (await insertAndReturn(supabase, "outlets", {
      org_id: org.id,
      site_id: site.id,
      name: "BrewBite Main Outlet",
      currency: "MYR"
    }));

  for (const user of users) {
    await ensureMembership(
      supabase,
      "org_memberships",
      {
        org_id: org.id,
        user_id: user.id,
        role: user.role
      },
      {
        org_id: org.id,
        user_id: user.id
      }
    );

    await ensureMembership(
      supabase,
      "site_memberships",
      {
        org_id: org.id,
        site_id: site.id,
        user_id: user.id,
        role: user.role
      },
      {
        org_id: org.id,
        site_id: site.id,
        user_id: user.id
      }
    );
  }

  const operationsTeam = await ensureByName(supabase, "teams", "Operations", {
    org_id: org.id,
    site_id: site.id,
    name: "Operations",
    team_type: "operations"
  });

  for (const user of users) {
    await ensureMembership(
      supabase,
      "team_memberships",
      {
        org_id: org.id,
        team_id: operationsTeam.id,
        user_id: user.id,
        role: "member"
      },
      {
        org_id: org.id,
        team_id: operationsTeam.id,
        user_id: user.id
      }
    );
  }

  await upsertOrThrow(
    supabase,
    "communication_retention_policies",
    {
      org_id: org.id,
      policy_version: 1,
      retention_days: 365,
      is_current: true,
      created_by_user_id: owner.id
    },
    {
      onConflict: "org_id,policy_version"
    }
  );

  const orgHub =
    (await maybeSingle(supabase, "communication_rooms", "title", "Organisation Hub")) ??
    (await insertAndReturn(supabase, "communication_rooms", {
      org_id: org.id,
      room_type: "ORG_HUB",
      title: "Organisation Hub",
      created_by_user_id: owner.id
    }));

  const teamRoom =
    (await maybeSingle(supabase, "communication_rooms", "title", "Operations")) ??
    (await insertAndReturn(supabase, "communication_rooms", {
      org_id: org.id,
      site_id: site.id,
      team_id: operationsTeam.id,
      room_type: "TEAM_ROOM",
      title: "Operations",
      created_by_user_id: owner.id
    }));

  for (const room of [orgHub, teamRoom]) {
    for (const user of users) {
      const existing = await supabase
        .from("room_memberships")
        .select("*")
        .match({
          org_id: org.id,
          room_id: room.id,
          user_id: user.id
        })
        .is("left_at", null)
        .limit(1)
        .maybeSingle();

      if (existing.error) {
        throw existing.error;
      }

      if (!existing.data) {
        await insertAndReturn(supabase, "room_memberships", {
          org_id: org.id,
          room_id: room.id,
          user_id: user.id,
          role: user.role === "organisation_owner" ? "room_manager" : "member"
        });
      }
    }
  }

  const drinks = await ensureByName(supabase, "kitchen_stations", "Drinks", {
    org_id: org.id,
    outlet_id: outlet.id,
    name: "Drinks"
  });
  const grill = await ensureByName(supabase, "kitchen_stations", "Grill", {
    org_id: org.id,
    outlet_id: outlet.id,
    name: "Grill"
  });

  const category = await ensureByName(supabase, "menu_categories", "Signature", {
    org_id: org.id,
    outlet_id: outlet.id,
    name: "Signature",
    sort_order: 1
  });

  const coffee = await ensureByName(supabase, "menu_items", "Cold Brew Coffee", {
    org_id: org.id,
    outlet_id: outlet.id,
    category_id: category.id,
    station_id: drinks.id,
    name: "Cold Brew Coffee",
    description: "House cold brew.",
    price_sen: 1200
  });

  const toast = await ensureByName(supabase, "menu_items", "Grilled Kaya Toast", {
    org_id: org.id,
    outlet_id: outlet.id,
    category_id: category.id,
    station_id: grill.id,
    name: "Grilled Kaya Toast",
    description: "Toasted bread with kaya.",
    price_sen: 900
  });

  const coffeeBeans = await ensureByName(supabase, "ingredients", "Coffee Beans", {
    org_id: org.id,
    outlet_id: outlet.id,
    name: "Coffee Beans",
    unit: "g",
    low_stock_threshold: 500
  });

  const bread = await ensureByName(supabase, "ingredients", "Milk Bread", {
    org_id: org.id,
    outlet_id: outlet.id,
    name: "Milk Bread",
    unit: "slice",
    low_stock_threshold: 20
  });

  for (const [item, version, lines] of [
    [coffee, 1, [[coffeeBeans, 18]]],
    [toast, 1, [[bread, 2]]]
  ]) {
    const existingRecipe = await supabase
      .from("recipe_versions")
      .select("*")
      .match({
        org_id: org.id,
        outlet_id: outlet.id,
        menu_item_id: item.id,
        version
      })
      .limit(1)
      .maybeSingle();

    if (existingRecipe.error) {
      throw existingRecipe.error;
    }

    const recipe =
      existingRecipe.data ??
      (await insertAndReturn(supabase, "recipe_versions", {
        org_id: org.id,
        outlet_id: outlet.id,
        menu_item_id: item.id,
        version,
        is_active: true
      }));

    for (const [ingredient, quantity] of lines) {
      const existingLine = await supabase
        .from("recipe_lines")
        .select("*")
        .match({
          org_id: org.id,
          outlet_id: outlet.id,
          recipe_version_id: recipe.id,
          ingredient_id: ingredient.id
        })
        .limit(1)
        .maybeSingle();

      if (existingLine.error) {
        throw existingLine.error;
      }

      if (!existingLine.data) {
        await insertAndReturn(supabase, "recipe_lines", {
          org_id: org.id,
          outlet_id: outlet.id,
          recipe_version_id: recipe.id,
          ingredient_id: ingredient.id,
          quantity
        });
      }
    }
  }

  for (const [ingredient, lotCode, quantity] of [
    [coffeeBeans, "CB-DEMO-001", 5000],
    [bread, "BR-DEMO-001", 120]
  ]) {
    const existingLot = await supabase
      .from("stock_lots")
      .select("*")
      .match({
        org_id: org.id,
        outlet_id: outlet.id,
        ingredient_id: ingredient.id,
        lot_code: lotCode
      })
      .limit(1)
      .maybeSingle();

    if (existingLot.error) {
      throw existingLot.error;
    }

    const lot =
      existingLot.data ??
      (await insertAndReturn(supabase, "stock_lots", {
        org_id: org.id,
        outlet_id: outlet.id,
        ingredient_id: ingredient.id,
        lot_code: lotCode,
        received_quantity: quantity
      }));

    const existingLedger = await supabase
      .from("inventory_ledger")
      .select("*")
      .match({
        org_id: org.id,
        outlet_id: outlet.id,
        ingredient_id: ingredient.id,
        stock_lot_id: lot.id,
        entry_type: "receipt"
      })
      .limit(1)
      .maybeSingle();

    if (existingLedger.error) {
      throw existingLedger.error;
    }

    if (!existingLedger.data) {
      await insertAndReturn(supabase, "inventory_ledger", {
        org_id: org.id,
        outlet_id: outlet.id,
        ingredient_id: ingredient.id,
        stock_lot_id: lot.id,
        entry_type: "receipt",
        quantity_delta: quantity,
        reference_type: "demo_seed",
        reason: "BrewBite demo opening stock",
        created_by_user_id: owner.id
      });
    }
  }

  console.log("BrewBite Kitchen demo seed preparation complete.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
