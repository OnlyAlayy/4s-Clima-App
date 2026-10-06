import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import webpush from "npm:web-push@3.6.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = "mailto:admin@4sclima.com";

// Configurar Web Push
webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

serve(async (req) => {
  try {
    // 1. Leer el payload del Webhook de Supabase
    const payload = await req.json();
    const workOrder = payload.record; // El registro insertado/actualizado en la DB

    if (!workOrder || !workOrder.assigned_to) {
      return new Response("No asignado a nadie o payload invalido", { status: 200 });
    }

    // 2. Conectar a Supabase usando la clave de servicio
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 3. Buscar suscripciones activas del técnico
    const { data: subscriptions, error } = await supabaseClient
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", workOrder.assigned_to);

    if (error) throw error;
    if (!subscriptions || subscriptions.length === 0) {
      return new Response("El tecnico no tiene suscripciones push", { status: 200 });
    }

    // 4. Armar el mensaje
    const notificationPayload = JSON.stringify({
      title: "🚀 Nueva Asignación",
      body: `Te han asignado la OT ${workOrder.order_number || "Pendiente"}. ¡Revisala!`,
      url: `/orden/${workOrder.id}`
    });

    // 5. Enviar a todos los dispositivos registrados de ese técnico
    const pushPromises = subscriptions.map((sub) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth
        }
      };
      
      return webpush.sendNotification(pushSubscription, notificationPayload).catch(async (err) => {
        // Si el endpoint expiró o fue desuscrito desde el navegador, lo borramos
        if (err.statusCode === 404 || err.statusCode === 410) {
          console.log(`Borrando suscripcion expirada: ${sub.id}`);
          await supabaseClient.from("push_subscriptions").delete().eq("id", sub.id);
        } else {
          console.error("Error enviando push:", err);
        }
      });
    });

    await Promise.all(pushPromises);
    
    return new Response(JSON.stringify({ success: true, sentCount: pushPromises.length }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    console.error(err);
    return new Response(String(err?.message ?? err), { status: 500 });
  }
});
