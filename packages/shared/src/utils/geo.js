/**
 * @4s-clima/shared - Utilidades de Geolocalización y Mapas
 */

export const DEFAULT_MAP_CENTER = [-34.6037, -58.3816]; // Buenos Aires / CABA (Obelisco)
export const DEFAULT_MAP_ZOOM = 13;

/**
 * Resuelve la cascada de ubicación de una Orden de Trabajo:
 * 1. Coordenadas y dirección directa de la orden (cliente de 1 sola vez / eventual).
 * 2. Coordenadas y dirección de la sucursal/planta asignada (cliente permanente).
 * 3. Fallback a dirección de texto (órdenes viejas sin GPS cargado o dirección fiscal del cliente).
 * 
 * @param {Object} order - Objeto de orden de trabajo de Supabase
 * @returns {Object} { type: 'custom'|'plant'|'text_only'|'none', latitude, longitude, address, label, hasCoordinates: boolean }
 */
export function resolveOrderLocation(order) {
  if (!order) {
    return {
      type: 'none',
      latitude: null,
      longitude: null,
      address: '',
      label: 'Sin ubicación',
      hasCoordinates: false,
    };
  }

  // 1. Prioridad: Orden eventual de 1 sola vez (coordenadas custom en la orden)
  if (order.custom_latitude && order.custom_longitude) {
    return {
      type: 'custom',
      latitude: Number(order.custom_latitude),
      longitude: Number(order.custom_longitude),
      address: order.custom_address || order.plant?.address || order.client?.address || 'Ubicación específica de la orden',
      label: 'Destino eventual de la orden',
      floor: null,
      hasCoordinates: true,
    };
  }

  // 2. Prioridad: Sucursal permanente (coordenadas guardadas en la planta)
  if (order.plant?.latitude && order.plant?.longitude) {
    return {
      type: 'plant',
      latitude: Number(order.plant.latitude),
      longitude: Number(order.plant.longitude),
      address: order.plant.address || 'Dirección de planta',
      label: order.plant.name || 'Sucursal del cliente',
      floor: order.plant.floor || null,
      hasCoordinates: true,
    };
  }

  // 3. Fallback: Solo texto (órdenes existentes en producción o sin coordenadas guardadas)
  const fallbackAddress = order.custom_address || order.plant?.address || order.client?.address || null;
  return {
    type: fallbackAddress ? 'text_only' : 'none',
    latitude: null,
    longitude: null,
    address: fallbackAddress || 'Sin dirección registrada',
    label: order.plant?.name || order.client?.name || 'Destino',
    floor: order.plant?.floor || null,
    hasCoordinates: false,
  };
}

/**
 * Fórmula de Haversine para calcular distancia esférica en metros entre dos coordenadas.
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371e3; // Radio de la Tierra en metros
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c); // Distancia en metros
}

/**
 * Formatea una distancia en metros a formato legible ("450 m" o "3.2 km").
 */
export function formatDistance(meters) {
  if (meters === null || meters === undefined) return '—';
  if (meters < 1000) return `${meters} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * Búsqueda de dirección gratuita mediante OpenStreetMap Nominatim.
 * Retorna las coordenadas sugeridas o null si no se encuentra.
 */
export async function searchAddressCoordinates(addressText) {
  if (!addressText || addressText.trim().length < 3) return null;

  try {
    const query = encodeURIComponent(`${addressText}, Argentina`);
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`,
      {
        headers: {
          'Accept-Language': 'es',
        },
      }
    );

    if (!response.ok) return null;
    const results = await response.json();
    if (results && results.length > 0) {
      return {
        lat: parseFloat(results[0].lat),
        lng: parseFloat(results[0].lon),
        displayName: results[0].display_name,
      };
    }
  } catch (err) {
    console.warn('Geocodificación Nominatim no disponible:', err);
  }
  return null;
}
