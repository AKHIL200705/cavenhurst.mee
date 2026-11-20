import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getDb } from "@/server/db";
import { verifyGoogleSessionOrToken } from "./auth";

/**
 * Derives authenticated customer identity strictly from verified server session or passed bearer token.
 */
export async function getAuthenticatedCustomerId(passedToken?: string | null): Promise<{
  id: string; // Auth provider UID or Supabase UUID
  customerUuid?: string | undefined;
  email?: string | undefined;
} | null> {
  try {
    let token = passedToken?.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      const request = getRequest();
      if (request?.headers) {
        const authHeader = request.headers.get("authorization");
        if (authHeader && authHeader.startsWith("Bearer ")) {
          token = authHeader.replace(/^Bearer\s+/i, "").trim();
        }
      }
    }
    if (!token || token.split(".").length !== 3) return null;

    // 1. Google session check
    const googleSession = await verifyGoogleSessionOrToken(token);
    if (googleSession) {
      // Find matching customer row in public.customers
      let { data: cust } = await supabaseAdmin
        .from("customers")
        .select("id, email")
        .eq("auth_provider_uid", googleSession.sub)
        .maybeSingle();

      if (!cust && googleSession.email) {
        const { data: custByEmail } = await supabaseAdmin
          .from("customers")
          .select("id, email")
          .eq("email", googleSession.email.toLowerCase().trim())
          .maybeSingle();
        cust = custByEmail;
      }

      return {
        id: googleSession.sub,
        customerUuid: cust?.id,
        email: googleSession.email,
      };
    }

    // 2. Supabase auth check
    const {
      data: { user },
      error,
    } = await supabaseAdmin.auth.getUser(token);
    if (!error && user) {
      let { data: cust } = await supabaseAdmin
        .from("customers")
        .select("id, email")
        .eq("auth_provider_uid", user.id)
        .maybeSingle();

      if (!cust && user.email) {
        const { data: custByEmail } = await supabaseAdmin
          .from("customers")
          .select("id, email")
          .eq("email", user.email.toLowerCase().trim())
          .maybeSingle();
        cust = custByEmail;
      }

      return {
        id: user.id,
        customerUuid: cust?.id,
        email: user.email,
      };
    }

    return null;
  } catch {
    return null;
  }
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

    const sql = getDb();
    if (sql) {
      try {
        const [profile] = await sql`
          SELECT p.id, p.full_name, p.email, p.phone, p.avatar_url
          FROM public.profiles p
          WHERE p.id = ${auth.id}::uuid
          LIMIT 1
        `;
        if (profile) {
          return {
            id: profile["id"] as string,
            fullName: (profile["full_name"] as string | null) ?? null,
            email: (profile["email"] as string | null) ?? null,
            phone: (profile["phone"] as string | null) ?? null,
            avatarUrl: (profile["avatar_url"] as string | null) ?? null,
          };
        }

        const [cust] = await sql`
          SELECT c.id, c.full_name, c.email, c.phone, c.profile_image
          FROM public.customers c
          WHERE c.id = ${auth.customerUuid || auth.id}::uuid OR c.auth_provider_uid = ${auth.id}
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

    const cleanEmail = data.email?.toLowerCase().trim() || null;
    const cleanName = data.fullName?.trim() || null;
    const cleanPhone = data.phone?.replace(/\D/g, "").slice(-10) || null;

    // 1. Update public.profiles
    try {
      await sql`
        UPDATE public.profiles SET
          email = COALESCE(${cleanEmail}, email),
          full_name = COALESCE(${cleanName}, full_name),
          phone = COALESCE(${cleanPhone}, phone),
          updated_at = now()
        WHERE id = ${auth.id}::uuid
      `;
    } catch (err) {
      console.warn("[updateProfile] profiles update note:", err);
    }

    // 2. Update public.customers
    try {
      await sql`
        UPDATE public.customers SET
          email = COALESCE(${cleanEmail}, email),
          full_name = COALESCE(${cleanName}, full_name),
          phone = COALESCE(${cleanPhone}, phone),
          updated_at = now()
        WHERE id = ${auth.customerUuid || auth.id}::uuid OR auth_provider_uid = ${auth.id}
      `;
    } catch (err) {
      console.warn("[updateProfile] customers update note:", err);
    }

    // 3. Update auth.users if cleanEmail is provided
    try {
      if (cleanEmail) {
        await sql`
          UPDATE auth.users SET
            email = ${cleanEmail},
            email_confirmed_at = COALESCE(email_confirmed_at, now()),
            updated_at = now(),
            raw_user_meta_data = raw_user_meta_data || ${JSON.stringify({
              email: cleanEmail,
              full_name: cleanName,
            })}::jsonb
          WHERE id = ${auth.id}::uuid
        `;
      }
    } catch (err) {
      console.warn("[updateProfile] auth.users update note:", err);
    }

    return { success: true };
  });
