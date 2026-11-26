import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getDb } from "@/server/db";
import { getAuthenticatedCustomerId, isWhitelistedAdminEmail } from "./auth-helpers";

function postgrestLiteral(val: string): string {
  return `"${val.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Server Function: Get customer addresses
 */
export const getCustomerAddressesServerFn = createServerFn({ method: "POST" })
  .validator((params?: { authToken?: string | undefined }) => params || {})
  .handler(async ({ data }) => {
    const auth = await getAuthenticatedCustomerId(data?.authToken);
    if (!auth) {
      return [];
    }

    const { data: addresses, error } = await supabaseAdmin
      .from("customer_addresses")
      .select("*")
      .or(
        auth.customerUuid
          ? `customer_id.eq.${postgrestLiteral(auth.customerUuid)},customer_auth_uid.eq.${postgrestLiteral(auth.id)}`
          : `customer_auth_uid.eq.${postgrestLiteral(auth.id)}`,
      )
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[Customer Addresses] Fetch error:", error);
      return [];
    }

    return addresses || [];
  });

/**
 * Server Function: Get customer orders
 */
export const getCustomerOrdersServerFn = createServerFn({ method: "POST" })
  .validator((params?: { authToken?: string | undefined }) => params || {})
  .handler(async ({ data }) => {
    const auth = await getAuthenticatedCustomerId(data?.authToken);
    if (!auth) {
      return [];
    }

    const orClauses: string[] = [];
    if (auth.customerUuid) {
      orClauses.push(`customer_id.eq.${postgrestLiteral(auth.customerUuid)}`);
    }
    orClauses.push(`user_id.eq.${postgrestLiteral(auth.id)}`);
    if (auth.email) {
      orClauses.push(`customer_email.eq.${postgrestLiteral(auth.email.toLowerCase().trim())}`);
    }

    const { data: orders, error } = await supabaseAdmin
      .from("orders")
      .select(
        "id,order_number,total,status,payment_status,shipment_status,awb_number,created_at,items",
      )
      .or(orClauses.join(","))
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[Customer Orders] Fetch error:", error);
      return [];
    }

    return orders || [];
  });

/**
 * Server Function: Add or update customer address
 */
export const saveCustomerAddressServerFn = createServerFn({ method: "POST" })
  .validator(
    (params: {
      authToken?: string | undefined;
      id?: string | undefined;
      fullName: string;
      phone: string;
      addressLine1: string;
      addressLine2?: string | undefined;
      city: string;
      state: string;
      postalCode: string;
      country?: string | undefined;
      addressType?: string | undefined;
      isDefault?: boolean | undefined;
    }) => params,
  )
  .handler(async ({ data }) => {
    const auth = await getAuthenticatedCustomerId(data.authToken);
    if (!auth) {
      throw new Error("Authentication required to manage addresses.");
    }

    if (!data.fullName.trim() || !data.phone.trim() || !data.addressLine1.trim()) {
      throw new Error("Full name, phone, and address line 1 are required.");
    }
    if (!/^[1-9]\d{5}$/.test(data.postalCode.trim())) {
      throw new Error("Valid 6-digit postal PIN code required.");
    }

    // Ensure customer UUID exists in public.customers
    let customerUuid = auth.customerUuid;
    if (!customerUuid) {
      const { data: newCust } = await supabaseAdmin
        .from("customers")
        .upsert(
          {
            auth_provider_uid: auth.id,
            full_name: data.fullName.trim(),
            email: auth.email || null,
            phone: data.phone.trim(),
            account_status: "active",
          },
          { onConflict: "auth_provider_uid" },
        )
        .select("id")
        .single();
      customerUuid = newCust?.id;
    }

    // If marked default, unset existing default
    if (data.isDefault && customerUuid) {
      await supabaseAdmin
        .from("customer_addresses")
        .update({ is_default: false, updated_at: new Date().toISOString() })
        .eq("customer_id", customerUuid);
    }

    if (data.id) {
      // Update existing address
      const { error } = await supabaseAdmin
        .from("customer_addresses")
        .update({
          full_name: data.fullName.trim(),
          phone: data.phone.trim(),
          address_line1: data.addressLine1.trim(),
          address_line2: data.addressLine2?.trim() || null,
          city: data.city.trim(),
          state: data.state.trim(),
          postal_code: data.postalCode.trim(),
          country: data.country?.trim() || "India",
          address_type: data.addressType || "shipping",
          is_default: Boolean(data.isDefault),
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.id)
        .or(
          customerUuid
            ? `customer_id.eq.${postgrestLiteral(customerUuid)},customer_auth_uid.eq.${postgrestLiteral(auth.id)}`
            : `customer_auth_uid.eq.${postgrestLiteral(auth.id)}`,
        );

      if (error) throw new Error(error.message);
      return { success: true, id: data.id };
    } else {
      // Insert new address
      const { data: inserted, error } = await supabaseAdmin
        .from("customer_addresses")
        .insert({
          customer_id: customerUuid || null,
          customer_auth_uid: auth.id,
          full_name: data.fullName.trim(),
          phone: data.phone.trim(),
          address_line1: data.addressLine1.trim(),
          address_line2: data.addressLine2?.trim() || null,
          city: data.city.trim(),
          state: data.state.trim(),
          postal_code: data.postalCode.trim(),
          country: data.country?.trim() || "India",
          address_type: data.addressType || "shipping",
          is_default: Boolean(data.isDefault),
        })
        .select("id")
        .single();

      if (error) throw new Error(error.message);
      return { success: true, id: inserted.id };
    }
  });

/**
 * Server Function: Delete customer address
 */
export const deleteCustomerAddressServerFn = createServerFn({ method: "POST" })
  .validator((params: { authToken?: string | undefined; addressId: string }) => params)
  .handler(async ({ data }) => {
    const auth = await getAuthenticatedCustomerId(data.authToken);
    if (!auth) throw new Error("Authentication required.");

    const { error } = await supabaseAdmin
      .from("customer_addresses")
      .delete()
      .eq("id", data.addressId)
      .or(
        auth.customerUuid
          ? `customer_id.eq.${postgrestLiteral(auth.customerUuid)},customer_auth_uid.eq.${postgrestLiteral(auth.id)}`
          : `customer_auth_uid.eq.${postgrestLiteral(auth.id)}`,
      );

    if (error) throw new Error(error.message);
    return { success: true };
  });

export interface CustomerProfileData {
  id: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  mobileNumber: string | null;
  avatarUrl: string | null;
  profileCompleted: boolean;
}

/**
 * Server Function: Check customer profile completion status
 */
export const checkProfileCompletionServerFn = createServerFn({ method: "POST" })
  .validator((params?: { authToken?: string | undefined }) => params || {})
  .handler(async ({ data }) => {
    const auth = await getAuthenticatedCustomerId(data?.authToken);
    if (!auth) {
      return {
        authenticated: false,
        userId: null,
        email: null,
        fullName: null,
        mobileNumber: null,
        profileCompleted: false,
        isAdmin: false,
      };
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(auth.id);
    const authUuid = isUuid ? auth.id : null;
    const cleanEmail = auth.email?.toLowerCase().trim() || null;

    const sql = getDb();
    let profile: Record<string, unknown> | null = null;

    if (sql) {
      try {
        if (authUuid) {
          const [p] = await sql`
            SELECT id, full_name, email, mobile_number, phone, profile_completed
            FROM public.profiles
            WHERE id = ${authUuid}::uuid
            LIMIT 1
          `;
          if (p) profile = p;
        }

        if (!profile && cleanEmail) {
          const [p] = await sql`
            SELECT id, full_name, email, mobile_number, phone, profile_completed
            FROM public.profiles
            WHERE lower(email) = ${cleanEmail}
            LIMIT 1
          `;
          if (p) profile = p;
        }
      } catch (dbErr) {
        console.warn("[checkProfileCompletion] DB query note:", dbErr);
      }
    }

    if (!profile) {
      try {
        const { data: p } = await supabaseAdmin
          .from("profiles")
          .select("id, full_name, email, mobile_number, phone, profile_completed")
          .eq(authUuid ? "id" : "email", authUuid || cleanEmail || "")
          .maybeSingle();
        if (p) profile = p as unknown as Record<string, unknown>;
      } catch {
        /* ignore */
      }
    }

    const fullName = (profile?.["full_name"] as string | null)?.trim() || null;
    const rawMobile =
      (profile?.["mobile_number"] as string | null) ||
      (profile?.["phone"] as string | null) ||
      null;
    const cleanMobile = rawMobile ? rawMobile.replace(/\D/g, "").slice(-10) : null;
    const hasValidName = Boolean(
      fullName && fullName.length >= 2 && fullName.toLowerCase() !== "customer",
    );
    const hasValidMobile = Boolean(cleanMobile && cleanMobile.length === 10);
    const isCompleted = Boolean(profile?.["profile_completed"] || (hasValidName && hasValidMobile));

    return {
      authenticated: true,
      userId: auth.id,
      email: auth.email || null,
      fullName,
      mobileNumber: cleanMobile,
      profileCompleted: isCompleted,
      isAdmin: isWhitelistedAdminEmail(auth.email),
    };
  });

/**
 * Server Function: Complete mandatory customer profile (full_name and 10-digit mobile number)
 */
export const completeCustomerProfileServerFn = createServerFn({ method: "POST" })
  .validator(
    (params: {
      authToken?: string | undefined;
      fullName: string;
      mobileNumber: string;
      countryCode?: string | undefined;
    }) => params,
  )
  .handler(async ({ data }) => {
    const auth = await getAuthenticatedCustomerId(data.authToken);
    if (!auth) {
      throw new Error("Authentication required. Please sign in to complete your profile.");
    }

    const trimmedName = data.fullName.trim();
    if (!trimmedName || trimmedName.length < 2) {
      throw new Error("Please enter your full legal name (minimum 2 characters).");
    }

    // Normalize mobile number to exactly 10 digits
    const cleanDigits = data.mobileNumber.replace(/\D/g, "");
    const normalizedPhone = cleanDigits.length > 10 ? cleanDigits.slice(-10) : cleanDigits;

    if (!/^[6-9]\d{9}$/.test(normalizedPhone)) {
      throw new Error(
        "Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.",
      );
    }

    const sql = getDb();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(auth.id);
    const authUuid = isUuid ? auth.id : null;
    const cleanEmail = auth.email?.toLowerCase().trim() || null;

    // 1. Enforce unique mobile number constraint across other customer accounts
    if (sql) {
      try {
        const existingDuplicate = await sql`
          SELECT id, email FROM public.profiles
          WHERE (mobile_number = ${normalizedPhone} OR phone = ${normalizedPhone})
            AND (${authUuid ? sql`id != ${authUuid}::uuid` : sql`true`})
            AND (${cleanEmail ? sql`lower(email) != ${cleanEmail}` : sql`true`})
          LIMIT 1
        `;
        if (existingDuplicate && existingDuplicate.length > 0) {
          throw new Error(
            "This mobile number is already registered with another CAVENHUSRT account. Please enter your unique 10-digit mobile number.",
          );
        }
      } catch (dupErr) {
        if (dupErr instanceof Error && dupErr.message.includes("already registered")) {
          throw dupErr;
        }
      }
    }

    // 2. Persist to public.profiles
    let profileSaved = false;
    if (sql && authUuid) {
      try {
        await sql`
          INSERT INTO public.profiles (
            id, email, full_name, mobile_number, phone, profile_completed, updated_at
          ) VALUES (
            ${authUuid}::uuid, ${cleanEmail}, ${trimmedName}, ${normalizedPhone}, ${normalizedPhone}, true, now()
          )
          ON CONFLICT (id) DO UPDATE SET
            full_name = EXCLUDED.full_name,
            mobile_number = EXCLUDED.mobile_number,
            phone = EXCLUDED.phone,
            profile_completed = true,
            updated_at = now();
        `;
        profileSaved = true;
      } catch (err: unknown) {
        const pgErr = err as { code?: string; message?: string };
        if (
          pgErr?.code === "23505" ||
          pgErr?.message?.includes("idx_profiles_mobile_number_unique")
        ) {
          throw new Error(
            "This mobile number is already registered with another CAVENHUSRT account. Please enter your unique 10-digit mobile number.",
          );
        }
        console.warn("[completeCustomerProfile] SQL profiles upsert notice:", err);
      }
    }

    if (!profileSaved) {
      const { error: upsertErr } = await supabaseAdmin.from("profiles").upsert({
        id: authUuid || auth.id,
        email: cleanEmail,
        full_name: trimmedName,
        mobile_number: normalizedPhone,
        phone: normalizedPhone,
        profile_completed: true,
        updated_at: new Date().toISOString(),
      });

      if (upsertErr) {
        if (upsertErr.code === "23505" || upsertErr.message.includes("unique")) {
          throw new Error(
            "This mobile number is already registered with another CAVENHUSRT account. Please enter your unique 10-digit mobile number.",
          );
        }
        throw new Error(upsertErr.message || "Failed to save profile record.");
      }
    }

    // 3. Mirror into public.customers for seamless order and address book synchronization
    try {
      await supabaseAdmin.from("customers").upsert(
        {
          auth_provider_uid: auth.id,
          full_name: trimmedName,
          email: cleanEmail,
          phone: normalizedPhone,
          account_status: "active",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "auth_provider_uid" },
      );
    } catch (custErr) {
      console.warn("[completeCustomerProfile] customers sync notice:", custErr);
    }

    // 4. Update auth.users metadata if authenticated via Supabase GoTrue
    if (sql && authUuid) {
      try {
        await sql`
          UPDATE auth.users SET
            updated_at = now(),
            raw_user_meta_data = raw_user_meta_data || ${sql.json({
              full_name: trimmedName,
              name: trimmedName,
              phone: normalizedPhone,
              mobile_number: normalizedPhone,
              profile_completed: true,
            })}
          WHERE id = ${authUuid}::uuid
        `;
      } catch {
        /* ignore */
      }
    }

    return {
      success: true,
      profile: {
        id: auth.id,
        fullName: trimmedName,
        mobileNumber: normalizedPhone,
        email: cleanEmail,
        profileCompleted: true,
      },
    };
  });

/**
 * Server Function: Get customer profile
 */
export const getCustomerProfileServerFn = createServerFn({ method: "POST" })
  .validator((params?: { authToken?: string | undefined }) => params || {})
  .handler(async ({ data }): Promise<CustomerProfileData | null> => {
    const auth = await getAuthenticatedCustomerId(data?.authToken);
    if (!auth) return null;

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(auth.id);
    const authUuid = isUuid ? auth.id : null;
    const cleanEmail = auth.email?.toLowerCase().trim() || null;

    const sql = getDb();
    if (sql) {
      try {
        let profile = null;
        if (authUuid) {
          const [p] = await sql`
            SELECT p.id, p.full_name, p.email, p.phone, p.mobile_number, p.avatar_url, p.profile_completed
            FROM public.profiles p
            WHERE p.id = ${authUuid}::uuid
            LIMIT 1
          `;
          profile = p;
        }

        if (!profile && cleanEmail) {
          const [p] = await sql`
            SELECT p.id, p.full_name, p.email, p.phone, p.mobile_number, p.avatar_url, p.profile_completed
            FROM public.profiles p
            WHERE lower(p.email) = ${cleanEmail}
            LIMIT 1
          `;
          profile = p;
        }

        if (profile) {
          const fn = (profile["full_name"] as string | null) ?? null;
          const mob =
            (profile["mobile_number"] as string | null) ??
            (profile["phone"] as string | null) ??
            null;
          const cleanMob = mob ? mob.replace(/\D/g, "").slice(-10) : null;
          const isDone = Boolean(
            profile["profile_completed"] ||
            (fn && fn.length >= 2 && fn !== "Customer" && cleanMob && cleanMob.length === 10),
          );

          return {
            id: profile["id"] as string,
            fullName: fn,
            email: (profile["email"] as string | null) ?? null,
            phone: cleanMob,
            mobileNumber: cleanMob,
            avatarUrl: (profile["avatar_url"] as string | null) ?? null,
            profileCompleted: isDone,
          };
        }

        const customerUuid =
          auth.customerUuid &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(auth.customerUuid)
            ? auth.customerUuid
            : null;

        const [cust] = await sql`
          SELECT c.id, c.full_name, c.email, c.phone, c.profile_image
          FROM public.customers c
          WHERE (${customerUuid ? sql`c.id = ${customerUuid}::uuid` : sql`false`}
             OR c.auth_provider_uid = ${auth.id}
             OR (${cleanEmail ? sql`lower(c.email) = ${cleanEmail}` : sql`false`}))
          LIMIT 1
        `;
        if (cust) {
          const cfn = (cust["full_name"] as string | null) ?? null;
          const cmob = (cust["phone"] as string | null) ?? null;
          const cleanCmob = cmob ? cmob.replace(/\D/g, "").slice(-10) : null;
          const isDone = Boolean(
            cfn && cfn.length >= 2 && cfn !== "Customer" && cleanCmob && cleanCmob.length === 10,
          );

          return {
            id: cust["id"] as string,
            fullName: cfn,
            email: (cust["email"] as string | null) ?? null,
            phone: cleanCmob,
            mobileNumber: cleanCmob,
            avatarUrl: (cust["profile_image"] as string | null) ?? null,
            profileCompleted: isDone,
          };
        }
      } catch (dbErr) {
        console.warn("[getCustomerProfileServerFn] DB notice:", dbErr);
      }
    }

    return {
      id: auth.id,
      fullName: null,
      email: auth.email || null,
      phone: null,
      mobileNumber: null,
      avatarUrl: null,
      profileCompleted: false,
    };
  });

/**
 * Server Function: Update customer profile details
 */
export const updateCustomerProfileServerFn = createServerFn({ method: "POST" })
  .validator(
    (params: {
      authToken?: string | undefined;
      fullName?: string | undefined;
      email?: string | undefined;
      phone?: string | undefined;
      mobileNumber?: string | undefined;
    }) => params,
  )
  .handler(async ({ data }) => {
    const auth = await getAuthenticatedCustomerId(data.authToken);
    if (!auth) throw new Error("Authentication required.");

    const sql = getDb();
    if (!sql) throw new Error("Database connection unavailable.");

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(auth.id);
    const authUuid = isUuid ? auth.id : null;
    const cleanEmail = data.email?.toLowerCase().trim() || auth.email?.toLowerCase().trim() || null;
    const cleanName = data.fullName?.trim() || null;
    const rawPhone = data.mobileNumber || data.phone;
    const cleanPhone = rawPhone ? rawPhone.replace(/\D/g, "").slice(-10) : null;

    if (cleanPhone && !/^[6-9]\d{9}$/.test(cleanPhone)) {
      throw new Error(
        "Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.",
      );
    }

    // Check duplicate mobile if changing phone
    if (cleanPhone && sql) {
      const dup = await sql`
        SELECT id FROM public.profiles
        WHERE (mobile_number = ${cleanPhone} OR phone = ${cleanPhone})
          AND (${authUuid ? sql`id != ${authUuid}::uuid` : sql`true`})
          AND (${cleanEmail ? sql`lower(email) != ${cleanEmail}` : sql`true`})
        LIMIT 1
      `;
      if (dup && dup.length > 0) {
        throw new Error(
          "This mobile number is already registered with another CAVENHUSRT account.",
        );
      }
    }

    let updatedAny = false;

    // 1. Update public.profiles
    try {
      if (authUuid) {
        await sql`
          UPDATE public.profiles SET
            email = COALESCE(${cleanEmail}, email),
            full_name = COALESCE(${cleanName}, full_name),
            mobile_number = COALESCE(${cleanPhone}, mobile_number),
            phone = COALESCE(${cleanPhone}, phone),
            updated_at = now()
          WHERE id = ${authUuid}::uuid
        `;
        updatedAny = true;
      } else if (cleanEmail) {
        await sql`
          UPDATE public.profiles SET
            full_name = COALESCE(${cleanName}, full_name),
            mobile_number = COALESCE(${cleanPhone}, mobile_number),
            phone = COALESCE(${cleanPhone}, phone),
            updated_at = now()
          WHERE lower(email) = ${cleanEmail}
        `;
        updatedAny = true;
      }
    } catch (err) {
      console.warn("[updateProfile] profiles update note:", err);
    }

    // 2. Update public.customers
    try {
      const customerUuid =
        auth.customerUuid &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(auth.customerUuid)
          ? auth.customerUuid
          : null;

      await sql`
        UPDATE public.customers SET
          email = COALESCE(${cleanEmail}, email),
          full_name = COALESCE(${cleanName}, full_name),
          phone = COALESCE(${cleanPhone}, phone),
          updated_at = now()
        WHERE (${customerUuid ? sql`id = ${customerUuid}::uuid` : sql`false`}
           OR auth_provider_uid = ${auth.id}
           OR (${cleanEmail ? sql`lower(email) = ${cleanEmail}` : sql`false`}))
      `;
      updatedAny = true;
    } catch (err) {
      console.warn("[updateProfile] customers update note:", err);
    }

    // 3. Update auth.users if cleanEmail is provided and authUuid is valid
    try {
      if (authUuid && (cleanEmail || cleanName || cleanPhone)) {
        await sql`
          UPDATE auth.users SET
            email = COALESCE(${cleanEmail}, email),
            updated_at = now(),
            raw_user_meta_data = raw_user_meta_data || ${sql.json({
              ...(cleanEmail ? { email: cleanEmail } : {}),
              ...(cleanName ? { full_name: cleanName, name: cleanName } : {}),
              ...(cleanPhone ? { phone: cleanPhone, mobile_number: cleanPhone } : {}),
            })}
          WHERE id = ${authUuid}::uuid
        `;
      }
    } catch (err) {
      console.warn("[updateProfile] auth.users update note:", err);
    }

    if (!updatedAny) {
      throw new Error("Unable to locate profile record to update.");
    }

    return { success: true };
  });

/**
 * Server Function: Read immutable customer welcome status from public.customer_welcome.
 */
export const getWelcomeStatusServerFn = createServerFn({ method: "POST" })
  .validator((params?: { authToken?: string | undefined }) => params || {})
  .handler(async ({ data }): Promise<{ seen: boolean }> => {
    const auth = await getAuthenticatedCustomerId(data?.authToken);
    if (!auth) {
      throw new Error("Authentication required to check welcome state.");
    }

    const sql = getDb();
    if (sql) {
      const [row] = await sql<{ welcome_seen_at: string | null }[]>`
        SELECT welcome_seen_at FROM public.customer_welcome WHERE user_id = ${auth.id} LIMIT 1
      `;
      return { seen: Boolean(row?.welcome_seen_at) };
    }

    const { data: row, error } = await supabaseAdmin
      .from("customer_welcome")
      .select("welcome_seen_at")
      .eq("user_id", auth.id)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    return { seen: Boolean(row?.welcome_seen_at) };
  });

/**
 * Server Function: Record immutable customer welcome completion for verified user.
 */
export const completeWelcomeServerFn = createServerFn({ method: "POST" })
  .validator((params?: { authToken?: string | undefined }) => params || {})
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    const auth = await getAuthenticatedCustomerId(data?.authToken);
    if (!auth) {
      throw new Error("Authentication required to complete welcome.");
    }

    const sql = getDb();
    if (sql) {
      await sql`
        INSERT INTO public.customer_welcome (user_id, welcome_seen_at)
        VALUES (${auth.id}, now())
        ON CONFLICT (user_id) DO NOTHING
      `;
      return { success: true };
    }

    const { error } = await supabaseAdmin
      .from("customer_welcome")
      .upsert({ user_id: auth.id }, { onConflict: "user_id", ignoreDuplicates: true });

    if (error) {
      throw new Error(error.message);
    }

    return { success: true };
  });

/**
 * Server Function: Authenticated contact support message submission.
 */
export const submitContactMessageServerFn = createServerFn({ method: "POST" })
  .validator(
    (params: { authToken?: string | undefined; name: string; email: string; message: string }) =>
      params,
  )
  .handler(async ({ data }) => {
    const auth = await getAuthenticatedCustomerId(data.authToken);
    if (!auth) {
      throw new Error("Please sign in to send a message.");
    }

    const name = data.name.trim().slice(0, 100);
    const email = data.email.trim().slice(0, 255);
    const message = data.message.trim().slice(0, 2000);
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || !message) {
      throw new Error("Please enter valid name, email, and message details.");
    }

    const { error } = await supabaseAdmin.from("contact_messages").insert({
      user_id: auth.id,
      name,
      email,
      message,
    });
    if (error) throw new Error("Couldn't send your message. Please try again.");
    return { success: true };
  });

/**
 * Server Function: Authenticated newsletter subscription.
 */
export const subscribeNewsletterServerFn = createServerFn({ method: "POST" })
  .validator((params: { authToken?: string | undefined; email: string }) => params)
  .handler(async ({ data }) => {
    const auth = await getAuthenticatedCustomerId(data.authToken);
    if (!auth) {
      throw new Error("Please sign in to subscribe.");
    }

    const email = data.email.trim().toLowerCase().slice(0, 255);
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      throw new Error("Enter a valid email address.");
    }

    const { error } = await supabaseAdmin
      .from("newsletter_subscribers")
      .insert({ email, user_id: auth.id });
    if (error && error.code !== "23505") {
      throw new Error("Couldn't subscribe right now. Please try again.");
    }
    return { success: true };
  });
