// Central pricing configuration for quick-order SKUs
// Prices are in INR per KG

const QUICK_PRODUCTS = [
  {
    key: 'atta_all_pure_10kg',
    name: '10 Kg All Pure Chakki Fresh Atta',
    pricePerKg: 35,
    bagSizeKg: 10,
    defaultPackaging: '10kg Bags',
    category: 'atta',
  },
  {
    key: 'atta_premium_10kg',
    name: '10 Kg Premium Chakki Fresh Atta',
    pricePerKg: 40,
    bagSizeKg: 10,
    defaultPackaging: '10kg Bags',
    category: 'atta',
  },
  {
    key: 'atta_rajasthan_10kg',
    name: '10 kg Rajsthan Wheat Chakki Fresh Atta',
    pricePerKg: 40,
    bagSizeKg: 10,
    defaultPackaging: '10kg Bags',
    category: 'atta',
  },
  {
    key: 'atta_rajasthan_5kg',
    name: '5 kg Rajsthan Wheat Chakki Fresh Atta',
    pricePerKg: 40,
    bagSizeKg: 5,
    defaultPackaging: '5kg Bags',
    category: 'atta',
  },
  {
    key: 'wheat_bran_golden',
    name: 'Golden Wheat Bran',
    pricePerKg: 22.5,
    defaultPackaging: 'Loose',
    category: 'bran',
  },
  {
    key: 'sulphur_roll_yellow',
    name: 'Yellow Sulphur Roll',
    pricePerKg: 18,
    defaultPackaging: 'Loose',
    category: 'chemical',
  },
  {
    key: 'sulphur_sticks_yellow',
    name: 'Yellow Sulphur Sticks',
    pricePerKg: 20,
    defaultPackaging: 'Loose',
    category: 'chemical',
  },
  {
    key: 'h_acid_industrial',
    name: 'H Acid (for industrial use)',
    pricePerKg: 540,
    defaultPackaging: 'Loose',
    category: 'chemical',
  },
];

function getQuickProductsMap() {
  return QUICK_PRODUCTS.reduce((acc, p) => {
    acc[p.key] = p;
    return acc;
  }, {});
}

module.exports = {
  QUICK_PRODUCTS,
  getQuickProductsMap,
};
