import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import Afip from "npm:@afipsdk/afip.js@0.8.1";

serve(async (req) => {
  // Configurar CORS
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers });
  }

  try {
    const cert = Deno.env.get('AFIP_CERT_PEM');
    const key = Deno.env.get('AFIP_KEY_PEM');

    if (!cert || !key) {
      throw new Error("Missing AFIP certificates in secrets");
    }

    const certPath = '/tmp/afip_cert.crt';
    const keyPath = '/tmp/afip_key.key';
    
    // Escribir los certificados temporalmente para que afip.js los pueda leer
    await Deno.writeTextFile(certPath, cert.replace(/\\n/g, '\n'));
    await Deno.writeTextFile(keyPath, key.replace(/\\n/g, '\n'));

    // Instanciar AFIP en modo testing (homologación)
    const afip = new Afip({
      CUIT: 23477380719,
      cert: certPath,
      key: keyPath,
      res_folder: '/tmp', // Deno allows writing to /tmp
      production: false
    });

    const body = await req.json();

    // Obtener el último comprobante autorizado
    const lastVoucher = await afip.ElectronicBilling.getLastVoucher(1, 11); // Punto de venta 1, Comprobante 11 (Factura C)

    const date = new Date(Date.now() - ((new Date()).getTimezoneOffset() * 60000)).toISOString().split('T')[0].replace(/-/g, '');

    const data = {
      'CantReg' 	: 1,  // Cantidad de comprobantes a registrar
      'PtoVta' 	: 1,  // Punto de venta
      'CbteTipo' 	: 11, // Tipo de comprobante (11 = Factura C) 
      'Concepto' 	: 3,  // Concepto (1 = Productos, 2 = Servicios, 3 = Productos y Servicios)
      'DocTipo' 	: 99, // Tipo de documento del comprador (99 = Consumidor Final, 80 = CUIT)
      'DocNro' 	: 0,  // Número de documento del comprador (0 para consumidor final < $344488)
      'CbteDesde' 	: lastVoucher + 1,
      'CbteHasta' 	: lastVoucher + 1,
      'CbteFch' 	: parseInt(date), // (Opcional) Fecha del comprobante (yyyymmdd) o null
      'ImpTotal' 	: body.amount || 100, // Importe total
      'ImpTotConc' 	: 0,   // Importe neto no gravado
      'ImpNeto' 	: body.amount || 100, // Importe neto gravado
      'ImpOpEx' 	: 0,   // Importe exento
      'ImpIVA' 	: 0,   // Importe total de IVA
      'ImpTrib' 	: 0,   // Importe total de tributos
      'FchServDesde' 	: parseInt(date),
      'FchServHasta' 	: parseInt(date),
      'FchVtoPago' 	: parseInt(date),
      'MonId' 	: 'PES', // Tipo de moneda (PES = Pesos)
      'MonCotiz' 	: 1    // Cotización de la moneda (1 para pesos)
    };

    // Crear la factura
    const res = await afip.ElectronicBilling.createVoucher(data);

    return new Response(
      JSON.stringify({
        success: true,
        voucher: {
          number: lastVoucher + 1,
          cae: res.CAE,
          cae_expiration: res.CAEFchVto
        }
      }),
      { headers: { ...headers, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("AFIP Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...headers, "Content-Type": "application/json" } }
    );
  }
});
