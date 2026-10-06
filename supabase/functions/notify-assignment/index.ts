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
    const payload = await req.json();
    console.log("1. Recibido webhook payload:", JSON.stringify(payload));
    
    const workOrder = payload.record;

    if (!workOrder || !workOrder.assigned_to) {
      console.log("2. Orden sin tecnico asignado, cancelando.");
      return new Response("No asignado a nadie o payload invalido", { status: 200 });
    }

    console.log("3. Buscando suscripciones para el tecnico:", workOrder.assigned_to);

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: subscriptions, error } = await supabaseClient
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", workOrder.assigned_to);

    if (error) {
      console.error("4. Error consultando DB:", error);
      throw error;
    }

    if (!subscriptions || subscriptions.length === 0) {
      console.log("5. El tecnico no tiene suscripciones push guardadas en la DB.");
      return new Response("El tecnico no tiene suscripciones push", { status: 200 });
    }

    console.log(`6. Se encontraron ${subscriptions.length} suscripciones para este tecnico. Armando payload...`);

    let clientName = "";
    if (workOrder.client_id) {
      const { data: clientData } = await supabaseClient
        .from('clients')
        .select('name')
        .eq('id', workOrder.client_id)
        .single();
      if (clientData) {
        clientName = clientData.name;
      }
    }

    const orderNumber = workOrder.order_number || "Pendiente";
    const bodyText = clientName 
      ? `Se te asignó un trabajo para ${clientName} (Orden: ${orderNumber}). Toca aquí para ver los detalles.`
      : `Se te asignó el trabajo ${orderNumber}. Toca aquí para revisarlo.`;

    const notificationPayload = JSON.stringify({
      title: "Nueva Asignación",
      body: bodyText,
      url: `/orden/${workOrder.id}`
    });

    const pushPromises = subscriptions.map((sub) => {
      console.log("7. Enviando push a endpoint:", sub.endpoint.substring(0, 50) + "...");
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth
        }
      };
      
      return webpush.sendNotification(pushSubscription, notificationPayload).then(() => {
         console.log("8. ¡Push enviado con exito a endpoint:", sub.endpoint.substring(0, 50) + "...");
      }).catch(async (err) => {
        console.error("8. Error enviando push a endpoint:", err);
        if (err.statusCode === 404 || err.statusCode === 410) {
          console.log(`Borrando suscripcion expirada: ${sub.id}`);
          await supabaseClient.from("push_subscriptions").delete().eq("id", sub.id);
        }
      });
    });

    await Promise.all(pushPromises);
    console.log("9. Finalizado el proceso de notificaciones.");
    
    return new Response(JSON.stringify({ success: true, sentCount: pushPromises.length }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    console.error(err);
    return new Response(String(err?.message ?? err), { status: 500 });
  }
});
