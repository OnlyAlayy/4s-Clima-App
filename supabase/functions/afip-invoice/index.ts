import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import Afip from "npm:@afipsdk/afip.js@0.8.1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

serve(async (req) => {
  // Configurar CORS seguro
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { ...headers, "Content-Type": "application/json" }
    });
  }

  try {
    // 1. Verificación obligatoria de Autenticación (JWT)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Acceso denegado: Token de autorización faltante." }),
        { status: 401, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }
    const token = authHeader.replace("Bearer ", "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: "Configuración interna de base de datos no disponible." }),
        { status: 500, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey || supabaseServiceKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });

    const { data: { user }, error: authError } = await authClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Token de autenticación inválido o expirado." }),
        { status: 401, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    // 2. Control estricto de Rol (Solo admin y owner)
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: userProfile, error: profileError } = await adminClient
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || !userProfile || !["admin", "owner"].includes(userProfile.role)) {
      return new Response(
        JSON.stringify({ error: "Acceso prohibido: Solo administradores o propietarios pueden emitir comprobantes fiscales." }),
        { status: 403, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    // 3. Procesar datos de entrada
    const body = await req.json();
    const orderId = body.orderId;
    const isCreditNote = body.isCreditNote === true;

    // 4. Idempotencia y protección contra Doble Facturación
    if (orderId) {
      const { data: orderData, error: orderErr } = await adminClient
        .from("work_orders")
        .select("id, afip_cae, afip_voucher_number")
        .eq("id", orderId)
        .single();

      if (!orderErr && orderData?.afip_cae && !isCreditNote) {
        return new Response(
          JSON.stringify({
            error: `Esta orden ya cuenta con Factura emitida (Comprobante: ${orderData.afip_voucher_number || 'A-00001-N/D'}, CAE: ${orderData.afip_cae}). Operación cancelada para evitar duplicación fiscal.`
          }),
          { status: 409, headers: { ...headers, "Content-Type": "application/json" } }
        );
      }
    }

    // 5. Lectura de certificados fiscales desde Secrets
    const cert = Deno.env.get('AFIP_CERT_PEM');
    const key = Deno.env.get('AFIP_KEY_PEM');

    if (!cert || !key) {
      throw new Error("Certificados fiscales AFIP no configurados en los secretos del servidor.");
    }

    const certPath = '/tmp/afip_cert.crt';
    const keyPath = '/tmp/afip_key.key';
    
    await Deno.writeTextFile(certPath, cert.replace(/\\n/g, '\n'));
    await Deno.writeTextFile(keyPath, key.replace(/\\n/g, '\n'));

    // 6. Instanciación de AFIP SDK
    const afip = new Afip({
      CUIT: 23477380719,
      cert: certPath,
      key: keyPath,
      res_folder: '/tmp',
      production: false
    });

    const roundCurrency = (val: number | string) => Math.round((Number(val) + Number.EPSILON) * 100) / 100;
    const rawNet = body.netAmount !== undefined ? body.netAmount : (body.amount || 100);
    const impNeto = roundCurrency(rawNet);
    const impIVA = roundCurrency(impNeto * 0.21);
    const impTotal = roundCurrency(impNeto + impIVA);

    const clientCuit = (body.clientCuit || '').toString().replace(/\D/g, '');
    const docTipo = clientCuit.length === 11 ? 80 : 99;
    const docNro = clientCuit.length === 11 ? parseInt(clientCuit, 10) : 0;
    const condicionIva = clientCuit.length === 11 ? 1 : 5;

    const cbteTipo = isCreditNote ? 3 : 1;
    const ptoVta = body.ptoVta || 1;
    const lastVoucher = await afip.ElectronicBilling.getLastVoucher(ptoVta, cbteTipo);

    const date = new Date(Date.now() - ((new Date()).getTimezoneOffset() * 60000)).toISOString().split('T')[0].replace(/-/g, '');

    const data: any = {
      'CantReg' 	: 1,
      'PtoVta' 	: ptoVta,
      'CbteTipo' 	: cbteTipo,
      'Concepto' 	: 3,
      'DocTipo' 	: docTipo,
      'DocNro' 	: docNro,  
      'CbteDesde' 	: lastVoucher + 1,
      'CbteHasta' 	: lastVoucher + 1,
      'CbteFch' 	: parseInt(date),
      'ImpTotal' 	: impTotal,
      'ImpTotConc' 	: 0,
      'ImpNeto' 	: impNeto,
      'ImpOpEx' 	: 0,
      'ImpIVA' 	: impIVA,
      'ImpTrib' 	: 0,
      'FchServDesde' 	: parseInt(date),
      'FchServHasta' 	: parseInt(date),
      'FchVtoPago' 	: parseInt(date),
      'MonId' 	: 'PES', 
      'MonCotiz' 	: 1,
      'CondicionIVAReceptorId': condicionIva,
      'Iva': [
        {
          'Id': 5,
          'BaseImp': impNeto,
          'Importe': impIVA
        }
      ]
    };

    if (isCreditNote && body.associatedInvoice) {
      data['CbtesAsoc'] = [
        {
          'Tipo': 1,
          'PtoVta': ptoVta,
          'Nro': body.associatedInvoice
        }
      ];
    }

    // 7. Autorización electrónica con AFIP
    const res = await afip.ElectronicBilling.createVoucher(data);
    const voucherNumber = lastVoucher + 1;
    const formattedVoucherNumber = `A-${String(ptoVta).padStart(5, '0')}-${String(voucherNumber).padStart(8, '0')}`;

    // 8. Registro en base de datos si se proporcionó orderId
    if (orderId) {
      await adminClient.from("afip_vouchers").insert({
        work_order_id: orderId,
        voucher_type: isCreditNote ? "credit_note" : "invoice",
        voucher_number: voucherNumber,
        cae: res.CAE.toString(),
        amount: impTotal
      });

      const updateData = isCreditNote 
        ? { payment_status: 'unbilled', total_amount: 0, afip_voucher_number: null, afip_cae: null }
        : { 
            payment_status: 'pending', 
            total_amount: impTotal, 
            afip_voucher_number: formattedVoucherNumber, 
            afip_cae: res.CAE.toString()
          };

      await adminClient.from("work_orders").update(updateData).eq("id", orderId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        voucher: {
          number: voucherNumber,
          formatted_number: formattedVoucherNumber,
          cae: res.CAE,
          cae_expiration: res.CAEFchVto,
          net_amount: impNeto,
          iva_amount: impIVA,
          total_amount: impTotal
        }
      }),
      { headers: { ...headers, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("AFIP Error:", error);
    const clientMessage = error?.message?.includes('/tmp') || error?.message?.includes('PEM') || error?.message?.includes('ENOENT')
      ? 'Error de comunicación o certificados con AFIP/ARCA.'
      : (error?.message || 'Error interno al emitir comprobante fiscal');

    return new Response(
      JSON.stringify({ error: clientMessage }),
      { status: 500, headers: { ...headers, "Content-Type": "application/json" } }
    );
  }
});
