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

/**
 * Calcula el tiempo estimado de llegada (ETA) en minutos.
 * Aplica factor de ruteo urbano (~1.32x sobre distancia esférica)
 * y pondera velocidad instantánea con baseline urbano argentino (26-28 km/h).
 * 
 * @param {number} distanceMeters - Distancia en metros
 * @param {number} currentSpeedKmh - Velocidad actual reportada por GPS (opcional)
 * @returns {number|null} Minutos estimados de viaje
 */
export function calculateEtaMinutes(distanceMeters, currentSpeedKmh = 0) {
  if (distanceMeters == null || distanceMeters < 0) return null;
  if (distanceMeters < 120) return 1; // Prácticamente en destino

  const speed = Number(currentSpeedKmh) || 0;
  // Si el móvil va a velocidad vehicular (>15 km/h), ponderamos 40% velocidad real + 60% baseline
  const effectiveSpeed = speed > 15 ? Math.min(speed * 0.4 + 28 * 0.6, 75) : 26;

  // Factor de ruteo vehicular urbano
  const routedDistanceKm = (distanceMeters / 1000) * 1.32;
  const hours = routedDistanceKm / effectiveSpeed;
  return Math.max(1, Math.round(hours * 60));
}

/**
 * Formatea el ETA en minutos a texto amigable ("~8 min", "1 h 15 min").
 */
export function formatEta(etaMinutes) {
  if (etaMinutes == null) return '—';
  if (etaMinutes < 1) return '< 1 min';
  if (etaMinutes < 60) return `~${etaMinutes} min`;
  const hours = Math.floor(etaMinutes / 60);
  const mins = etaMinutes % 60;
  return `~${hours} h ${mins > 0 ? `${mins} min` : ''}`;
}

/**
 * Calcula la hora estimada de arribo (Date) a partir del ETA en minutos.
 */
export function calculateEstimatedArrival(etaMinutes) {
  if (etaMinutes == null) return null;
  return new Date(Date.now() + etaMinutes * 60 * 1000);
}

/**
 * Evalúa si el arribo proyectado está a tiempo o demorado respecto a la hora programada.
 * 
 * @param {string} scheduledDate - Fecha YYYY-MM-DD
 * @param {string} scheduledTime - Hora HH:mm o HH:mm:ss
 * @param {number} etaMinutes - Minutos estimados de viaje
 * @returns {Object} { status: 'on_time'|'delayed'|'unknown', delayMinutes: number, label: string }
 */
export function evaluateSchedulePunctuality(scheduledDate, scheduledTime, etaMinutes) {
  if (!scheduledDate || !scheduledTime || etaMinutes == null) {
    return { status: 'unknown', delayMinutes: 0, label: 'En viaje' };
  }

  try {
    const timeParts = scheduledTime.slice(0, 5).split(':');
    const target = new Date(scheduledDate);
    // Si la fecha solo trae YYYY-MM-DD, new Date() lo interpreta en UTC
    const [y, m, d] = scheduledDate.split('-').map(Number);
    target.setFullYear(y, m - 1, d);
    target.setHours(parseInt(timeParts[0], 10), parseInt(timeParts[1], 10), 0, 0);

    const projectedArrival = new Date(Date.now() + etaMinutes * 60 * 1000);
    const diffMs = projectedArrival.getTime() - target.getTime();
    const diffMins = Math.round(diffMs / 60000);

    // Margen de tolerancia de cortesía: 12 minutos
    if (diffMins > 12) {
      return {
        status: 'delayed',
        delayMinutes: diffMins,
        label: `Demorado (+${diffMins} min)`,
      };
    }

    return {
      status: 'on_time',
      delayMinutes: 0,
      label: 'En horario programado',
    };
  } catch {
    return { status: 'unknown', delayMinutes: 0, label: 'En viaje' };
  }
}

/**
 * Determina si el técnico se encuentra en la geocerca de proximidad (< 150m) de la planta o cliente.
 */
export function isNearDestination(distanceMeters, radiusMeters = 150) {
  return distanceMeters !== null && distanceMeters !== undefined && distanceMeters <= radiusMeters;
}

/**
 * Genera el enlace de WhatsApp para enviar el aviso de arribo y estado de viaje al cliente.
 */
export function generateWhatsAppTrackingUrl({
  phone,
  technicianName,
  clientName,
  orderNumber,
  address,
  distanceMeters,
  etaMinutes,
}) {
  const etaText = etaMinutes ? formatEta(etaMinutes) : '';
  const distText = distanceMeters !== null ? formatDistance(distanceMeters) : '';
  const arrivalTime = etaMinutes
    ? new Date(Date.now() + etaMinutes * 60 * 1000).toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  let message = `¡Hola! Te informamos desde *4S Clima* que nuestro técnico *${technicianName || 'asignado'}* se encuentra en viaje hacia tus instalaciones.`;
  if (clientName) message += `\n🏢 *Destino:* ${clientName}`;
  if (address) message += ` (${address})`;
  if (orderNumber) message += `\n📋 *Orden:* #${orderNumber}`;
  if (distText) message += `\n📍 *Distancia actual:* ${distText}`;
  if (etaText && arrivalTime) message += `\n⏱️ *Llegada estimada:* ${etaText} (aprox. ${arrivalTime} hs)`;
  message += `\n\n_Centro de Despacho Operativo — 4S Clima._`;

  const cleanPhone = (phone || '').replace(/[^0-9]/g, '');
  const encodedText = encodeURIComponent(message);
  return cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodedText}`
    : `https://wa.me/?text=${encodedText}`;
}
