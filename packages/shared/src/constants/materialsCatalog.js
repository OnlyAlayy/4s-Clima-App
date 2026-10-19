/**
 * Catálogo Oficial de Materiales e Instalación de Cañería 4S Clima.
 * Fuente: Planilla oficial "MATERIALES INSTALACIÓN CAÑERIA - SEP 26 - REV 0 - WS.xlsx"
 * 
 * Todos los precios base son NETOS (PRECIO + IVA), a los cuales se aplica el 21% de IVA en Factura A.
 */

export const INSTALLATION_COMBOS_BY_CAPACITY = {
  '3000': {
    capacityKey: '3000',
    label: '3.000 frig/h',
    pipeSpecs: '1/2" - 1/4"',
    items: {
      pipeMeter: { label: 'Metros de Caño (1/2 - 1/4)', unit: 'metro', price: 38131.35 },
      bracket: { label: 'Ménsula 42cm', unit: 'unidad', price: 16298.70 },
      bracketLegs: { label: 'Patas Ménsula', unit: 'unidad', price: 6789.31 },
      floorLegs: { label: 'Patas Piso', unit: 'unidad', price: 6461.40 },
      fixingKit: { label: 'Kit Fijación', unit: 'unidad', price: 2076.36 },
      installationLabor: { label: 'Mano de Obra Instalación 3.000 FG', unit: 'unidad', price: 263500.00 },
      uninstallationLabor: { label: 'Desinstalación 3.000 FG (50% M.O.)', unit: 'unidad', price: 131750.00 },
    },
  },
  '4500': {
    capacityKey: '4500',
    label: '4.500 frig/h',
    pipeSpecs: '1/2" - 1/4"',
    items: {
      pipeMeter: { label: 'Metros de Caño (1/2 - 1/4)', unit: 'metro', price: 43043.41 },
      bracket: { label: 'Ménsula 52cm', unit: 'unidad', price: 19018.78 },
      bracketLegs: { label: 'Patas Ménsula', unit: 'unidad', price: 6789.31 },
      floorLegs: { label: 'Patas Piso', unit: 'unidad', price: 6461.40 },
      fixingKit: { label: 'Kit Fijación', unit: 'unidad', price: 2076.36 },
      installationLabor: { label: 'Mano de Obra Instalación 4.500 FG', unit: 'unidad', price: 323000.00 },
      uninstallationLabor: { label: 'Desinstalación 4.500 FG (50% M.O.)', unit: 'unidad', price: 161500.00 },
    },
  },
  '5500': {
    capacityKey: '5500',
    label: '5.500 frig/h',
    pipeSpecs: '5/8" - 1/4"',
    items: {
      pipeMeter: { label: 'Metros de Caño (5/8 - 1/4)', unit: 'metro', price: 49952.49 },
      bracket: { label: 'Ménsula 62cm', unit: 'unidad', price: 23072.28 },
      bracketLegs: { label: 'Patas Ménsula', unit: 'unidad', price: 6789.31 },
      floorLegs: { label: 'Patas Piso', unit: 'unidad', price: 6461.40 },
      fixingKit: { label: 'Kit Fijación', unit: 'unidad', price: 2076.36 },
      installationLabor: { label: 'Mano de Obra Instalación 5.500 FG', unit: 'unidad', price: 433500.00 },
      uninstallationLabor: { label: 'Desinstalación 5.500 FG (50% M.O.)', unit: 'unidad', price: 216750.00 },
    },
  },
  '6000': {
    capacityKey: '6000',
    label: '6.000 frig/h',
    pipeSpecs: '5/8" - 1/4"',
    items: {
      pipeMeter: { label: 'Metros de Caño (5/8 - 1/4)', unit: 'metro', price: 44894.63 },
      bracket: { label: 'Ménsula 82cm', unit: 'unidad', price: 67437.66 },
      bracketLegs: { label: 'Patas Ménsula', unit: 'unidad', price: 6789.31 },
      floorLegs: { label: 'Patas Piso', unit: 'unidad', price: 6461.40 },
      fixingKit: { label: 'Kit Fijación', unit: 'unidad', price: 2076.36 },
      installationLabor: { label: 'Mano de Obra Instalación 6.000 FG', unit: 'unidad', price: 399500.00 },
      uninstallationLabor: { label: 'Desinstalación 6.000 FG (50% M.O.)', unit: 'unidad', price: 199750.00 },
    },
  },
  '8000': {
    capacityKey: '8000',
    label: '8.000 frig/h',
    pipeSpecs: '5/8" - 1/8"',
    items: {
      pipeMeter: { label: 'Metros de Caño (5/8 - 1/8)', unit: 'metro', price: 49806.69 },
      bracket: { label: 'Ménsula 82cm', unit: 'unidad', price: 67437.66 },
      bracketLegs: { label: 'Patas Ménsula', unit: 'unidad', price: 6789.31 },
      floorLegs: { label: 'Patas Piso', unit: 'unidad', price: 6461.40 },
      fixingKit: { label: 'Kit Fijación', unit: 'unidad', price: 2076.36 },
      installationLabor: { label: 'Mano de Obra Instalación 8.000 FG', unit: 'unidad', price: 731000.00 },
      uninstallationLabor: { label: 'Desinstalación 8.000 FG (50% M.O.)', unit: 'unidad', price: 365500.00 },
    },
  },
  '12000_18000': {
    capacityKey: '12000_18000',
    label: '12.000 a 18.000 frig/h',
    pipeSpecs: '3/8" - 3/4"',
    items: {
      pipeMeter: { label: 'Metros de Caño (3/8 - 3/4)', unit: 'metro', price: 54310.36 },
      bracket: { label: 'Ménsula 82cm', unit: 'unidad', price: 67437.66 },
      bracketLegs: { label: 'Patas Ménsula', unit: 'unidad', price: 6789.31 },
      floorLegs: { label: 'Patas Piso 5 TR', unit: 'unidad', price: 21907.05 },
      fixingKit: { label: 'Kit Fijación', unit: 'unidad', price: 2076.36 },
      installationLabor: { label: 'Mano de Obra Instalación 12.000-18.000 FG', unit: 'unidad', price: 1360000.00 },
      uninstallationLabor: { label: 'Desinstalación 12.000-18.000 FG (50% M.O.)', unit: 'unidad', price: 680000.00 },
    },
  },
};

export const CATALOG_CATEGORIES = {
  COMBOS: 'Combos por Frigorías (3000 a 18000 FG)',
  COPPER_PIPES: 'Caños de Cobre',
  RIGID_PIPES: 'Caños Rígidos',
  INSULATION_HOSES: 'Aislaciones y Mangueras',
  CABLES_TAPES: 'Cables y Cintas',
  BRACKETS_FIXINGS: 'Ménsulas y Soportes',
  LABOR: 'Mano de Obra Instalación / Desinstalación',
};

/**
 * Catálogo Completo de Ítems Individuales y Mano de Obra
 */
export const OFFICIAL_MATERIALS_CATALOG = [
  // --- COMBOS POR FRIGORÍAS ---
  {
    id: 'mat-combo-3000',
    name: 'Cañería Instalación Completa 3.000 FG (1/2" - 1/4")',
    category: CATALOG_CATEGORIES.COMBOS,
    unit: 'metro',
    netPrice: 38131.35,
    keywords: ['3000', '3.000', 'cañeria 3000', 'caño 3000', '1/2 1/4'],
  },
  {
    id: 'mat-combo-4500',
    name: 'Cañería Instalación Completa 4.500 FG (1/2" - 1/4")',
    category: CATALOG_CATEGORIES.COMBOS,
    unit: 'metro',
    netPrice: 43043.41,
    keywords: ['4500', '4.500', 'cañeria 4500', 'caño 4500'],
  },
  {
    id: 'mat-combo-5500',
    name: 'Cañería Instalación Completa 5.500 FG (5/8" - 1/4")',
    category: CATALOG_CATEGORIES.COMBOS,
    unit: 'metro',
    netPrice: 49952.49,
    keywords: ['5500', '5.500', 'cañeria 5500', 'caño 5500', '5/8 1/4'],
  },
  {
    id: 'mat-combo-6000',
    name: 'Cañería Instalación Completa 6.000 FG (5/8" - 1/4")',
    category: CATALOG_CATEGORIES.COMBOS,
    unit: 'metro',
    netPrice: 44894.63,
    keywords: ['6000', '6.000', 'cañeria 6000', 'caño 6000'],
  },
  {
    id: 'mat-combo-8000',
    name: 'Cañería Instalación Completa 8.000 FG (5/8" - 1/8")',
    category: CATALOG_CATEGORIES.COMBOS,
    unit: 'metro',
    netPrice: 49806.69,
    keywords: ['8000', '8.000', 'cañeria 8000', 'caño 8000'],
  },
  {
    id: 'mat-combo-12000',
    name: 'Cañería Instalación Completa 12.000 a 18.000 FG (3/8" - 3/4")',
    category: CATALOG_CATEGORIES.COMBOS,
    unit: 'metro',
    netPrice: 54310.36,
    keywords: ['12000', '18000', '12.000', '18.000', 'cañeria 12000', 'cañeria 18000', '3/8 3/4'],
  },

  // --- CAÑOS DE COBRE ---
  { id: 'cop-1-4', name: 'Caño de Cobre 1/4"', category: CATALOG_CATEGORIES.COPPER_PIPES, unit: 'metro', netPrice: 5604.72, keywords: ['1/4', 'cobre 1/4'] },
  { id: 'cop-3-8', name: 'Caño de Cobre 3/8"', category: CATALOG_CATEGORIES.COPPER_PIPES, unit: 'metro', netPrice: 8712.00, keywords: ['3/8', 'cobre 3/8'] },
  { id: 'cop-1-2', name: 'Caño de Cobre 1/2"', category: CATALOG_CATEGORIES.COPPER_PIPES, unit: 'metro', netPrice: 12196.80, keywords: ['1/2', 'cobre 1/2'] },
  { id: 'cop-5-8', name: 'Caño de Cobre 5/8"', category: CATALOG_CATEGORIES.COPPER_PIPES, unit: 'metro', netPrice: 15681.60, keywords: ['5/8', 'cobre 5/8'] },
  { id: 'cop-3-4', name: 'Caño de Cobre 3/4"', category: CATALOG_CATEGORIES.COPPER_PIPES, unit: 'metro', netPrice: 18585.60, keywords: ['3/4', 'cobre 3/4'] },
  { id: 'cop-7-8', name: 'Caño de Cobre 7/8"', category: CATALOG_CATEGORIES.COPPER_PIPES, unit: 'metro', netPrice: 23232.00, keywords: ['7/8', 'cobre 7/8'] },
  { id: 'cop-1-1-8', name: 'Caño de Cobre 1" 1/8', category: CATALOG_CATEGORIES.COPPER_PIPES, unit: 'metro', netPrice: 33584.76, keywords: ['1 1/8', '1" 1/8', 'cobre 1 1/8'] },
  { id: 'cop-1-1-4', name: 'Caño de Cobre 1" 1/4', category: CATALOG_CATEGORIES.COPPER_PIPES, unit: 'metro', netPrice: 37461.60, keywords: ['1 1/4', '1" 1/4', 'cobre 1 1/4'] },

  // --- CAÑOS RÍGIDOS ---
  { id: 'rig-3-8', name: 'Caño Rígido 3/8"', category: CATALOG_CATEGORIES.RIGID_PIPES, unit: 'metro', netPrice: 10367.28, keywords: ['rigido 3/8', 'rígido 3/8'] },
  { id: 'rig-1-2', name: 'Caño Rígido 1/2"', category: CATALOG_CATEGORIES.RIGID_PIPES, unit: 'metro', netPrice: 14244.12, keywords: ['rigido 1/2', 'rígido 1/2'] },
  { id: 'rig-3-4', name: 'Caño Rígido 3/4"', category: CATALOG_CATEGORIES.RIGID_PIPES, unit: 'metro', netPrice: 21997.80, keywords: ['rigido 3/4', 'rígido 3/4'] },
  { id: 'rig-7-8', name: 'Caño Rígido 7/8"', category: CATALOG_CATEGORIES.RIGID_PIPES, unit: 'metro', netPrice: 25831.08, keywords: ['rigido 7/8', 'rígido 7/8'] },

  // --- AISLACIONES Y MANGUERAS ---
  { id: 'ais-1-4', name: 'Aislación Bellini 1/4"', category: CATALOG_CATEGORIES.INSULATION_HOSES, unit: 'metro', netPrice: 670.82, keywords: ['aislacion 1/4', 'aislación 1/4', 'bellini 1/4'] },
  { id: 'ais-3-8', name: 'Aislación Bellini 3/8"', category: CATALOG_CATEGORIES.INSULATION_HOSES, unit: 'metro', netPrice: 905.08, keywords: ['aislacion 3/8', 'aislación 3/8', 'bellini 3/8'] },
  { id: 'ais-1-2', name: 'Aislación Bellini 1/2"', category: CATALOG_CATEGORIES.INSULATION_HOSES, unit: 'metro', netPrice: 1098.08, keywords: ['aislacion 1/2', 'aislación 1/2', 'bellini 1/2'] },
  { id: 'ais-5-8', name: 'Aislación Bellini 5/8"', category: CATALOG_CATEGORIES.INSULATION_HOSES, unit: 'metro', netPrice: 1277.76, keywords: ['aislacion 5/8', 'aislación 5/8', 'bellini 5/8'] },
  { id: 'ais-3-4', name: 'Aislación Bellini 3/4"', category: CATALOG_CATEGORIES.INSULATION_HOSES, unit: 'metro', netPrice: 1437.48, keywords: ['aislacion 3/4', 'aislación 3/4', 'bellini 3/4'] },
  { id: 'ais-7-8', name: 'Aislación Bellini 7/8"', category: CATALOG_CATEGORIES.INSULATION_HOSES, unit: 'metro', netPrice: 1732.96, keywords: ['aislacion 7/8', 'aislación 7/8', 'bellini 7/8'] },
  { id: 'ais-1-1-8', name: 'Aislación Bellini 1" 1/8', category: CATALOG_CATEGORIES.INSULATION_HOSES, unit: 'metro', netPrice: 2627.39, keywords: ['aislacion 1 1/8', 'bellini 1 1/8'] },
  { id: 'ais-1-1-4', name: 'Aislación Bellini 1" 1/4', category: CATALOG_CATEGORIES.INSULATION_HOSES, unit: 'metro', netPrice: 3026.69, keywords: ['aislacion 1 1/4', 'bellini 1 1/4'] },

  { id: 'man-1-4', name: 'Manguera Reld 1/4"', category: CATALOG_CATEGORIES.INSULATION_HOSES, unit: 'metro', netPrice: 437.36, keywords: ['manguera 1/4', 'reld 1/4'] },
  { id: 'man-3-8', name: 'Manguera Reld 3/8"', category: CATALOG_CATEGORIES.INSULATION_HOSES, unit: 'metro', netPrice: 461.00, keywords: ['manguera 3/8', 'reld 3/8'] },
  { id: 'man-1-2', name: 'Manguera Reld 1/2"', category: CATALOG_CATEGORIES.INSULATION_HOSES, unit: 'metro', netPrice: 705.00, keywords: ['manguera 1/2', 'reld 1/2'] },
  { id: 'man-5-8', name: 'Manguera Reld 5/8"', category: CATALOG_CATEGORIES.INSULATION_HOSES, unit: 'metro', netPrice: 1038.00, keywords: ['manguera 5/8', 'reld 5/8'] },
  { id: 'man-3-4', name: 'Manguera Reld 3/4"', category: CATALOG_CATEGORIES.INSULATION_HOSES, unit: 'metro', netPrice: 1415.00, keywords: ['manguera 3/4', 'reld 3/4'] },

  // --- CABLES Y CINTAS ---
  { id: 'cab-5-15', name: 'Cable tipo Taller 5 x 1,5 mm (Reld)', category: CATALOG_CATEGORIES.CABLES_TAPES, unit: 'metro', netPrice: 3536.83, keywords: ['5x1.5', '5 x 1,5', '5x1,5', 'cable 5x1.5'] },
  { id: 'cab-5-25', name: 'Cable tipo Taller 5 x 2,5 mm (Reld)', category: CATALOG_CATEGORIES.CABLES_TAPES, unit: 'metro', netPrice: 5125.81, keywords: ['5x2.5', '5 x 2,5', '5x2,5', 'cable 5x2.5'] },
  { id: 'cab-7-15', name: 'Cable tipo Taller 7 x 1,5 mm (Reld)', category: CATALOG_CATEGORIES.CABLES_TAPES, unit: 'metro', netPrice: 4670.61, keywords: ['7x1.5', '7 x 1,5', '7x1,5', 'cable 7x1.5'] },
  { id: 'cab-7-25', name: 'Cable tipo Taller 7 x 2,5 mm (Reld)', category: CATALOG_CATEGORIES.CABLES_TAPES, unit: 'metro', netPrice: 5984.00, keywords: ['7x2.5', '7 x 2,5', '7x2,5', 'cable 7x2.5'] },

  { id: 'cin-bla-adh', name: 'Cinta de Caño Blanca c/adh. (Reld)', category: CATALOG_CATEGORIES.CABLES_TAPES, unit: 'unidad', netPrice: 1377.59, keywords: ['cinta blanca c/adh', 'cinta blanca con adhesivo'] },
  { id: 'cin-bla-sadh', name: 'Cinta de Caño Blanca s/adh. (Reld)', category: CATALOG_CATEGORIES.CABLES_TAPES, unit: 'unidad', netPrice: 729.52, keywords: ['cinta blanca s/adh', 'cinta blanca sin adhesivo'] },
  { id: 'cin-gri-adh', name: 'Cinta de Caño Gris c/adh. (Reld)', category: CATALOG_CATEGORIES.CABLES_TAPES, unit: 'unidad', netPrice: 4456.19, keywords: ['cinta gris c/adh', 'cinta gris con adhesivo'] },
  { id: 'cin-gri-sadh', name: 'Cinta de Caño Gris s/adh. (Reld)', category: CATALOG_CATEGORIES.CABLES_TAPES, unit: 'unidad', netPrice: 2497.62, keywords: ['cinta gris s/adh', 'cinta gris sin adhesivo'] },

  // --- MÉNSULAS Y SOPORTES ---
  { id: 'men-42', name: 'Ménsula 42cm', category: CATALOG_CATEGORIES.BRACKETS_FIXINGS, unit: 'unidad', netPrice: 16298.70, keywords: ['mensula 42', 'ménsula 42', '42cm', '42 cm'] },
  { id: 'men-52', name: 'Ménsula 52cm', category: CATALOG_CATEGORIES.BRACKETS_FIXINGS, unit: 'unidad', netPrice: 19018.78, keywords: ['mensula 52', 'ménsula 52', '52cm', '52 cm'] },
  { id: 'men-62', name: 'Ménsula 62cm', category: CATALOG_CATEGORIES.BRACKETS_FIXINGS, unit: 'unidad', netPrice: 23072.28, keywords: ['mensula 62', 'ménsula 62', '62cm', '62 cm'] },
  { id: 'men-82', name: 'Ménsula 82cm (80cm)', category: CATALOG_CATEGORIES.BRACKETS_FIXINGS, unit: 'unidad', netPrice: 67437.66, keywords: ['mensula 82', 'ménsula 82', 'mensula 80', '82cm', '80cm'] },
  { id: 'kit-fij', name: 'Kit Fijación (Tarugos y Bulones)', category: CATALOG_CATEGORIES.BRACKETS_FIXINGS, unit: 'unidad', netPrice: 2076.36, keywords: ['kit fijacion', 'kit fijación', 'tarugos', 'bulones', 'fijacion'] },
  { id: 'pat-men', name: 'Pata Ménsula', category: CATALOG_CATEGORIES.BRACKETS_FIXINGS, unit: 'unidad', netPrice: 6789.31, keywords: ['pata mensula', 'pata ménsula', 'patas mensula'] },
  { id: 'pat-pis', name: 'Pata Piso Estándar', category: CATALOG_CATEGORIES.BRACKETS_FIXINGS, unit: 'unidad', netPrice: 6461.40, keywords: ['pata piso', 'patas piso'] },
  { id: 'pat-pis-5tr', name: 'Pata Piso 5 TR Reforzada', category: CATALOG_CATEGORIES.BRACKETS_FIXINGS, unit: 'unidad', netPrice: 21907.05, keywords: ['pata piso 5 tr', 'pata piso 5tr', '5 tr'] },

  // --- MANO DE OBRA INSTALACIÓN / DESINSTALACIÓN ---
  { id: 'mo-ins-3000', name: 'Mano de Obra Instalación 3.000 FG', category: CATALOG_CATEGORIES.LABOR, unit: 'unidad', netPrice: 263500.00, keywords: ['instalacion 3000', 'instalación 3000', 'mo 3000'] },
  { id: 'mo-des-3000', name: 'Desinstalación 3.000 FG (50% M.O.)', category: CATALOG_CATEGORIES.LABOR, unit: 'unidad', netPrice: 131750.00, keywords: ['desinstalacion 3000', 'desinstalación 3000'] },
  { id: 'mo-ins-4500', name: 'Mano de Obra Instalación 4.500 FG', category: CATALOG_CATEGORIES.LABOR, unit: 'unidad', netPrice: 323000.00, keywords: ['instalacion 4500', 'instalación 4500', 'mo 4500'] },
  { id: 'mo-des-4500', name: 'Desinstalación 4.500 FG (50% M.O.)', category: CATALOG_CATEGORIES.LABOR, unit: 'unidad', netPrice: 161500.00, keywords: ['desinstalacion 4500', 'desinstalación 4500'] },
  { id: 'mo-ins-5500', name: 'Mano de Obra Instalación 5.500 FG', category: CATALOG_CATEGORIES.LABOR, unit: 'unidad', netPrice: 433500.00, keywords: ['instalacion 5500', 'instalación 5500', 'mo 5500'] },
  { id: 'mo-des-5500', name: 'Desinstalación 5.500 FG (50% M.O.)', category: CATALOG_CATEGORIES.LABOR, unit: 'unidad', netPrice: 216750.00, keywords: ['desinstalacion 5500', 'desinstalación 5500'] },
  { id: 'mo-ins-6000', name: 'Mano de Obra Instalación 6.000 FG', category: CATALOG_CATEGORIES.LABOR, unit: 'unidad', netPrice: 399500.00, keywords: ['instalacion 6000', 'instalación 6000', 'mo 6000'] },
  { id: 'mo-des-6000', name: 'Desinstalación 6.000 FG (50% M.O.)', category: CATALOG_CATEGORIES.LABOR, unit: 'unidad', netPrice: 199750.00, keywords: ['desinstalacion 6000', 'desinstalación 6000'] },
  { id: 'mo-ins-8000', name: 'Mano de Obra Instalación 8.000 FG', category: CATALOG_CATEGORIES.LABOR, unit: 'unidad', netPrice: 731000.00, keywords: ['instalacion 8000', 'instalación 8000', 'mo 8000'] },
  { id: 'mo-des-8000', name: 'Desinstalación 8.000 FG (50% M.O.)', category: CATALOG_CATEGORIES.LABOR, unit: 'unidad', netPrice: 365500.00, keywords: ['desinstalacion 8000', 'desinstalación 8000'] },
  { id: 'mo-ins-12000', name: 'Mano de Obra Instalación 12.000 a 18.000 FG', category: CATALOG_CATEGORIES.LABOR, unit: 'unidad', netPrice: 1360000.00, keywords: ['instalacion 12000', 'instalacion 18000', 'instalación 12000', 'instalación 18000'] },
  { id: 'mo-des-12000', name: 'Desinstalación 12.000 a 18.000 FG (50% M.O.)', category: CATALOG_CATEGORIES.LABOR, unit: 'unidad', netPrice: 680000.00, keywords: ['desinstalacion 12000', 'desinstalacion 18000', 'desinstalación 12000', 'desinstalación 18000'] },
];

/**
 * Busca el precio neto sugerido en base a la descripción del ítem ingresado.
 * @param {string} description - Texto ingresado por el técnico o admin
 * @returns {number|null} Precio sugerido neto o null si no hay coincidencia
 */
export function findSuggestedPrice(description) {
  if (!description || typeof description !== 'string') return null;
  const clean = description.toLowerCase().trim();

  // 1. Coincidencia exacta de nombre
  const exact = OFFICIAL_MATERIALS_CATALOG.find(
    (m) => m.name.toLowerCase() === clean
  );
  if (exact) return exact.netPrice;

  // 2. Coincidencia por palabras clave
  for (const item of OFFICIAL_MATERIALS_CATALOG) {
    if (item.keywords && item.keywords.some((k) => clean.includes(k.toLowerCase()))) {
      return item.netPrice;
    }
  }

  // 3. Coincidencia difusa de subcadena
  for (const item of OFFICIAL_MATERIALS_CATALOG) {
    if (clean.includes(item.name.toLowerCase()) || item.name.toLowerCase().includes(clean)) {
      return item.netPrice;
    }
  }

  return null;
}

/**
 * Calcula el presupuesto completo de un combo según capacidad y cantidades ingresadas.
 * @param {string} capacityKey - '3000' | '4500' | '5500' | '6000' | '8000' | '12000_18000'
 * @param {object} quantities - { pipeMeters, brackets, bracketLegs, floorLegs, fixingKits, uninstallation, installationLabor }
 * @returns {object} { lines, subtotalNeto, ivaAmount, totalConIva }
 */
export function calculateComboBudget(capacityKey, quantities = {}) {
  const combo = INSTALLATION_COMBOS_BY_CAPACITY[capacityKey] || INSTALLATION_COMBOS_BY_CAPACITY['3000'];
  const items = combo.items;

  const lines = [
    {
      key: 'pipeMeter',
      label: items.pipeMeter.label,
      unit: items.pipeMeter.unit,
      unitPrice: items.pipeMeter.price,
      quantity: Number(quantities.pipeMeters || 0),
    },
    {
      key: 'bracket',
      label: items.bracket.label,
      unit: items.bracket.unit,
      unitPrice: items.bracket.price,
      quantity: Number(quantities.brackets || 0),
    },
    {
      key: 'bracketLegs',
      label: items.bracketLegs.label,
      unit: items.bracketLegs.unit,
      unitPrice: items.bracketLegs.price,
      quantity: Number(quantities.bracketLegs || 0),
    },
    {
      key: 'floorLegs',
      label: items.floorLegs.label,
      unit: items.floorLegs.unit,
      unitPrice: items.floorLegs.price,
      quantity: Number(quantities.floorLegs || 0),
    },
    {
      key: 'fixingKit',
      label: items.fixingKit.label,
      unit: items.fixingKit.unit,
      unitPrice: items.fixingKit.price,
      quantity: Number(quantities.fixingKits || 0),
    },
    {
      key: 'installationLabor',
      label: items.installationLabor.label,
      unit: items.installationLabor.unit,
      unitPrice: items.installationLabor.price,
      quantity: Number(quantities.installationLabor || 0),
    },
    {
      key: 'uninstallationLabor',
      label: items.uninstallationLabor.label,
      unit: items.uninstallationLabor.unit,
      unitPrice: items.uninstallationLabor.price,
      quantity: Number(quantities.uninstallation || 0),
    },
  ].map((l) => {
    const totalNeto = Number((l.quantity * l.unitPrice).toFixed(2));
    const totalIva = Number((totalNeto * 1.21).toFixed(2));
    return {
      ...l,
      totalNeto,
      totalIva,
    };
  });

  const subtotalNeto = Number(lines.reduce((sum, l) => sum + l.totalNeto, 0).toFixed(2));
  const ivaAmount = Number((subtotalNeto * 0.21).toFixed(2));
  const totalConIva = Number((subtotalNeto + ivaAmount).toFixed(2));

  return {
    combo,
    lines,
    subtotalNeto,
    ivaAmount,
    totalConIva,
  };
}
