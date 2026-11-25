import teeNavy from "@/assets/tee-navy.jpg";
import teeCream from "@/assets/tee-cream.jpg";
import teeGraphic from "@/assets/tee-graphic.jpg";
import hoodieNavy from "@/assets/hoodie-navy.jpg";
import jacketNavy from "@/assets/jacket-navy.jpg";
import hero from "@/assets/hero-urban-motion.jpg";
import fabricNavy from "@/assets/fabric-navy.jpg";
import teeSilver from "@/assets/tee-silver.jpg";
import teeWhite from "@/assets/tee-white.jpg";
import teeBlack from "@/assets/tee-black.jpg";
import teeSky from "@/assets/tee-sky.jpg";
import hoodieBlack from "@/assets/hoodie-black.jpg";
import hoodieSilver from "@/assets/hoodie-silver.jpg";
import graphicNavy from "@/assets/tee-graphic-navy.jpg";
import fanBlack from "@/assets/tee-fan-black.jpg";
import fanWhite from "@/assets/tee-fan-white.jpg";

const PRODUCT_ASSET_BY_FILENAME: Record<string, string> = {
  "fabric-navy.jpg": fabricNavy,
  "hero-urban-motion.jpg": hero,
  "hoodie-black.jpg": hoodieBlack,
  "hoodie-navy.jpg": hoodieNavy,
  "hoodie-silver.jpg": hoodieSilver,
  "jacket-navy.jpg": jacketNavy,
  "tee-black.jpg": teeBlack,
  "tee-cream.jpg": teeCream,
  "tee-fan-black.jpg": fanBlack,
  "tee-fan-white.jpg": fanWhite,
  "tee-graphic-navy.jpg": graphicNavy,
  "tee-graphic.jpg": teeGraphic,
  "tee-navy.jpg": teeNavy,
  "tee-silver.jpg": teeSilver,
  "tee-sky.jpg": teeSky,
  "tee-white.jpg": teeWhite,
};

/**
 * Resolves raw `/src/assets/...` paths persisted in Supabase into Vite-bundled asset URLs
 * so images load cleanly in both dev mode and production builds.
 */
export function resolveProductAsset(src?: string | null): string {
  if (!src) return "";
  const trimmed = src.trim();
  if (!trimmed) return "";
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("data:")
  ) {
    return trimmed;
  }
  if (trimmed.includes("/assets/") && !trimmed.includes("/src/assets/")) {
    return trimmed;
  }
  const cleanPath = trimmed.split("?")[0] || trimmed;
  const filename = cleanPath.split("/").pop() || cleanPath;
  return PRODUCT_ASSET_BY_FILENAME[filename] || trimmed;
}

export type Color = { name: string; hex: string };
export const SIZES = ["XS", "S", "M", "L", "XL", "XXL"] as const;
export type Size = (typeof SIZES)[number];

export type Product = {
  slug: string;
  name: string;
  category: "t-shirts" | "hoodies";
  tags: ("oversized" | "essentials" | "graphic" | "fan-edition")[];
  /** photo per colour name */
  colorImages?: Record<string, string>;
  price: number;
  mrp: number;
  colors: Color[];
  stock: Partial<Record<Size, number>>;
  images: string[];
  description: string;
  fabric: string;
  fit: string;
  isNew: boolean;
  sold: number;
  rank: number;
};

const C = {
  navy: { name: "Midnight Navy", hex: "#0A1F3C" },
  silver: { name: "Silver Grey", hex: "#C7D1DF" },
  white: { name: "Pure White", hex: "#F5F5F2" },
  cream: { name: "Cream", hex: "#EFE9DD" },
  black: { name: "Jet Black", hex: "#0B0B0D" },
  sky: { name: "Sky Blue", hex: "#A9C8E8" },
};

const full = { XS: 8, S: 20, M: 25, L: 22, XL: 12, XXL: 6 };

export const PRODUCTS: Product[] = [
  {
    slug: "signature-oversized-tee",
    name: "Signature Oversized Tee",
    category: "t-shirts",
    tags: ["oversized", "essentials"],
    price: 879,
    mrp: 1099,
    colors: [C.navy, C.silver, C.white],
    stock: full,
    images: [teeNavy, hero],
    description:
      "Our signature heavyweight tee with a dropped shoulder and a boxy, relaxed silhouette.",
    fabric: "100% combed cotton, 240 GSM",
    fit: "Oversized",
    isNew: true,
    sold: 940,
    rank: 1,
  },
  {
    slug: "relaxed-essential-tee",
    name: "Relaxed Essential Tee",
    category: "t-shirts",
    tags: ["essentials"],
    price: 749,
    mrp: 999,
    colors: [C.cream, C.silver, C.navy],
    stock: { ...full, XXL: 0 },
    images: [teeCream],
    description: "A soft, relaxed everyday tee designed to be worn on repeat.",
    fabric: "100% combed cotton, 200 GSM",
    fit: "Relaxed",
    isNew: true,
    sold: 1210,
    rank: 2,
  },
  {
    slug: "mythic-graphic-tee",
    name: "Mythic Graphic Tee",
    category: "t-shirts",
    tags: ["graphic", "oversized"],
    price: 839,
    mrp: 1199,
    colors: [C.black, C.silver, C.navy],
    stock: full,
    images: [teeGraphic],
    description: "Classical sculpture artwork screen-printed on a heavyweight oversized base.",
    fabric: "100% cotton, 240 GSM, puff-print",
    fit: "Oversized",
    isNew: true,
    sold: 780,
    rank: 3,
  },
  {
    slug: "classic-hoodie",
    name: "Classic Hoodie",
    category: "hoodies",
    tags: ["essentials"],
    price: 2299,
    mrp: 2299,
    colors: [C.navy, C.silver, C.black],
    stock: full,
    images: [hoodieNavy, hero],
    description: "Brushed-back fleece hoodie with a double-layer hood and kangaroo pocket.",
    fabric: "80% cotton / 20% polyester, 360 GSM fleece",
    fit: "Regular",
    isNew: true,
    sold: 650,
    rank: 4,
  },
  {
    slug: "urban-motion-hoodie",
    name: "Urban Motion Hoodie",
    category: "hoodies",
    tags: ["oversized"],
    price: 2499,
    mrp: 2999,
    colors: [C.navy, C.black],
    stock: { S: 5, M: 9, L: 7, XL: 3 },
    images: [hero, hoodieNavy],
    description:
      "The campaign hoodie. Heavyweight, oversized and finished with a silver wing emblem.",
    fabric: "100% cotton French terry, 400 GSM",
    fit: "Oversized",
    isNew: false,
    sold: 820,
    rank: 5,
  },
  {
    slug: "fan-edition-18-tee",
    name: "Fan Edition No.18 Tee",
    category: "t-shirts",
    tags: ["fan-edition", "oversized", "graphic"],
    price: 1199,
    mrp: 1499,
    colors: [C.black, C.white],
    colorImages: { "Jet Black": fanBlack, "Pure White": fanWhite },
    stock: full,
    images: [fanBlack],
    description: "Stadium-night fan edition with a bold No.18 crest. Heavyweight oversized fit.",
    fabric: "100% cotton, 240 GSM",
    fit: "Oversized",
    isNew: true,
    sold: 870,
    rank: 6,
  },
  {
    slug: "logo-classic-tee",
    name: "Logo Classic Tee",
    category: "t-shirts",
    tags: ["essentials", "graphic"],
    price: 959,
    mrp: 1199,
    colors: [C.white, C.navy],
    stock: full,
    images: [teeCream],
    description: "Clean classic tee with the CAVENHURST wordmark.",
    fabric: "100% combed cotton, 220 GSM",
    fit: "Regular",
    isNew: false,
    sold: 560,
    rank: 7,
  },
  {
    slug: "racer-panel-tee",
    name: "Racer Panel Tee",
    category: "t-shirts",
    tags: ["oversized"],
    price: 1104,
    mrp: 1299,
    colors: [C.navy, C.silver, C.white],
    stock: { ...full, XS: 0 },
    images: [teeNavy],
    description: "Sport-inspired panelled tee with contrast piping along the sleeves.",
    fabric: "Cotton-poly blend, 230 GSM",
    fit: "Oversized",
    isNew: false,
    sold: 430,
    rank: 8,
  },
  {
    slug: "flow-print-tee",
    name: "Flow Print Tee",
    category: "t-shirts",
    tags: ["graphic"],
    price: 1039,
    mrp: 1299,
    colors: [C.black, C.navy],
    stock: full,
    images: [teeGraphic],
    description: "Abstract flowing-fabric print on a premium heavyweight tee.",
    fabric: "100% cotton, 240 GSM",
    fit: "Oversized",
    isNew: false,
    sold: 390,
    rank: 9,
  },
  {
    slug: "midnight-zip-hoodie",
    name: "Midnight Zip Hoodie",
    category: "hoodies",
    tags: ["essentials"],
    price: 2599,
    mrp: 2999,
    colors: [C.navy, C.silver],
    stock: {},
    images: [hoodieNavy],
    description: "Full-zip fleece hoodie for layering through the city.",
    fabric: "80% cotton / 20% polyester fleece",
    fit: "Regular",
    isNew: false,
    sold: 280,
    rank: 10,
  },
  {
    slug: "fan-edition-crest-tee",
    name: "Fan Edition Crest Tee",
    category: "t-shirts",
    tags: ["fan-edition", "graphic"],
    price: 1099,
    mrp: 1399,
    colors: [C.white, C.black],
    colorImages: { "Jet Black": fanBlack, "Pure White": fanWhite },
    stock: full,
    images: [fanWhite],
    description: "Matchday crest tee for the stands and the streets.",
    fabric: "100% cotton, 220 GSM",
    fit: "Relaxed",
    isNew: false,
    sold: 410,
    rank: 11,
  },
  {
    slug: "sky-essential-tee",
    name: "Sky Essential Tee",
    category: "t-shirts",
    tags: ["essentials"],
    price: 749,
    mrp: 999,
    colors: [C.sky, C.white],
    stock: full,
    images: [teeCream],
    description: "Your everyday essential in a soft sky tone.",
    fabric: "100% combed cotton, 200 GSM",
    fit: "Relaxed",
    isNew: true,
    sold: 340,
    rank: 12,
  },
];

export const COLLECTIONS = {
  "t-shirts": {
    title: "T-Shirts",
    tagline: "Premium tees for everyday movement.",
    filter: (p: Product) => p.category === "t-shirts",
  },
  hoodies: {
    title: "Hoodies",
    tagline: "Heavyweight comfort, built for the city.",
    filter: (p: Product) => p.category === "hoodies",
  },
  oversized: {
    title: "Oversized",
    tagline: "Boxy silhouettes. Effortless drape.",
    filter: (p: Product) => p.tags.includes("oversized"),
  },
  graphic: {
    title: "Graphics",
    tagline: "Art you can wear.",
    filter: (p: Product) => p.tags.includes("graphic"),
  },
  "fan-edition": {
    title: "Fan Edition",
    tagline: "Wear your game.",
    filter: (p: Product) => p.tags.includes("fan-edition"),
  },
} as const;
export type CollectionSlug = keyof typeof COLLECTIONS;

let liveProductsMap: Map<string, Product> | null = null;

export function setLiveProducts(list: Product[]) {
  liveProductsMap = new Map(list.map((p) => [p.slug, p]));
}

export const getProduct = (slug: string) => {
  if (liveProductsMap && liveProductsMap.has(slug)) {
    return liveProductsMap.get(slug);
  }
  return PRODUCTS.find((p) => p.slug === slug);
};

export const getAllProducts = (): Product[] => {
  if (liveProductsMap && liveProductsMap.size > 0) {
    return Array.from(liveProductsMap.values());
  }
  return PRODUCTS;
};

export const inStock = (p: Product) => Object.values(p.stock).some((n) => (n ?? 0) > 0);

export const COLOR_PHOTOS: Record<string, Record<string, string>> = {
  "t-shirts": {
    "Midnight Navy": teeNavy,
    "Silver Grey": teeSilver,
    "Pure White": teeWhite,
    Cream: teeCream,
    "Jet Black": teeBlack,
    "Sky Blue": teeSky,
  },
  hoodies: { "Midnight Navy": hoodieNavy, "Silver Grey": hoodieSilver, "Jet Black": hoodieBlack },
  graphic: { "Jet Black": teeGraphic, "Midnight Navy": graphicNavy, "Silver Grey": teeGraphic },
};
/** The photo to show for a product in the chosen colour. */
export const imageFor = (p: Product, color?: string) => {
  const primary = resolveProductAsset(p.images[0]) || p.images[0] || "";
  if (!color) return primary;
  const map =
    p.colorImages ??
    (p.slug === "mythic-graphic-tee" || p.slug === "flow-print-tee"
      ? COLOR_PHOTOS["graphic"]
      : COLOR_PHOTOS[p.category]);
  const mapped = map?.[color];
  return (mapped ? resolveProductAsset(mapped) : "") || primary;
};
