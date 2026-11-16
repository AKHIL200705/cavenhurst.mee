import { getStoreCatalogServerFn } from '../src/server/catalog.ts';

// Test catalog server function
async function test() {
  try {
    const catalog = await getStoreCatalogServerFn();
    console.log(`Successfully fetched catalog! Total products: ${catalog.length}`);
    if (catalog.length > 0) {
      console.log(`Sample product: ${catalog[0].name} (₹${catalog[0].price}) [${catalog[0].slug}]`);
    }
  } catch (err) {
    console.error("Error fetching catalog:", err);
  }
}

test();
