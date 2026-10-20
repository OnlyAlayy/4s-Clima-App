/**
 * Catálogo Oficial y Motor Dinámico de Costos e Inflación ("Hoja1 del Excel").
 * Fuente: Planilla oficial "MATERIALES INSTALACIÓN CAÑERIA - SEP 26 - REV 0 - WS.xlsx"
 * 
 * Este motor paramétrico reproduce la matemática viva de la Hoja1 de Walter:
 * 1. Precio y descuento del Cobre por Kg -> costo automático del caño según peso de rollo (15m).
 * 2. Precios de lista de proveedores (Bellini y Reld) con sus respectivos factores y tiras.
 * 3. Margen comercial de cañería (GM 1.40) + Desperdicio (5%).
 * 4. Margen comercial de mano de obra (GM 1.70) sobre costo base instalador.
 * 5. Ajuste masivo por inflación en cascada.
 */

import { roundCurrency } from '../utils/index.js';

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
 * Parámetros maestros oficiales por defecto (Hoja 1 - SEP 26)
 */
export const DEFAULT_PRICING_PARAMETERS = {
  // --- VARIABLES MAESTRAS DE COBRE ---
  copperPricePerKg: 40000.00, // $ 40.000 / kg base
  copperDiscount: 0.10,       // 10% de descuento proveedor -> $ 36.000 / kg neto
  vatFactor: 1.21,            // Factor IVA 21%

  // --- MULTIPLICADORES Y MÁRGENES (GM) ---
  wasteFactor: 0.05,          // 5% de desperdicio por metro (R16)
  pipeMarginGM: 1.40,         // Multiplicador / GM Cañería Armada (T16)
  laborMarginGM: 1.70,        // Multiplicador / GM Mano de Obra (Z16)

  // --- PESOS POR ROLLO DE 15M (en kg) PARA CAÑOS DE COBRE ---
  copperWeights: {
    '1/4': 1.93,
    '3/8': 3.00,
    '1/2': 4.20,
    '5/8': 5.40,
    '3/4': 6.40,
    '7/8': 8.00,
    '1 1/8': 11.567,
    '1 1/4': 12.902,
  },

  // --- CAÑOS RÍGIDOS (Precio de lista por metro) ---
  rigidPipes: {
    '3/8': 10367.28,
    '1/2': 14244.12,
    '3/4': 21997.80,
    '7/8': 25831.08,
  },

  // --- AISLACIONES BELLINI (Precio por metro) ---
  insulationBellini: {
    '1/4': 670.82,
    '3/8': 905.08,
    '1/2': 1098.08,
    '5/8': 1277.76,
    '3/4': 1437.48,
    '7/8': 1732.96,
    '1 1/8': 2627.39,
    '1 1/4': 3026.69,
  },

  // --- MANGUERAS RELD (Precio por metro) ---
  hosesReld: {
    '1/4': 437.36,
    '3/8': 461.00,
    '1/2': 705.00,
    '5/8': 1038.00,
    '3/4': 1415.00,
  },

  // --- CABLES TIPO TALLER RELD (Precio por metro) ---
  cablesReld: {
    '5x1.5': 3536.83,
    '5x2.5': 5125.81,
    '7x1.5': 4670.61,
    '7x2.5': 5984.00,
  },

  // --- CINTAS RELD (Precio por rollo) ---
  tapesReld: {
    whiteWithAdhesive: 1377.59,
    whiteWithoutAdhesive: 729.52,
    grayWithAdhesive: 4456.19,
    grayWithoutAdhesive: 2497.62,
  },

  // --- MÉNSULAS Y FIJACIONES (Bellini y Reld) ---
  bracketsAndFixings: {
    bracket42: 16298.70,
    bracket52: 19018.78,
    bracket62: 23072.28,
    bracket82: 67437.66,
    bracketLeg: 6789.31,
    floorLeg: 6461.40,
    floorLeg5TR: 21907.05,
    fixingKit: 2076.36,
  },

  // --- COSTO BASE INSTALADOR / MANO DE OBRA (Costo antes del GM 1.70) ---
  baseLabor: {
    '3000': 155000.00,
    '4500': 190000.00,
    '5500': 255000.00,
    '6000': 235000.00,
    '8000': 430000.00,
    '12000_18000': 800000.00,
  },
};

/**
 * Calcula el costo exacto por metro de caño de cobre según kg del rollo de 15m.
 * Fórmula Hoja1: (Neto Kg Cobre * Kg por Rollo * 1.21) / 15
 */
export function calculateCopperPipePrice(params, sizeKey) {
  const p = params || DEFAULT_PRICING_PARAMETERS;
  const kg = p.copperWeights[sizeKey];
  if (!kg) return 0;
  const netCopperKg = p.copperPricePerKg * (1 - p.copperDiscount);
  const price = (netCopperKg * kg * p.vatFactor) / 15;
  return roundCurrency(price);
}

/**
 * Calcula el costo del Metro de Caño Armado por Capacidad (Hoja1!Q17:X22).
 * Fórmula Hoja1: (Caño Líq + Caño Gas + Aisl Líq + Aisl Gas + Manguera + Cable + Cinta c/adh/10 + Cinta s/adh/5) * (1 + wasteFactor) * pipeMarginGM
 */
export function calculateArmoredPipePrice(params, capacityKey) {
  const p = params || DEFAULT_PRICING_PARAMETERS;
  const tapeCost = (p.tapesReld.whiteWithAdhesive / 10) + (p.tapesReld.whiteWithoutAdhesive / 5);
  let liquidPipe = 0;
  let gasPipe = 0;
  let liquidIns = 0;
  let gasIns = 0;
  let hose = 0;
  let cable = 0;

  switch (capacityKey) {
    case '3000':
      liquidPipe = calculateCopperPipePrice(p, '1/4');
      gasPipe = calculateCopperPipePrice(p, '1/2');
      liquidIns = p.insulationBellini['1/4'] || 0;
      gasIns = p.insulationBellini['1/2'] || 0;
      hose = p.hosesReld['3/4'] || 0;
      cable = p.cablesReld['7x1.5'] || 0;
      break;
    case '4500':
      liquidPipe = calculateCopperPipePrice(p, '3/8');
      gasPipe = calculateCopperPipePrice(p, '1/2');
      liquidIns = p.insulationBellini['3/8'] || 0;
      gasIns = p.insulationBellini['1/2'] || 0;
      hose = p.hosesReld['3/4'] || 0;
      cable = p.cablesReld['7x1.5'] || 0;
      break;
    case '5500':
      liquidPipe = calculateCopperPipePrice(p, '1/4');
      gasPipe = calculateCopperPipePrice(p, '3/4');
      liquidIns = p.insulationBellini['1/4'] || 0;
      gasIns = p.insulationBellini['3/4'] || 0;
      hose = p.hosesReld['3/4'] || 0;
      cable = p.cablesReld['7x2.5'] || 0;
      break;
    case '6000':
      liquidPipe = calculateCopperPipePrice(p, '1/4');
      gasPipe = calculateCopperPipePrice(p, '5/8');
      liquidIns = p.insulationBellini['1/4'] || 0;
      gasIns = p.insulationBellini['5/8'] || 0;
      hose = p.hosesReld['5/8'] || 0;
      cable = p.cablesReld['7x2.5'] || 0;
      break;
    case '8000':
      liquidPipe = calculateCopperPipePrice(p, '3/8');
      gasPipe = calculateCopperPipePrice(p, '5/8');
      liquidIns = p.insulationBellini['3/8'] || 0;
      gasIns = p.insulationBellini['5/8'] || 0;
      hose = p.hosesReld['5/8'] || 0;
      cable = p.cablesReld['7x2.5'] || 0;
      break;
    case '12000_18000':
      liquidPipe = calculateCopperPipePrice(p, '3/8');
      gasPipe = calculateCopperPipePrice(p, '3/4');
      liquidIns = p.insulationBellini['3/8'] || 0;
      gasIns = p.insulationBellini['3/4'] || 0;
      hose = p.hosesReld['5/8'] || 0;
      cable = p.cablesReld['7x2.5'] || 0;
      break;
    default:
      return 0;
  }

  const baseCombo = liquidPipe + gasPipe + liquidIns + gasIns + hose + cable + tapeCost;
  const finalPrice = baseCombo * (1 + p.wasteFactor) * p.pipeMarginGM;
  return roundCurrency(finalPrice);
}

/**
 * Calcula la Mano de Obra de Instalación por Frigorías (Costo Base * GM Mano de Obra).
 */
export function calculateLaborPrice(params, capacityKey) {
  const p = params || DEFAULT_PRICING_PARAMETERS;
  const base = p.baseLabor[capacityKey] || 0;
  return roundCurrency(base * p.laborMarginGM);
}

/**
 * Calcula la Desinstalación (Siempre 50% de la Mano de Obra).
 */
export function calculateUninstallationPrice(params, capacityKey) {
  const labor = calculateLaborPrice(params, capacityKey);
  return roundCurrency(labor * 0.50);
}

/**
 * Construye dinámicamente la matriz de Combos de Instalación por Capacidad.
 */
export function buildCombosByCapacity(params = DEFAULT_PRICING_PARAMETERS) {
  const p = params || DEFAULT_PRICING_PARAMETERS;
  return {
    '3000': {
      capacityKey: '3000',
      label: '3.000 frig/h',
      pipeSpecs: '1/2" - 1/4"',
      items: {
        pipeMeter: { label: 'Metros de Caño (1/2 - 1/4)', unit: 'metro', price: calculateArmoredPipePrice(p, '3000') },
        bracket: { label: 'Ménsula 42cm', unit: 'unidad', price: p.bracketsAndFixings.bracket42 },
        bracketLegs: { label: 'Patas Ménsula', unit: 'unidad', price: p.bracketsAndFixings.bracketLeg },
        floorLegs: { label: 'Patas Piso', unit: 'unidad', price: p.bracketsAndFixings.floorLeg },
        fixingKit: { label: 'Kit Fijación', unit: 'unidad', price: p.bracketsAndFixings.fixingKit },
        installationLabor: { label: 'Mano de Obra Instalación 3.000 FG', unit: 'unidad', price: calculateLaborPrice(p, '3000') },
        uninstallationLabor: { label: 'Desinstalación 3.000 FG (50% M.O.)', unit: 'unidad', price: calculateUninstallationPrice(p, '3000') },
      },
    },
    '4500': {
      capacityKey: '4500',
      label: '4.500 frig/h',
      pipeSpecs: '1/2" - 1/4"',
      items: {
        pipeMeter: { label: 'Metros de Caño (1/2 - 1/4)', unit: 'metro', price: calculateArmoredPipePrice(p, '4500') },
        bracket: { label: 'Ménsula 52cm', unit: 'unidad', price: p.bracketsAndFixings.bracket52 },
        bracketLegs: { label: 'Patas Ménsula', unit: 'unidad', price: p.bracketsAndFixings.bracketLeg },
        floorLegs: { label: 'Patas Piso', unit: 'unidad', price: p.bracketsAndFixings.floorLeg },
        fixingKit: { label: 'Kit Fijación', unit: 'unidad', price: p.bracketsAndFixings.fixingKit },
        installationLabor: { label: 'Mano de Obra Instalación 4.500 FG', unit: 'unidad', price: calculateLaborPrice(p, '4500') },
        uninstallationLabor: { label: 'Desinstalación 4.500 FG (50% M.O.)', unit: 'unidad', price: calculateUninstallationPrice(p, '4500') },
      },
    },
    '5500': {
      capacityKey: '5500',
      label: '5.500 frig/h',
      pipeSpecs: '5/8" - 1/4"',
      items: {
        pipeMeter: { label: 'Metros de Caño (5/8 - 1/4)', unit: 'metro', price: calculateArmoredPipePrice(p, '5500') },
        bracket: { label: 'Ménsula 62cm', unit: 'unidad', price: p.bracketsAndFixings.bracket62 },
        bracketLegs: { label: 'Patas Ménsula', unit: 'unidad', price: p.bracketsAndFixings.bracketLeg },
        floorLegs: { label: 'Patas Piso', unit: 'unidad', price: p.bracketsAndFixings.floorLeg },
        fixingKit: { label: 'Kit Fijación', unit: 'unidad', price: p.bracketsAndFixings.fixingKit },
        installationLabor: { label: 'Mano de Obra Instalación 5.500 FG', unit: 'unidad', price: calculateLaborPrice(p, '5500') },
        uninstallationLabor: { label: 'Desinstalación 5.500 FG (50% M.O.)', unit: 'unidad', price: calculateUninstallationPrice(p, '5500') },
      },
    },
    '6000': {
      capacityKey: '6000',
      label: '6.000 frig/h',
      pipeSpecs: '5/8" - 1/4"',
      items: {
        pipeMeter: { label: 'Metros de Caño (5/8 - 1/4)', unit: 'metro', price: calculateArmoredPipePrice(p, '6000') },
        bracket: { label: 'Ménsula 82cm', unit: 'unidad', price: p.bracketsAndFixings.bracket82 },
        bracketLegs: { label: 'Patas Ménsula', unit: 'unidad', price: p.bracketsAndFixings.bracketLeg },
        floorLegs: { label: 'Patas Piso', unit: 'unidad', price: p.bracketsAndFixings.floorLeg },
        fixingKit: { label: 'Kit Fijación', unit: 'unidad', price: p.bracketsAndFixings.fixingKit },
        installationLabor: { label: 'Mano de Obra Instalación 6.000 FG', unit: 'unidad', price: calculateLaborPrice(p, '6000') },
        uninstallationLabor: { label: 'Desinstalación 6.000 FG (50% M.O.)', unit: 'unidad', price: calculateUninstallationPrice(p, '6000') },
      },
    },
    '8000': {
      capacityKey: '8000',
      label: '8.000 frig/h',
      pipeSpecs: '5/8" - 1/8"',
      items: {
        pipeMeter: { label: 'Metros de Caño (5/8 - 1/8)', unit: 'metro', price: calculateArmoredPipePrice(p, '8000') },
        bracket: { label: 'Ménsula 82cm', unit: 'unidad', price: p.bracketsAndFixings.bracket82 },
        bracketLegs: { label: 'Patas Ménsula', unit: 'unidad', price: p.bracketsAndFixings.bracketLeg },
        floorLegs: { label: 'Patas Piso', unit: 'unidad', price: p.bracketsAndFixings.floorLeg },
        fixingKit: { label: 'Kit Fijación', unit: 'unidad', price: p.bracketsAndFixings.fixingKit },
        installationLabor: { label: 'Mano de Obra Instalación 8.000 FG', unit: 'unidad', price: calculateLaborPrice(p, '8000') },
        uninstallationLabor: { label: 'Desinstalación 8.000 FG (50% M.O.)', unit: 'unidad', price: calculateUninstallationPrice(p, '8000') },
      },
    },
    '12000_18000': {
      capacityKey: '12000_18000',
      label: '12.000 a 18.000 frig/h',
      pipeSpecs: '3/8" - 3/4"',
      items: {
        pipeMeter: { label: 'Metros de Caño (3/8 - 3/4)', unit: 'metro', price: calculateArmoredPipePrice(p, '12000_18000') },
        bracket: { label: 'Ménsula 82cm', unit: 'unidad', price: p.bracketsAndFixings.bracket82 },
        bracketLegs: { label: 'Patas Ménsula', unit: 'unidad', price: p.bracketsAndFixings.bracketLeg },
        floorLegs: { label: 'Patas Piso 5 TR', unit: 'unidad', price: p.bracketsAndFixings.floorLeg5TR },
        fixingKit: { label: 'Kit Fijación', unit: 'unidad', price: p.bracketsAndFixings.fixingKit },
        installationLabor: { label: 'Mano de Obra Instalación 12.000-18.000 FG', unit: 'unidad', price: calculateLaborPrice(p, '12000_18000') },
        uninstallationLabor: { label: 'Desinstalación 12.000-18.000 FG (50% M.O.)', unit: 'unidad', price: calculateUninstallationPrice(p, '12000_18000') },
      },
    },
  };
}

/**
 * Matriz estática por defecto (para compatibilidad hacia atrás).
 */
export const INSTALLATION_COMBOS_BY_CAPACITY = buildCombosByCapacity(DEFAULT_PRICING_PARAMETERS);

/**
 * Construye dinámicamente el catálogo completo de insumos y mano de obra.
 */
export function buildMaterialsCatalog(params = DEFAULT_PRICING_PARAMETERS) {
  const p = params || DEFAULT_PRICING_PARAMETERS;
  return [
    // --- COMBOS POR FRIGORÍAS ---
    {
      id: 'mat-combo-3000',
      name: 'Cañería Instalación Completa 3.000 FG (1/2" - 1/4")',
      category: CATALOG_CATEGORIES.COMBOS,
      unit: 'metro',
      netPrice: calculateArmoredPipePrice(p, '3000'),
      keywords: ['3000', '3.000', 'cañeria 3000', 'caño 3000', '1/2 1/4'],
    },
    {
      id: 'mat-combo-4500',
      name: 'Cañería Instalación Completa 4.500 FG (1/2" - 1/4")',
      category: CATALOG_CATEGORIES.COMBOS,
      unit: 'metro',
      netPrice: calculateArmoredPipePrice(p, '4500'),
      keywords: ['4500', '4.500', 'cañeria 4500', 'caño 4500'],
    },
    {
      id: 'mat-combo-5500',
      name: 'Cañería Instalación Completa 5.500 FG (5/8" - 1/4")',
      category: CATALOG_CATEGORIES.COMBOS,
      unit: 'metro',
      netPrice: calculateArmoredPipePrice(p, '5500'),
      keywords: ['5500', '5.500', 'cañeria 5500', 'caño 5500', '5/8 1/4'],
    },
    {
      id: 'mat-combo-6000',
      name: 'Cañería Instalación Completa 6.000 FG (5/8" - 1/4")',
      category: CATALOG_CATEGORIES.COMBOS,
      unit: 'metro',
      netPrice: calculateArmoredPipePrice(p, '6000'),
      keywords: ['6000', '6.000', 'cañeria 6000', 'caño 6000'],
    },
    {
      id: 'mat-combo-8000',
      name: 'Cañería Instalación Completa 8.000 FG (5/8" - 1/8")',
      category: CATALOG_CATEGORIES.COMBOS,
      unit: 'metro',
      netPrice: calculateArmoredPipePrice(p, '8000'),
      keywords: ['8000', '8.000', 'cañeria 8000', 'caño 8000'],
    },
    {
      id: 'mat-combo-12000',
      name: 'Cañería Instalación Completa 12.000 a 18.000 FG (3/8" - 3/4")',
      category: CATALOG_CATEGORIES.COMBOS,
      unit: 'metro',
      netPrice: calculateArmoredPipePrice(p, '12000_18000'),
      keywords: ['12000', '18000', '12.000', '18.000', 'cañeria 12000', 'cañeria 18000', '3/8 3/4'],
    },

    // --- CAÑOS DE COBRE ---
    { id: 'cop-1-4', name: 'Caño de Cobre 1/4"', category: CATALOG_CATEGORIES.COPPER_PIPES, unit: 'metro', netPrice: calculateCopperPipePrice(p, '1/4'), keywords: ['1/4', 'cobre 1/4'] },
    { id: 'cop-3-8', name: 'Caño de Cobre 3/8"', category: CATALOG_CATEGORIES.COPPER_PIPES, unit: 'metro', netPrice: calculateCopperPipePrice(p, '3/8'), keywords: ['3/8', 'cobre 3/8'] },
    { id: 'cop-1-2', name: 'Caño de Cobre 1/2"', category: CATALOG_CATEGORIES.COPPER_PIPES, unit: 'metro', netPrice: calculateCopperPipePrice(p, '1/2'), keywords: ['1/2', 'cobre 1/2'] },
    { id: 'cop-5-8', name: 'Caño de Cobre 5/8"', category: CATALOG_CATEGORIES.COPPER_PIPES, unit: 'metro', netPrice: calculateCopperPipePrice(p, '5/8'), keywords: ['5/8', 'cobre 5/8'] },
    { id: 'cop-3-4', name: 'Caño de Cobre 3/4"', category: CATALOG_CATEGORIES.COPPER_PIPES, unit: 'metro', netPrice: calculateCopperPipePrice(p, '3/4'), keywords: ['3/4', 'cobre 3/4'] },
    { id: 'cop-7-8', name: 'Caño de Cobre 7/8"', category: CATALOG_CATEGORIES.COPPER_PIPES, unit: 'metro', netPrice: calculateCopperPipePrice(p, '7/8'), keywords: ['7/8', 'cobre 7/8'] },
    { id: 'cop-1-1-8', name: 'Caño de Cobre 1" 1/8', category: CATALOG_CATEGORIES.COPPER_PIPES, unit: 'metro', netPrice: calculateCopperPipePrice(p, '1 1/8'), keywords: ['1 1/8', '1" 1/8', 'cobre 1 1/8'] },
    { id: 'cop-1-1-4', name: 'Caño de Cobre 1" 1/4', category: CATALOG_CATEGORIES.COPPER_PIPES, unit: 'metro', netPrice: calculateCopperPipePrice(p, '1 1/4'), keywords: ['1 1/4', '1" 1/4', 'cobre 1 1/4'] },

    // --- CAÑOS RÍGIDOS ---
    { id: 'rig-3-8', name: 'Caño Rígido 3/8"', category: CATALOG_CATEGORIES.RIGID_PIPES, unit: 'metro', netPrice: p.rigidPipes['3/8'] || 0, keywords: ['rigido 3/8', 'rígido 3/8'] },
    { id: 'rig-1-2', name: 'Caño Rígido 1/2"', category: CATALOG_CATEGORIES.RIGID_PIPES, unit: 'metro', netPrice: p.rigidPipes['1/2'] || 0, keywords: ['rigido 1/2', 'rígido 1/2'] },
    { id: 'rig-3-4', name: 'Caño Rígido 3/4"', category: CATALOG_CATEGORIES.RIGID_PIPES, unit: 'metro', netPrice: p.rigidPipes['3/4'] || 0, keywords: ['rigido 3/4', 'rígido 3/4'] },
    { id: 'rig-7-8', name: 'Caño Rígido 7/8"', category: CATALOG_CATEGORIES.RIGID_PIPES, unit: 'metro', netPrice: p.rigidPipes['7/8'] || 0, keywords: ['rigido 7/8', 'rígido 7/8'] },

    // --- AISLACIONES Y MANGUERAS ---
    { id: 'ais-1-4', name: 'Aislación Bellini 1/4"', category: CATALOG_CATEGORIES.INSULATION_HOSES, unit: 'metro', netPrice: p.insulationBellini['1/4'] || 0, keywords: ['aislacion 1/4', 'aislación 1/4', 'bellini 1/4'] },
    { id: 'ais-3-8', name: 'Aislación Bellini 3/8"', category: CATALOG_CATEGORIES.INSULATION_HOSES, unit: 'metro', netPrice: p.insulationBellini['3/8'] || 0, keywords: ['aislacion 3/8', 'aislación 3/8', 'bellini 3/8'] },
    { id: 'ais-1-2', name: 'Aislación Bellini 1/2"', category: CATALOG_CATEGORIES.INSULATION_HOSES, unit: 'metro', netPrice: p.insulationBellini['1/2'] || 0, keywords: ['aislacion 1/2', 'aislación 1/2', 'bellini 1/2'] },
    { id: 'ais-5-8', name: 'Aislación Bellini 5/8"', category: CATALOG_CATEGORIES.INSULATION_HOSES, unit: 'metro', netPrice: p.insulationBellini['5/8'] || 0, keywords: ['aislacion 5/8', 'aislación 5/8', 'bellini 5/8'] },
    { id: 'ais-3-4', name: 'Aislación Bellini 3/4"', category: CATALOG_CATEGORIES.INSULATION_HOSES, unit: 'metro', netPrice: p.insulationBellini['3/4'] || 0, keywords: ['aislacion 3/4', 'aislación 3/4', 'bellini 3/4'] },
    { id: 'ais-7-8', name: 'Aislación Bellini 7/8"', category: CATALOG_CATEGORIES.INSULATION_HOSES, unit: 'metro', netPrice: p.insulationBellini['7/8'] || 0, keywords: ['aislacion 7/8', 'aislación 7/8', 'bellini 7/8'] },
    { id: 'ais-1-1-8', name: 'Aislación Bellini 1" 1/8', category: CATALOG_CATEGORIES.INSULATION_HOSES, unit: 'metro', netPrice: p.insulationBellini['1 1/8'] || 0, keywords: ['aislacion 1 1/8', 'bellini 1 1/8'] },
    { id: 'ais-1-1-4', name: 'Aislación Bellini 1" 1/4', category: CATALOG_CATEGORIES.INSULATION_HOSES, unit: 'metro', netPrice: p.insulationBellini['1 1/4'] || 0, keywords: ['aislacion 1 1/4', 'bellini 1 1/4'] },

    { id: 'man-1-4', name: 'Manguera Reld 1/4"', category: CATALOG_CATEGORIES.INSULATION_HOSES, unit: 'metro', netPrice: p.hosesReld['1/4'] || 0, keywords: ['manguera 1/4', 'reld 1/4'] },
    { id: 'man-3-8', name: 'Manguera Reld 3/8"', category: CATALOG_CATEGORIES.INSULATION_HOSES, unit: 'metro', netPrice: p.hosesReld['3/8'] || 0, keywords: ['manguera 3/8', 'reld 3/8'] },
    { id: 'man-1-2', name: 'Manguera Reld 1/2"', category: CATALOG_CATEGORIES.INSULATION_HOSES, unit: 'metro', netPrice: p.hosesReld['1/2'] || 0, keywords: ['manguera 1/2', 'reld 1/2'] },
    { id: 'man-5-8', name: 'Manguera Reld 5/8"', category: CATALOG_CATEGORIES.INSULATION_HOSES, unit: 'metro', netPrice: p.hosesReld['5/8'] || 0, keywords: ['manguera 5/8', 'reld 5/8'] },
    { id: 'man-3-4', name: 'Manguera Reld 3/4"', category: CATALOG_CATEGORIES.INSULATION_HOSES, unit: 'metro', netPrice: p.hosesReld['3/4'] || 0, keywords: ['manguera 3/4', 'reld 3/4'] },

    // --- CABLES Y CINTAS ---
    { id: 'cab-5-15', name: 'Cable tipo Taller 5 x 1,5 mm (Reld)', category: CATALOG_CATEGORIES.CABLES_TAPES, unit: 'metro', netPrice: p.cablesReld['5x1.5'] || 0, keywords: ['5x1.5', '5 x 1,5', '5x1,5', 'cable 5x1.5'] },
    { id: 'cab-5-25', name: 'Cable tipo Taller 5 x 2,5 mm (Reld)', category: CATALOG_CATEGORIES.CABLES_TAPES, unit: 'metro', netPrice: p.cablesReld['5x2.5'] || 0, keywords: ['5x2.5', '5 x 2,5', '5x2,5', 'cable 5x2.5'] },
    { id: 'cab-7-15', name: 'Cable tipo Taller 7 x 1,5 mm (Reld)', category: CATALOG_CATEGORIES.CABLES_TAPES, unit: 'metro', netPrice: p.cablesReld['7x1.5'] || 0, keywords: ['7x1.5', '7 x 1,5', '7x1,5', 'cable 7x1.5'] },
    { id: 'cab-7-25', name: 'Cable tipo Taller 7 x 2,5 mm (Reld)', category: CATALOG_CATEGORIES.CABLES_TAPES, unit: 'metro', netPrice: p.cablesReld['7x2.5'] || 0, keywords: ['7x2.5', '7 x 2,5', '7x2,5', 'cable 7x2.5'] },

    { id: 'cin-bla-adh', name: 'Cinta de Caño Blanca c/adh. (Reld)', category: CATALOG_CATEGORIES.CABLES_TAPES, unit: 'unidad', netPrice: p.tapesReld.whiteWithAdhesive || 0, keywords: ['cinta blanca c/adh', 'cinta blanca con adhesivo'] },
    { id: 'cin-bla-sadh', name: 'Cinta de Caño Blanca s/adh. (Reld)', category: CATALOG_CATEGORIES.CABLES_TAPES, unit: 'unidad', netPrice: p.tapesReld.whiteWithoutAdhesive || 0, keywords: ['cinta blanca s/adh', 'cinta blanca sin adhesivo'] },
    { id: 'cin-gri-adh', name: 'Cinta de Caño Gris c/adh. (Reld)', category: CATALOG_CATEGORIES.CABLES_TAPES, unit: 'unidad', netPrice: p.tapesReld.grayWithAdhesive || 0, keywords: ['cinta gris c/adh', 'cinta gris con adhesivo'] },
    { id: 'cin-gri-sadh', name: 'Cinta de Caño Gris s/adh. (Reld)', category: CATALOG_CATEGORIES.CABLES_TAPES, unit: 'unidad', netPrice: p.tapesReld.grayWithoutAdhesive || 0, keywords: ['cinta gris s/adh', 'cinta gris sin adhesivo'] },

    // --- MÉNSULAS Y SOPORTES ---
    { id: 'men-42', name: 'Ménsula 42cm', category: CATALOG_CATEGORIES.BRACKETS_FIXINGS, unit: 'unidad', netPrice: p.bracketsAndFixings.bracket42 || 0, keywords: ['mensula 42', 'ménsula 42', '42cm', '42 cm'] },
    { id: 'men-52', name: 'Ménsula 52cm', category: CATALOG_CATEGORIES.BRACKETS_FIXINGS, unit: 'unidad', netPrice: p.bracketsAndFixings.bracket52 || 0, keywords: ['mensula 52', 'ménsula 52', '52cm', '52 cm'] },
    { id: 'men-62', name: 'Ménsula 62cm', category: CATALOG_CATEGORIES.BRACKETS_FIXINGS, unit: 'unidad', netPrice: p.bracketsAndFixings.bracket62 || 0, keywords: ['mensula 62', 'ménsula 62', '62cm', '62 cm'] },
    { id: 'men-82', name: 'Ménsula 82cm (80cm)', category: CATALOG_CATEGORIES.BRACKETS_FIXINGS, unit: 'unidad', netPrice: p.bracketsAndFixings.bracket82 || 0, keywords: ['mensula 82', 'ménsula 82', 'mensula 80', '82cm', '80cm'] },
    { id: 'kit-fij', name: 'Kit Fijación (Tarugos y Bulones)', category: CATALOG_CATEGORIES.BRACKETS_FIXINGS, unit: 'unidad', netPrice: p.bracketsAndFixings.fixingKit || 0, keywords: ['kit fijacion', 'kit fijación', 'tarugos', 'bulones', 'fijacion'] },
    { id: 'pat-men', name: 'Pata Ménsula', category: CATALOG_CATEGORIES.BRACKETS_FIXINGS, unit: 'unidad', netPrice: p.bracketsAndFixings.bracketLeg || 0, keywords: ['pata mensula', 'pata ménsula', 'patas mensula'] },
    { id: 'pat-pis', name: 'Pata Piso Estándar', category: CATALOG_CATEGORIES.BRACKETS_FIXINGS, unit: 'unidad', netPrice: p.bracketsAndFixings.floorLeg || 0, keywords: ['pata piso', 'patas piso'] },
    { id: 'pat-pis-5tr', name: 'Pata Piso 5 TR Reforzada', category: CATALOG_CATEGORIES.BRACKETS_FIXINGS, unit: 'unidad', netPrice: p.bracketsAndFixings.floorLeg5TR || 0, keywords: ['pata piso 5 tr', 'pata piso 5tr', '5 tr'] },

    // --- MANO DE OBRA INSTALACIÓN / DESINSTALACIÓN ---
    { id: 'mo-ins-3000', name: 'Mano de Obra Instalación 3.000 FG', category: CATALOG_CATEGORIES.LABOR, unit: 'unidad', netPrice: calculateLaborPrice(p, '3000'), keywords: ['instalacion 3000', 'instalación 3000', 'mo 3000'] },
    { id: 'mo-des-3000', name: 'Desinstalación 3.000 FG (50% M.O.)', category: CATALOG_CATEGORIES.LABOR, unit: 'unidad', netPrice: calculateUninstallationPrice(p, '3000'), keywords: ['desinstalacion 3000', 'desinstalación 3000'] },
    { id: 'mo-ins-4500', name: 'Mano de Obra Instalación 4.500 FG', category: CATALOG_CATEGORIES.LABOR, unit: 'unidad', netPrice: calculateLaborPrice(p, '4500'), keywords: ['instalacion 4500', 'instalación 4500', 'mo 4500'] },
    { id: 'mo-des-4500', name: 'Desinstalación 4.500 FG (50% M.O.)', category: CATALOG_CATEGORIES.LABOR, unit: 'unidad', netPrice: calculateUninstallationPrice(p, '4500'), keywords: ['desinstalacion 4500', 'desinstalación 4500'] },
    { id: 'mo-ins-5500', name: 'Mano de Obra Instalación 5.500 FG', category: CATALOG_CATEGORIES.LABOR, unit: 'unidad', netPrice: calculateLaborPrice(p, '5500'), keywords: ['instalacion 5500', 'instalación 5500', 'mo 5500'] },
    { id: 'mo-des-5500', name: 'Desinstalación 5.500 FG (50% M.O.)', category: CATALOG_CATEGORIES.LABOR, unit: 'unidad', netPrice: calculateUninstallationPrice(p, '5500'), keywords: ['desinstalacion 5500', 'desinstalación 5500'] },
    { id: 'mo-ins-6000', name: 'Mano de Obra Instalación 6.000 FG', category: CATALOG_CATEGORIES.LABOR, unit: 'unidad', netPrice: calculateLaborPrice(p, '6000'), keywords: ['instalacion 6000', 'instalación 6000', 'mo 6000'] },
    { id: 'mo-des-6000', name: 'Desinstalación 6.000 FG (50% M.O.)', category: CATALOG_CATEGORIES.LABOR, unit: 'unidad', netPrice: calculateUninstallationPrice(p, '6000'), keywords: ['desinstalacion 6000', 'desinstalación 6000'] },
    { id: 'mo-ins-8000', name: 'Mano de Obra Instalación 8.000 FG', category: CATALOG_CATEGORIES.LABOR, unit: 'unidad', netPrice: calculateLaborPrice(p, '8000'), keywords: ['instalacion 8000', 'instalación 8000', 'mo 8000'] },
    { id: 'mo-des-8000', name: 'Desinstalación 8.000 FG (50% M.O.)', category: CATALOG_CATEGORIES.LABOR, unit: 'unidad', netPrice: calculateUninstallationPrice(p, '8000'), keywords: ['desinstalacion 8000', 'desinstalación 8000'] },
    { id: 'mo-ins-12000', name: 'Mano de Obra Instalación 12.000 a 18.000 FG', category: CATALOG_CATEGORIES.LABOR, unit: 'unidad', netPrice: calculateLaborPrice(p, '12000_18000'), keywords: ['instalacion 12000', 'instalacion 18000', 'instalación 12000', 'instalación 18000'] },
    { id: 'mo-des-12000', name: 'Desinstalación 12.000 a 18.000 FG (50% M.O.)', category: CATALOG_CATEGORIES.LABOR, unit: 'unidad', netPrice: calculateUninstallationPrice(p, '12000_18000'), keywords: ['desinstalacion 12000', 'desinstalacion 18000', 'desinstalación 12000', 'desinstalación 18000'] },
  ];
}

/**
 * Catálogo estático por defecto (para compatibilidad hacia atrás).
 */
export const OFFICIAL_MATERIALS_CATALOG = buildMaterialsCatalog(DEFAULT_PRICING_PARAMETERS);

/**
 * Aplica un porcentaje de aumento masivo por inflación a todos los costos base de insumos y mano de obra.
 * @param {object} params - Parámetros actuales
 * @param {number} percentage - Porcentaje de aumento (ej. 8 para +8%)
 * @returns {object} Nuevos parámetros ajustados
 */
export function applyInflationAdjustment(params, percentage) {
  const p = JSON.parse(JSON.stringify(params || DEFAULT_PRICING_PARAMETERS));
  const mult = 1 + (percentage / 100);

  // 1. Cobre base
  p.copperPricePerKg = roundCurrency(p.copperPricePerKg * mult);

  // 2. Caños rígidos
  for (const k in p.rigidPipes) {
    p.rigidPipes[k] = roundCurrency(p.rigidPipes[k] * mult);
  }

  // 3. Aislaciones Bellini
  for (const k in p.insulationBellini) {
    p.insulationBellini[k] = roundCurrency(p.insulationBellini[k] * mult);
  }

  // 4. Mangueras Reld
  for (const k in p.hosesReld) {
    p.hosesReld[k] = roundCurrency(p.hosesReld[k] * mult);
  }

  // 5. Cables Reld
  for (const k in p.cablesReld) {
    p.cablesReld[k] = roundCurrency(p.cablesReld[k] * mult);
  }

  // 6. Cintas Reld
  for (const k in p.tapesReld) {
    p.tapesReld[k] = roundCurrency(p.tapesReld[k] * mult);
  }

  // 7. Ménsulas y Fijaciones
  for (const k in p.bracketsAndFixings) {
    p.bracketsAndFixings[k] = roundCurrency(p.bracketsAndFixings[k] * mult);
  }

  // 8. Mano de obra base instalador
  for (const k in p.baseLabor) {
    p.baseLabor[k] = roundCurrency(p.baseLabor[k] * mult);
  }

  return p;
}

/**
 * Busca el precio neto sugerido en base a la descripción del ítem ingresado.
 * @param {string} description - Texto ingresado por el técnico o admin
 * @param {Array} [catalog] - Catálogo dinámico opcional (o OFFICIAL_MATERIALS_CATALOG por defecto)
 * @returns {object|null} Objeto { unit_price, matched_name } o null
 */
export function findSuggestedPrice(description, catalog = OFFICIAL_MATERIALS_CATALOG) {
  if (!description || typeof description !== 'string') return null;
  const clean = description.toLowerCase().trim();
  const cat = catalog || OFFICIAL_MATERIALS_CATALOG;

  // 1. Coincidencia exacta de nombre
  const exact = cat.find((m) => m.name.toLowerCase() === clean);
  if (exact) return { unit_price: exact.netPrice, matched_name: exact.name };

  // 2. Coincidencia por palabras clave
  for (const item of cat) {
    if (item.keywords && item.keywords.some((k) => clean.includes(k.toLowerCase()))) {
      return { unit_price: item.netPrice, matched_name: item.name };
    }
  }

  // 3. Coincidencia difusa de subcadena
  for (const item of cat) {
    const itemClean = item.name.toLowerCase();
    if (clean.includes(itemClean) || itemClean.includes(clean)) {
      return { unit_price: item.netPrice, matched_name: item.name };
    }
  }

  return null;
}

/**
 * Calcula el presupuesto total interactivo (Hoja RESUMEN).
 * @param {string} capacityKey - '3000' | '4500' | '5500' | '6000' | '8000' | '12000_18000'
 * @param {object} quantities - Cantidades ingresadas por el usuario
 * @param {object} [combosByCapacity] - Combos dinámicos opcionales
 * @returns {object} Detalle de ítems, subtotal neto, IVA y total con IVA
 */
export function calculateComboBudget(capacityKey, quantities = {}, combosByCapacity = INSTALLATION_COMBOS_BY_CAPACITY) {
  const combos = combosByCapacity || INSTALLATION_COMBOS_BY_CAPACITY;
  const combo = combos[capacityKey] || combos['3000'];
  const items = combo.items;

  const pipeMetersQty = quantities.pipeMeters !== undefined ? Number(quantities.pipeMeters) : 3;
  const bracketsQty = quantities.brackets !== undefined ? Number(quantities.brackets) : 1;
  const bracketLegsQty = quantities.bracketLegs !== undefined ? Number(quantities.bracketLegs) : 1;
  const floorLegsQty = quantities.floorLegs !== undefined ? Number(quantities.floorLegs) : 0;
  const fixingKitsQty = quantities.fixingKits !== undefined ? Number(quantities.fixingKits) : 1;
  const installationLaborQty = quantities.installationLabor !== undefined ? Number(quantities.installationLabor) : 1;
  const uninstallationQty = quantities.uninstallation !== undefined ? Number(quantities.uninstallation) : 0;

  const lineItems = [
    {
      key: 'pipeMeter',
      label: items.pipeMeter.label,
      unit: items.pipeMeter.unit,
      unitPrice: items.pipeMeter.price,
      quantity: pipeMetersQty,
      subtotalNeto: pipeMetersQty * items.pipeMeter.price,
    },
    {
      key: 'bracket',
      label: items.bracket.label,
      unit: items.bracket.unit,
      unitPrice: items.bracket.price,
      quantity: bracketsQty,
      subtotalNeto: bracketsQty * items.bracket.price,
    },
    {
      key: 'bracketLegs',
      label: items.bracketLegs.label,
      unit: items.bracketLegs.unit,
      unitPrice: items.bracketLegs.price,
      quantity: bracketLegsQty,
      subtotalNeto: bracketLegsQty * items.bracketLegs.price,
    },
    {
      key: 'floorLegs',
      label: items.floorLegs.label,
      unit: items.floorLegs.unit,
      unitPrice: items.floorLegs.price,
      quantity: floorLegsQty,
      subtotalNeto: floorLegsQty * items.floorLegs.price,
    },
    {
      key: 'fixingKit',
      label: items.fixingKit.label,
      unit: items.fixingKit.unit,
      unitPrice: items.fixingKit.price,
      quantity: fixingKitsQty,
      subtotalNeto: fixingKitsQty * items.fixingKit.price,
    },
    {
      key: 'installationLabor',
      label: items.installationLabor.label,
      unit: items.installationLabor.unit,
      unitPrice: items.installationLabor.price,
      quantity: installationLaborQty,
      subtotalNeto: installationLaborQty * items.installationLabor.price,
    },
    {
      key: 'uninstallationLabor',
      label: items.uninstallationLabor.label,
      unit: items.uninstallationLabor.unit,
      unitPrice: items.uninstallationLabor.price,
      quantity: uninstallationQty,
      subtotalNeto: uninstallationQty * items.uninstallationLabor.price,
    },
  ];

  const subtotalNeto = roundCurrency(lineItems.reduce((acc, it) => acc + it.subtotalNeto, 0));
  const ivaAmount = roundCurrency(subtotalNeto * 0.21);
  const totalConIva = roundCurrency(subtotalNeto + ivaAmount);

  return {
    capacityKey,
    capacityLabel: combo.label,
    pipeSpecs: combo.pipeSpecs,
    lineItems,
    subtotalNeto,
    ivaAmount,
    totalConIva,
  };
}
