import postgres from "postgres";
import fs from "fs";

const env = fs.readFileSync(".env", "utf8");
const match = env.match(/DATABASE_URL="?([^\r\n"]+)"?/);
const dbUrl = match ? match[1] : process.env.DATABASE_URL;

console.log("Connecting to PostgreSQL database...");
const sql = postgres(dbUrl, { ssl: { rejectUnauthorized: false } });

async function run() {
  try {
    console.log("Reading migration SQL...");
    const migrationSql = fs.readFileSync(
      "supabase/migrations/20261116000001_full_production_schema.sql",
      "utf8",
    );

    console.log("Applying migration...");
    await sql.unsafe(migrationSql);
    console.log("Migration executed successfully!");

    // 1. Sync admin users
    console.log("Syncing admin users...");
    await sql`
      INSERT INTO public.admin_users (email, full_name, role, permissions, is_active)
      VALUES 
        ('akhilsaiabbireddy2007@gmail.com', 'Akhil Sai Abbireddy', 'superadmin', '["*"]'::jsonb, true),
        ('cavenhurst@gmail.com', 'Cavenhusrt Management', 'admin', '["*"]'::jsonb, true)
      ON CONFLICT (email) DO UPDATE SET 
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        is_active = true,
        updated_at = now();
    `;

    // 2. Sync existing customer profiles into customers & customer_auth_providers
    console.log("Syncing customers from customer_profiles...");
    const profiles = await sql`SELECT * FROM public.customer_profiles`;
    for (const p of profiles) {
      const [cust] = await sql`
        INSERT INTO public.customers (auth_provider_uid, full_name, phone, profile_image, account_status)
        VALUES (${p.id}, ${p.full_name || "Customer"}, ${p.phone || null}, ${p.avatar_url || null}, 'active')
        ON CONFLICT (auth_provider_uid) DO UPDATE SET
          full_name = COALESCE(EXCLUDED.full_name, customers.full_name),
          phone = COALESCE(EXCLUDED.phone, customers.phone),
          profile_image = COALESCE(EXCLUDED.profile_image, customers.profile_image),
          updated_at = now()
        RETURNING id;
      `;

      if (cust?.id) {
        await sql`
          INSERT INTO public.customer_auth_providers (customer_id, provider, provider_uid, phone)
          VALUES (${cust.id}, 'google', ${p.id}, ${p.phone || null})
          ON CONFLICT (provider, provider_uid) DO NOTHING;
        `;
      }
    }

    // 3. Populate product_variants and product_images from existing products
    console.log("Populating product variants & images for existing products...");
    const products = await sql`SELECT * FROM public.products`;
    for (const prod of products) {
      // Images
      if (Array.isArray(prod.images) && prod.images.length > 0) {
        for (let i = 0; i < prod.images.length; i++) {
          const imgUrl = prod.images[i];
          const exists = await sql`
            SELECT id FROM public.product_images 
            WHERE product_id = ${prod.id} AND image_url = ${imgUrl}
          `;
          if (exists.length === 0) {
            await sql`
              INSERT INTO public.product_images (product_id, image_url, sort_order, is_primary)
              VALUES (${prod.id}, ${imgUrl}, ${i}, ${i === 0});
            `;
          }
        }
      }

      // Stock & Variants
      // prod.stock is e.g. {"S": 10, "M": 15, "L": 12, "XL": 8}
      const stockObj = prod.stock || { M: 10, L: 10 };
      const colors =
        Array.isArray(prod.colors) && prod.colors.length > 0
          ? prod.colors
          : [{ name: "Default", hex: "#1C1917" }];

      for (const [size, qty] of Object.entries(stockObj)) {
        for (const col of colors) {
          const colorName = typeof col === "string" ? col : col.name || "Default";
          const colorHex = typeof col === "string" ? null : col.hex || null;
          const sku = `${prod.slug}-${size}-${colorName}`.toLowerCase().replace(/[^a-z0-9-]/g, "");

          const [variant] = await sql`
            INSERT INTO public.product_variants (product_id, sku, size, color, color_hex, stock_quantity, is_available)
            VALUES (${prod.id}, ${sku}, ${size}, ${colorName}, ${colorHex}, ${Number(qty) || 0}, ${Number(qty) > 0})
            ON CONFLICT (sku) DO UPDATE SET
              stock_quantity = EXCLUDED.stock_quantity,
              is_available = EXCLUDED.stock_quantity > 0,
              updated_at = now()
            RETURNING id;
          `;

          if (variant?.id) {
            await sql`
              INSERT INTO public.inventory (product_id, variant_id, sku, stock_quantity, safety_stock, reorder_point)
              VALUES (${prod.id}, ${variant.id}, ${sku}, ${Number(qty) || 0}, 5, 10)
              ON CONFLICT (product_id, variant_id) DO UPDATE SET
                stock_quantity = EXCLUDED.stock_quantity,
                updated_at = now();
            `;
          }
        }
      }
    }

    // 4. Seed Site Settings
    console.log("Seeding site settings...");
    await sql`
      INSERT INTO public.site_settings (key, value, description)
      VALUES 
        ('general', '{"brandName": "CAVENHUSRT", "tagline": "Timeless Elegance & Heritage Craftsmanship", "contactEmail": "contact@cavenhusrt.com", "currency": "INR", "currencySymbol": "₹"}'::jsonb, 'General store settings'),
        ('shipping', '{"freeShippingThreshold": 4999, "standardShippingFee": 199, "expressShippingFee": 399, "estimatedDays": "3-5 business days"}'::jsonb, 'Shipping calculation settings'),
        ('announcement', '{"enabled": true, "text": "Complimentary Heritage Packaging on all orders above ₹4,999", "link": "/shop"}'::jsonb, 'Header announcement banner')
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        updated_at = now();
    `;

    // 5. Seed Banners
    console.log("Seeding initial banners...");
    const bannerCount = await sql`SELECT count(*) FROM public.banners`;
    if (parseInt(bannerCount[0].count) === 0) {
      await sql`
        INSERT INTO public.banners (title, subtitle, image_url, link_url, button_text, placement, is_active, sort_order)
        VALUES 
          ('Autumn / Winter Heritage Collection', 'Tailored craftsmanship inspired by classic British silhouettes', 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=1600&q=80', '/collections/heritage', 'Explore Collection', 'hero', true, 1),
          ('Artisanal Outerwear & Cashmere', 'Handwoven fabrics designed for enduring distinction', 'https://images.unsplash.com/photo-1544441893-675973e31985?w=1600&q=80', '/collections/outerwear', 'View Outerwear', 'hero', true, 2);
      `;
    }

    // 6. Verify all 30+ tables
    console.log("\n--- VERIFYING ALL TABLES IN DATABASE ---");
    const tableList = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `;
    console.log(`Total public tables: ${tableList.length}`);
    console.log(tableList.map((t) => t.table_name));

    // 7. Verify counts
    const counts = {};
    for (const t of tableList) {
      try {
        const c = await sql.unsafe(`SELECT count(*) FROM public."${t.table_name}"`);
        counts[t.table_name] = parseInt(c[0].count);
      } catch (e) {
        counts[t.table_name] = "err";
      }
    }
    console.log("\nRow counts across tables:");
    console.log(JSON.stringify(counts, null, 2));
  } catch (err) {
    console.error("Error applying migration:", err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

run();
