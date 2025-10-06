// Central pricing configuration for quick-order SKUs
// Prices are in INR per KG

const QUICK_PRODUCT_BASES = [
  {
    key: "family_atta",
    name: "FAMILY ATTA",
    category: "atta",
    bagSizeKg: 40,
    defaultPackaging: "40kg Bags",
  },
  {
    key: "all_pure",
    name: "ALL PURE",
    category: "atta",
    bagSizeKg: 40,
    defaultPackaging: "40kg Bags",
  },
  {
    key: "family_atta_small",
    name: "family atta",
    category: "atta",
    bagSizeKg: 5,
    defaultPackaging: "40kg Bags",
  },
  {
    key: "all_pure_small",
    name: "all pure",
    category: "atta",
    bagSizeKg: 5,
    defaultPackaging: "40kg Bags",
  },
];

const CITY_CONFIG = {
  ludhiana: [
    { productKey: "family_atta", pricePerKg: 32.0 },
    { productKey: "family_atta_small", pricePerKg: 32.0 },
  ],
  jalandhar: [
    { productKey: "family_atta", pricePerKg: 32.5 },
    { productKey: "family_atta_small", pricePerKg: 32.5 },
  ],
  ambala: [
    { productKey: "family_atta", pricePerKg: 33.0 },
    { productKey: "family_atta_small", pricePerKg: 33.0 },
    { productKey: "all_pure", pricePerKg: 35.5 },
    { productKey: "all_pure_small", pricePerKg: 35.5 },
  ],
  "fatehgarh sahib": [
    { productKey: "family_atta", pricePerKg: 32.0 },
    { productKey: "family_atta_small", pricePerKg: 32.0 },
  ],
  delhi: [
    { productKey: "all_pure", pricePerKg: 35.0 },
    { productKey: "all_pure_small", pricePerKg: 35.0 },
  ],
  jammu: [
    { productKey: "all_pure", pricePerKg: 35.5 },
    { productKey: "all_pure_small", pricePerKg: 35.5 },
  ],
};

const CITY_TOKENS = {
  ludhiana: ["ludhiana"],
  jalandhar: ["jalandhar"],
  ambala: ["ambala"],
  "fatehgarh sahib": ["fatehgarh sahib"],
  delhi: ["delhi", "delhi:east", "delhi:west"],
  jammu: ["jammu"],
};

function buildProduct(baseKey, cityKey, pricePerKg = null) {
  const normalizedCity = cityKey.split(":")[0];
  const base = QUICK_PRODUCT_BASES.find((p) => p.key === baseKey);
  if (!base) return null;

  return {
    ...base,
    key: `${baseKey}_${normalizedCity.replace(/\s+/g, "_")}`,
    name: base.name,
    pricePerKg: pricePerKg || 0,
    cityTokens: CITY_TOKENS[normalizedCity] || [normalizedCity],
  };
}

function getProductsForGodown(godown) {
  const city = (godown?.location?.city || "").toLowerCase();
  const config = CITY_CONFIG[city];
  if (!config) return [];

  // Handle both single product and multiple products per city
  const configs = Array.isArray(config) ? config : [config];
  const products = [];

  configs.forEach((cfg) => {
    const product = buildProduct(cfg.productKey, city, cfg.pricePerKg);
    if (product) {
      products.push(product);
    }
  });

  return products;
}

function getProductsForGodowns(godowns = []) {
  const seen = new Set();
  const products = [];
  godowns.forEach((g) => {
    const list = getProductsForGodown(g);
    list.forEach((prod) => {
      if (prod && !seen.has(prod.key)) {
        seen.add(prod.key);
        products.push(prod);
      }
    });
  });
  return products;
}

module.exports = {
  QUICK_PRODUCT_BASES,
  CITY_CONFIG,
  CITY_TOKENS,
  getProductsForGodown,
  getProductsForGodowns,
};
