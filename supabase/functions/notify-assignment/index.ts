import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import webpush from "npm:web-push@3.6.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// Configuración de VAPID con sanitización estricta (sin espacios ni saltos de línea accidentales)
const VAPID_PUBLIC_KEY = (Deno.env.get("VAPID_PUBLIC_KEY") || "").trim();
const VAPID_PRIVATE_KEY = (Deno.env.get("VAPID_PRIVATE_KEY") || "").trim();
const VAPID_SUBJECT = "mailto:admin@4sclima.com";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    console.log("0. VAPID configurado exitosamente. Prefijo clave pública:", VAPID_PUBLIC_KEY.slice(0, 12));
  } catch (vapidErr) {
    console.error("0. Error configurando VAPID keys en webpush:", vapidErr);
  }
} else {
  console.warn("0. ALERTA: Faltan VAPID_PUBLIC_KEY o VAPID_PRIVATE_KEY en los Secrets de Supabase.");
}

serve(async (req) => {
  // CORS Headers
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers });
  }

  try {
    const payload = await req.json();
    console.log("1. Recibido webhook/invocación payload:", JSON.stringify(payload));

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Validación de Webhook Secret (si está configurado en Supabase Secrets)
    const expectedWebhookSecret = Deno.env.get("NOTIFY_WEBHOOK_SECRET");
    if (expectedWebhookSecret) {
      const incomingSecret = req.headers.get("x-webhook-secret");
      if (incomingSecret !== expectedWebhookSecret) {
        console.warn("Rechazado: Header x-webhook-secret no coincide con NOTIFY_WEBHOOK_SECRET");
        return new Response(
          JSON.stringify({ error: "Unauthorized: Invalid webhook secret" }),
          { headers, status: 401 }
        );
      }
    }

    // Acción auxiliar de limpieza directa (Protegida estrictamente por JWT)
    if (payload.action === 'cleanup') {
      const targetUserId = payload.user_id;
      if (!targetUserId) {
        return new Response(JSON.stringify({ error: "Falta user_id" }), { headers, status: 400 });
      }

      const authHeader = req.headers.get("Authorization");
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return new Response(
          JSON.stringify({ error: "Acceso denegado: Token de autorización requerido para cleanup." }),
          { headers, status: 401 }
        );
      }
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: "Token inválido o expirado." }),
          { headers, status: 401 }
        );
      }

      // Solo el propio usuario o un admin/owner puede limpiar suscripciones
      let isAllowed = user.id === targetUserId;
      if (!isAllowed) {
        const { data: userProfile } = await supabaseClient
          .from("users")
          .select("role")
          .eq("id", user.id)
          .single();
        if (userProfile && ["admin", "owner"].includes(userProfile.role)) {
          isAllowed = true;
        }
      }

      if (!isAllowed) {
        return new Response(
          JSON.stringify({ error: "Prohibido: No tienes permisos para limpiar suscripciones de otro usuario." }),
          { headers, status: 403 }
        );
      }

      console.log("Limpieza autorizada ejecutándose para user_id:", targetUserId);
      const { error: delError, count } = await supabaseClient
        .from("push_subscriptions")
        .delete({ count: 'exact' })
        .eq("user_id", targetUserId);

      return new Response(
        JSON.stringify({ success: !delError, deletedCount: count, error: delError?.message }),
        { headers, status: 200 }
      );
    }

    const workOrder = payload.record || payload.workOrder;

    if (!workOrder || !workOrder.assigned_to) {
      console.log("2. Orden sin técnico asignado o payload inválido. Cancelando.");
      return new Response(
        JSON.stringify({ message: "No asignado a nadie o payload inválido" }),
        { headers, status: 200 }
      );
    }

    const technicianId = workOrder.assigned_to;
    console.log("3. Buscando suscripciones para el técnico:", technicianId);

    const { data: subscriptions, error } = await supabaseClient
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", technicianId);

    if (error) {
      console.error("4. Error consultando DB:", error);
      throw error;
    }

    if (!subscriptions || subscriptions.length === 0) {
      console.log("5. El técnico no tiene suscripciones push guardadas en la DB.");
      return new Response(
        JSON.stringify({ success: true, message: "El técnico no tiene suscripciones push activas" }),
        { headers, status: 200 }
      );
    }

    // Ordenar de más reciente a más antigua (para que el celular activo reciba primero)
    subscriptions.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

    console.log(`6. Se encontraron ${subscriptions.length} suscripciones para este técnico. Armando payload...`);

    let clientName = "";
    if (workOrder.client_id) {
      try {
        const { data: clientData } = await supabaseClient
          .from("clients")
          .select("name")
          .eq("id", workOrder.client_id)
          .single();
        if (clientData) {
          clientName = clientData.name;
        }
      } catch (cErr) {
        console.warn("No se pudo obtener cliente:", cErr);
      }
    }

    const orderNumber = workOrder.order_number || "Pendiente";
    const bodyText = clientName
      ? `Se te asignó un trabajo para ${clientName} (Orden: ${orderNumber}). Toca aquí para ver los detalles.`
      : `Se te asignó el trabajo ${orderNumber}. Toca aquí para revisarlo.`;

    const notificationPayload = JSON.stringify({
      title: "Nueva Asignación",
      body: bodyText,
      url: `/orden/${workOrder.id || ''}`
    });

    // Helper: Envío individual a cada endpoint protegido con Promise.race y timeout de 5 segundos
    const sendWithTimeout = async (sub: any, index: number, total: number) => {
      const endpointPrefix = sub.endpoint.substring(0, 55) + "...";
      console.log(`7. [${index + 1}/${total}] Enviando push a endpoint: ${endpointPrefix}`);

      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth
        }
      };

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout de 5000ms al enviar Web Push")), 5000)
      );

      try {
        const res = await Promise.race([
          webpush.sendNotification(pushSubscription, notificationPayload, {
            TTL: 60,
            timeout: 4500
          }),
          timeoutPromise
        ]);

        console.log(`8. [${index + 1}/${total}] ¡Push enviado con éxito! Status: ${(res as any)?.statusCode || 201}`);
        return { success: true, endpoint: sub.endpoint, status: (res as any)?.statusCode || 201 };
      } catch (err: any) {
        const status = err.statusCode || err.status || 0;
        console.error(`8. [${index + 1}/${total}] Error en endpoint (${endpointPrefix}): status=${status}, msg=${err.message}, body=${err.body || ''}`);

        // Limpieza de suscripciones inválidas o expiradas (400, 404, 410)
        if (status === 404 || status === 410 || status === 400) {
          console.log(`Borrando suscripción expirada o inválida de DB: ${sub.id}`);
          try {
            await supabaseClient.from("push_subscriptions").delete().eq("id", sub.id);
          } catch (delErr) {
            console.error("Error al borrar suscripción expirada:", delErr);
          }
        }
        return { success: false, endpoint: sub.endpoint, error: err.message, status };
      }
    };

    // Envío en paralelo sin bloqueos usando Promise.allSettled
    const pushPromises = subscriptions.map((sub, idx) =>
      sendWithTimeout(sub, idx, subscriptions.length)
    );

    const settledResults = await Promise.allSettled(pushPromises);
    const summary = settledResults.map(r => r.status === 'fulfilled' ? r.value : { success: false, error: r.reason });

    const sentCount = summary.filter((s: any) => s.success).length;
    const failCount = summary.length - sentCount;

    console.log(`9. Proceso finalizado. Total: ${summary.length}, Exitosos: ${sentCount}, Fallidos/Limpiados: ${failCount}`);

    return new Response(
      JSON.stringify({
        success: true,
        sentCount,
        failCount,
        results: summary
      }),
      { headers, status: 200 }
    );
  } catch (err: any) {
    console.error("Error general en Edge Function notify-assignment:", err);
    return new Response(
      JSON.stringify({ error: String(err?.message ?? err) }),
      { headers: { "Content-Type": "application/json" }, status: 500 }
    );
  }
});
