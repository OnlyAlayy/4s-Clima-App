/**
 * Catálogo Técnico de Materiales para PWA del Técnico (Sanitizado - Sin Precios ni Márgenes).
 * 
 * Estándar Industrial FSM: Un técnico en campo solo releva ítems y cantidades físicas.
 * Jamás debe recibir en su bundle web costos de proveedores, precios de venta ni márgenes de ganancia (GM).
 */

export const TECHNICAL_CAPACITY_OPTIONS = [
  { key: '3000', label: '3.000 frig/h', pipeSpecs: '1/2" - 1/4"' },
  { key: '4500', label: '4.500 frig/h', pipeSpecs: '1/2" - 1/4"' },
  { key: '5500', label: '5.500 frig/h', pipeSpecs: '3/4" - 1/4"' },
  { key: '6000', label: '6.000 frig/h', pipeSpecs: '5/8" - 1/4"' },
  { key: '8000', label: '8.000 frig/h', pipeSpecs: '5/8" - 3/8"' },
  { key: '12000_18000', label: '12.000 a 18.000 frig/h', pipeSpecs: '3/4" - 3/8"' },
];

export const TECHNICAL_COMBOS_BY_CAPACITY = {
  '3000': {
    label: '3.000 frig/h',
    pipeSpecs: '1/2" - 1/4"',
    bracketLabel: 'Ménsula 42cm',
    floorLegsLabel: 'Patas Piso',
  },
  '4500': {
    label: '4.500 frig/h',
    pipeSpecs: '1/2" - 1/4"',
    bracketLabel: 'Ménsula 52cm',
    floorLegsLabel: 'Patas Piso',
  },
  '5500': {
    label: '5.500 frig/h',
    pipeSpecs: '3/4" - 1/4"',
    bracketLabel: 'Ménsula 62cm',
    floorLegsLabel: 'Patas Piso',
  },
  '6000': {
    label: '6.000 frig/h',
    pipeSpecs: '5/8" - 1/4"',
    bracketLabel: 'Ménsula 62cm',
    floorLegsLabel: 'Patas Piso',
  },
  '8000': {
    label: '8.000 frig/h',
    pipeSpecs: '5/8" - 3/8"',
    bracketLabel: 'Ménsula 82cm',
    floorLegsLabel: 'Patas Piso',
  },
  '12000_18000': {
    label: '12.000 a 18.000 frig/h',
    pipeSpecs: '3/4" - 3/8"',
    bracketLabel: 'Ménsula 82cm',
    floorLegsLabel: 'Patas Piso 5TR Reforzadas',
  },
};

/**
 * Devuelve la lista de chips de materiales sugeridos para una capacidad dada (sin precios).
 */
export function getTechnicalMaterialChips(capacityKey = '3000') {
  const combo = TECHNICAL_COMBOS_BY_CAPACITY[capacityKey] || TECHNICAL_COMBOS_BY_CAPACITY['3000'];

  return [
    {
      label: `Caño (${combo.pipeSpecs})`,
      desc: `Metros de Caño (${combo.pipeSpecs} - ${combo.label})`,
      unit: 'metro',
    },
    {
      label: combo.bracketLabel,
      desc: combo.bracketLabel,
      unit: 'unidad',
    },
    {
      label: 'Patas Ménsula',
      desc: 'Patas Ménsula',
      unit: 'unidad',
    },
    {
      label: combo.floorLegsLabel,
      desc: combo.floorLegsLabel,
      unit: 'unidad',
    },
    {
      label: 'Kit Fijación',
      desc: 'Kit Fijación (Tarugos y Bulones)',
      unit: 'unidad',
    },
    {
      label: 'M.O. Instalación',
      desc: `Mano de Obra Instalación ${combo.label}`,
      unit: 'unidad',
    },
    {
      label: 'Desinstalación',
      desc: `Desinstalación ${combo.label} (50% M.O.)`,
      unit: 'unidad',
    },
  ];
}
