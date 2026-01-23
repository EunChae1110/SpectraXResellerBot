const PRODUCT_SLUGS = {
  FIVEM: 'fivem',
  GTA_V: 'gta-v',
};

const PRODUCT_LABELS = {
  [PRODUCT_SLUGS.FIVEM]: 'FiveM',
  [PRODUCT_SLUGS.GTA_V]: 'GTA-V',
};

const LICENSE_MASKS = {
  [PRODUCT_SLUGS.FIVEM]: 'SX-Macho-******-******-******',
  [PRODUCT_SLUGS.GTA_V]: 'SX-Lexis-******-******-******',
};

module.exports = {
  PRODUCT_SLUGS,
  PRODUCT_LABELS,
  LICENSE_MASKS,
};
