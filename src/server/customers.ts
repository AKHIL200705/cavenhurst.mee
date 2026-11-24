import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getDb } from "@/server/db";
import { getAuthenticatedCustomerId } from "./auth-helpers";

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
          ? `customer_id.eq.${auth.customerUuid},customer_auth_uid.eq.${auth.id}`
          : `customer_auth_uid.eq.${auth.id}`,
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
      orClauses.push(`customer_id.eq.${auth.customerUuid}`);
    }
    orClauses.push(`user_id.eq.${auth.id}`);
    if (auth.email) {
      orClauses.push(`customer_email.eq.${auth.email.toLowerCase().trim()}`);
    }

    const { data: orders, error } = await supabaseAdmin
      .from("orders")
      .select("id,order_number,total,status,payment_status,shipment_status,awb_number,created_at,items")
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
            ? `customer_id.eq.${customerUuid},customer_auth_uid.eq.${auth.id}`
            : `customer_auth_uid.eq.${auth.id}`,
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
          ? `customer_id.eq.${auth.customerUuid},customer_auth_uid.eq.${auth.id}`
          : `customer_auth_uid.eq.${auth.id}`,
      );

    if (error) throw new Error(error.message);
    return { success: true };
  });

export interface CustomerProfileData {
  id: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
}

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
            SELECT p.id, p.full_name, p.email, p.phone, p.avatar_url
            FROM public.profiles p
            WHERE p.id = ${authUuid}::uuid
            LIMIT 1
          `;
          profile = p;
        }

        if (!profile && cleanEmail) {
          const [p] = await sql`
            SELECT p.id, p.full_name, p.email, p.phone, p.avatar_url
            FROM public.profiles p
            WHERE lower(p.email) = ${cleanEmail}
            LIMIT 1
          `;
          profile = p;
        }

        if (profile) {
          return {
            id: profile["id"] as string,
            fullName: (profile["full_name"] as string | null) ?? null,
            email: (profile["email"] as string | null) ?? null,
            phone: (profile["phone"] as string | null) ?? null,
            avatarUrl: (profile["avatar_url"] as string | null) ?? null,
          };
        }

        const customerUuid =
          auth.customerUuid && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(auth.customerUuid)
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
          return {
            id: cust["id"] as string,
            fullName: (cust["full_name"] as string | null) ?? null,
            email: (cust["email"] as string | null) ?? null,
            phone: (cust["phone"] as string | null) ?? null,
            avatarUrl: (cust["profile_image"] as string | null) ?? null,
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
      avatarUrl: null,
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
    const cleanPhone = data.phone?.replace(/\D/g, "").slice(-10) || null;

    let updatedAny = false;

    // 1. Update public.profiles
    try {
      if (authUuid) {
        await sql`
          UPDATE public.profiles SET
            email = COALESCE(${cleanEmail}, email),
            full_name = COALESCE(${cleanName}, full_name),
            phone = COALESCE(${cleanPhone}, phone),
            updated_at = now()
          WHERE id = ${authUuid}::uuid
        `;
        updatedAny = true;
      } else if (cleanEmail) {
        await sql`
          UPDATE public.profiles SET
            full_name = COALESCE(${cleanName}, full_name),
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
        auth.customerUuid && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(auth.customerUuid)
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
      if (authUuid && (cleanEmail || cleanName)) {
        await sql`
          UPDATE auth.users SET
            email = COALESCE(${cleanEmail}, email),
            updated_at = now(),
            raw_user_meta_data = raw_user_meta_data || ${sql.json({
              ...(cleanEmail ? { email: cleanEmail } : {}),
              ...(cleanName ? { full_name: cleanName, name: cleanName } : {}),
              ...(cleanPhone ? { phone: cleanPhone } : {}),
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
