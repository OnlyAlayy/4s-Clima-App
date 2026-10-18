import fs from 'fs';
import path from 'path';
import Afip from '@afipsdk/afip.js';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // 1. Verificación de Seguridad (Autenticación)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Falta el token de autenticación. Acceso denegado.' });
    }
    const token = authHeader.replace('Bearer ', '');

    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      return res.status(500).json({ error: 'Configuración de base de datos faltante en el servidor.' });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Token inválido o expirado. Acceso denegado.' });
    }

    // Role validation: permite 'admin' y 'owner'
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userData || !['admin', 'owner'].includes(userData.role)) {
      console.warn('Acceso denegado a usuario:', user.id, 'role:', userData?.role, 'error:', userError);
      return res.status(403).json({ error: 'Prohibido: Solo administradores o propietarios pueden facturar.' });
    }

    // 2. Procesar solicitud de factura
    const amount = req.body.amount || 0;
    const orderId = req.body.orderId;
    if (!orderId) {
      return res.status(400).json({ error: 'Falta orderId' });
    }

    // 2.5 Fetch Client Data from DB
    const { data: orderData, error: orderError } = await supabase
      .from('work_orders')
      .select('client_id, clients(cuit)')
      .eq('id', orderId)
      .single();
      
    if (orderError || !orderData) {
      return res.status(404).json({ error: 'Orden de trabajo no encontrada' });
    }
    
    let docTipo = 99; // Consumidor Final / Sin Identificar
    let docNro = 0;
    let condicionIva = 5; // Consumidor Final

    const clientCuit = orderData.clients?.cuit;
    if (clientCuit && clientCuit.replace(/\D/g, '').length === 11) {
      docTipo = 80; // CUIT
      docNro = parseInt(clientCuit.replace(/\D/g, ''), 10);
      condicionIva = 1; // IVA Responsable Inscripto (Default para CUIT en pruebas)
    }
    
    // In Vercel, we need to extract certificates from env vars and write to /tmp
    // For local testing, we can use the env vars if present, otherwise fallback to local files if they exist
    const certPath = path.join('/tmp', 'afip_cert.crt');
    const keyPath = path.join('/tmp', 'afip_key.key');
    
    if (process.env.AFIP_CERT_PEM && process.env.AFIP_KEY_PEM) {
      fs.writeFileSync(certPath, process.env.AFIP_CERT_PEM.replace(/\\n/g, '\n'));
      fs.writeFileSync(keyPath, process.env.AFIP_KEY_PEM.replace(/\\n/g, '\n'));
    } else {
      // Fallback for local testing if env vars aren't set (assuming we are running from project root somehow)
      if (fs.existsSync('afip_certificado.crt')) {
        fs.copyFileSync('afip_certificado.crt', certPath);
        fs.copyFileSync('afip_privada.key', keyPath);
      } else {
         return res.status(500).json({ error: 'Faltan los certificados de AFIP en el entorno.' });
      }
    }

    // Init AFIP
    const afip = new Afip({
      CUIT: 23477380719,
      cert: certPath,
      key: keyPath,
      res_folder: '/tmp', // AFIP SDK writes tokens here
      production: false
    });

    const date = new Date(Date.now() - ((new Date()).getTimezoneOffset() * 60000)).toISOString().split('T')[0].replace(/-/g, '');

    const isCreditNote = req.body.isCreditNote === true;
    const associatedInvoice = req.body.associatedInvoice; // Required if isCreditNote

    const cbteTipo = isCreditNote ? 13 : 11; // 11 = Factura C, 13 = Nota de Crédito C
    const lastVoucher = await afip.ElectronicBilling.getLastVoucher(1, cbteTipo);

    const data = {
      'CantReg' 	: 1,  
      'PtoVta' 	: 1,  
      'CbteTipo' 	: cbteTipo,
      'Concepto' 	: 3,  
      'DocTipo' 	: docTipo, 
      'DocNro' 	: docNro,  
      'CbteDesde' 	: lastVoucher + 1,
      'CbteHasta' 	: lastVoucher + 1,
      'CbteFch' 	: parseInt(date),
      'ImpTotal' 	: amount, 
      'ImpTotConc' 	: 0,   
      'ImpNeto' 	: amount, 
      'ImpOpEx' 	: 0,   
      'ImpIVA' 	: 0,   
      'ImpTrib' 	: 0,   
      'FchServDesde' 	: parseInt(date),
      'FchServHasta' 	: parseInt(date),
      'FchVtoPago' 	: parseInt(date),
      'MonId' 	: 'PES', 
      'MonCotiz' 	: 1,
      'CondicionIVAReceptorId': condicionIva
    };

    if (isCreditNote && associatedInvoice) {
      data['CbtesAsoc'] = [
        {
          'Tipo' 		: 11, // Factura C original
          'PtoVta' 	: 1,
          'Nro' 		: associatedInvoice
        }
      ];
    }

    let result;
    try {
      result = await afip.ElectronicBilling.createVoucher(data);
    } catch (err) {
      // Si AFIP rechaza el CUIT porque no existe en los padrones de AFIP (código 10015)
      if (err.message && (err.message.includes('10015') || err.message.includes('padrones de AFIP')) && data.DocTipo === 80) {
        console.warn(`CUIT ${data.DocNro} no registrado en AFIP (10015). Reintentando automáticamente como Consumidor Final...`);
        data.DocTipo = 99;
        data.DocNro = 0;
        data.CondicionIVAReceptorId = 5;
        result = await afip.ElectronicBilling.createVoucher(data);
      } else {
        throw err;
      }
    }

    const voucherNumber = lastVoucher + 1;
    const cae = result.CAE;

    // 3. Guardar en base de datos atómicamente desde el backend
    const authSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });

    const { error: insertError } = await authSupabase.from('afip_vouchers').insert({
      work_order_id: orderId,
      voucher_type: isCreditNote ? 'credit_note' : 'invoice',
      voucher_number: voucherNumber,
      cae: cae.toString(),
      amount: amount
    });

    if (insertError) {
      console.error('Error guardando en afip_vouchers:', insertError);
      // Opcional: Podríamos intentar anular en AFIP, pero al menos informamos
      return res.status(500).json({ error: 'Factura generada en AFIP pero falló al guardar en historial: ' + insertError.message });
    }

    const updateData = isCreditNote 
      ? { payment_status: 'unbilled', total_amount: 0, afip_voucher_number: null, afip_cae: null }
      : { payment_status: 'pending', total_amount: amount, afip_voucher_number: voucherNumber.toString(), afip_cae: cae.toString() };

    const { error: updateError } = await authSupabase.from('work_orders').update(updateData).eq('id', orderId);
    if (updateError) {
      console.error('Error actualizando work_order:', updateError);
    }

    res.status(200).json({
      success: true,
      voucher: {
        number: voucherNumber,
        cae: cae,
        cae_expiration: result.CAEFchVto
      }
    });

  } catch (error) {
    console.error('AFIP Error:', error);
    res.status(500).json({ error: error.message || 'Error interno al generar factura' });
  }
}
