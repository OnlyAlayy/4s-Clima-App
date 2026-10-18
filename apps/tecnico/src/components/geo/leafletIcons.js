import L from 'leaflet';

/**
 * Icono personalizado para el punto de destino (Planta o Cliente Eventual).
 */
export function createDestinationIcon(title = 'Destino') {
  return L.divIcon({
    className: 'custom-destination-marker',
    html: `
      <div style="width: 32px; height: 40px; cursor: pointer; display: flex; align-items: flex-start; justify-content: center;">
        <svg viewBox="0 0 24 30" width="32" height="40" style="filter: drop-shadow(0px 2px 4px rgba(0,0,0,0.45));">
          <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 18 12 18s12-9 12-18c0-6.627-5.373-12-12-12z" fill="#EF4444"/>
          <circle cx="12" cy="11" r="5" fill="#FFFFFF"/>
          <circle cx="12" cy="11" r="3" fill="#DC2626"/>
        </svg>
      </div>
    `,
    iconSize: [32, 40],
    iconAnchor: [16, 40],
    popupAnchor: [0, -36],
  });
}

/**
 * Icono personalizado para el técnico en vivo (Live Tracking).
 */
export function createTechnicianIcon(heading = null) {
  const rotation = heading !== null && heading !== undefined ? `transform: rotate(${heading}deg);` : '';

  return L.divIcon({
    className: 'custom-technician-marker',
    html: `
      <div style="position: relative; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;">
        <span style="position: absolute; width: 100%; height: 100%; border-radius: 50%; background: rgba(37, 99, 235, 0.3); animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></span>
        <div style="position: relative; width: 26px; height: 26px; border-radius: 50%; background: #2563EB; border: 3px solid #FFFFFF; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; ${rotation}">
          ${
            heading !== null
              ? `<svg viewBox="0 0 24 24" width="14" height="14" fill="white">
                   <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/>
                 </svg>`
              : `<div style="width: 8px; height: 8px; border-radius: 50%; background: white;"></div>`
          }
        </div>
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20],
  });
}
