import fs from 'fs';
import path from 'path';
import Afip from '@afipsdk/afip.js';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // CORS configuration segura con lista blanca
  const origin = req.headers.origin;
  const allowedOrigins = [
    'http://localhost:5174',
    'http://127.0.0.1:5174',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()) : [])
  ];

  const isAllowedOrigin = origin && (
    allowedOrigins.includes(origin) ||
    /^https:\/\/[a-zA-Z0-9_-]+\.vercel\.app$/.test(origin)
  );

  if (isAllowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

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

    // 2. Procesar solicitud de comprobante fiscal AFIP (Soporte Factura A y Factura C)
    const orderId = req.body.orderId;
    if (!orderId) {
      return res.status(400).json({ error: 'Falta orderId' });
    }

    const roundCurrency = (val) => Math.round((Number(val) + Number.EPSILON) * 100) / 100;
    const rawAmount = req.body.netAmount !== undefined ? req.body.netAmount : req.body.amount;
    const impNeto = roundCurrency(rawAmount || 0);
    if (isNaN(impNeto) || impNeto <= 0) {
      return res.status(400).json({ error: 'Monto neto a facturar inválido (debe ser mayor a 0).' });
    }

    const isCreditNote = req.body.isCreditNote === true;
    const associatedInvoice = req.body.associatedInvoice; // Required if isCreditNote
    const voucherLetter = (req.body.voucherLetter || req.body.voucher_letter || 'A').toUpperCase();
    const isTypeC = voucherLetter === 'C';

    const impIVA = isTypeC ? 0 : roundCurrency(impNeto * 0.21);
    const impTotal = isTypeC ? impNeto : roundCurrency(impNeto + impIVA);

    // 2.5 Fetch Client & Order Data from DB (Idempotencia y validación fiscal)
    const { data: orderData, error: orderError } = await supabase
      .from('work_orders')
      .select('client_id, observations, afip_cae, afip_voucher_number, clients(cuit, name)')
      .eq('id', orderId)
      .single();
      
    if (orderError || !orderData) {
      return res.status(404).json({ error: 'Orden de trabajo no encontrada' });
    }

    // Prevención de Doble Facturación (Idempotencia)
    if (orderData.afip_cae && !isCreditNote) {
      return res.status(409).json({ 
        error: `Esta orden ya cuenta con un comprobante AFIP emitido (Comprobante: ${orderData.afip_voucher_number || 'A-00001-N/D'}, CAE: ${orderData.afip_cae}). Operación cancelada para evitar duplicación fiscal.` 
      });
    }
    
    // Validación fiscal: Factura A exige CUIT 11 dígitos; Factura C permite CUIT o Consumidor Final
    const clientCuit = (orderData.clients?.cuit || '').replace(/\D/g, '');
    let docTipo = 80; // CUIT por defecto
    let docNro = 0;
    let condicionIva = 1; // 1 = IVA Responsable Inscripto (RG 5616)

    if (clientCuit && clientCuit.length === 11) {
      docTipo = 80;
      docNro = parseInt(clientCuit, 10);
      condicionIva = isTypeC ? 4 : 1; // 4 = IVA Sujeto Exento/Monotributo, 1 = IVA Responsable Inscripto
    } else {
      if (!isTypeC) {
        return res.status(400).json({ 
          error: 'Para emitir Factura A, el cliente debe poseer un CUIT válido de 11 dígitos registrado.' 
        });
      }
      docTipo = 99; // Consumidor Final
      docNro = 0;
      condicionIva = 5;
    }
    
    // In Vercel, we need to extract certificates from env vars and write to /tmp
    // For local testing, we can use the env vars if present, otherwise fallback to local files if they exist
    const certPath = path.join('/tmp', 'afip_cert.crt');
    const keyPath = path.join('/tmp', 'afip_key.key');
    
    if (process.env.AFIP_CERT_PEM && process.env.AFIP_KEY_PEM) {
      fs.writeFileSync(certPath, process.env.AFIP_CERT_PEM.replace(/\\n/g, '\n'));
      fs.writeFileSync(keyPath, process.env.AFIP_KEY_PEM.replace(/\\n/g, '\n'));
    } else {
      // Fallback for local testing if env vars aren't set
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

    const ptoVta = parseInt(process.env.AFIP_PTO_VTA || '1', 10);
    // Tipos de comprobante en AFIP:
    // Factura A: 1, Nota de Crédito A: 3
    // Factura C: 11, Nota de Crédito C: 13
    const cbteTipo = isTypeC 
      ? (isCreditNote ? 13 : 11) 
      : (isCreditNote ? 3 : 1);
    const lastVoucher = await afip.ElectronicBilling.getLastVoucher(ptoVta, cbteTipo);
    const voucherNumber = lastVoucher + 1;
    const formattedVoucherNumber = `${voucherLetter}-${String(ptoVta).padStart(5, '0')}-${String(voucherNumber).padStart(8, '0')}`;

    const data = {
      'CantReg' 	: 1,  
      'PtoVta' 	: ptoVta,  
      'CbteTipo' 	: cbteTipo,
      'Concepto' 	: 3, // Productos y Servicios
      'DocTipo' 	: docTipo, 
      'DocNro' 	: docNro,  
      'CbteDesde' 	: voucherNumber,
      'CbteHasta' 	: voucherNumber,
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
    };

    if (!isTypeC) {
      data['Iva'] = [
        {
          'Id': 5, // 21% en AFIP/ARCA
          'BaseImp': impNeto,
          'Importe': impIVA
        }
      ];
    }

    if (isCreditNote && associatedInvoice) {
      data['CbtesAsoc'] = [
        {
          'Tipo' 	: isTypeC ? 11 : 1,
          'PtoVta' 	: ptoVta,
          'Nro' 	: associatedInvoice
        }
      ];
    }

    const result = await afip.ElectronicBilling.createVoucher(data);
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
      amount: impTotal
    });

    if (insertError) {
      console.error('Error guardando en afip_vouchers:', insertError);
      return res.status(500).json({ error: 'Factura generada en AFIP pero falló al guardar en historial: ' + insertError.message });
    }

    const customObs = req.body.observations;
    const finalObservations = customObs !== undefined
      ? customObs
      : orderData.observations;

    const updateData = isCreditNote 
      ? { payment_status: 'unbilled', total_amount: 0, afip_voucher_number: null, afip_cae: null }
      : { 
          payment_status: 'pending', 
          total_amount: impTotal, 
          afip_voucher_number: formattedVoucherNumber, 
          afip_cae: cae.toString(),
          observations: finalObservations
        };

    const { error: updateError } = await authSupabase.from('work_orders').update(updateData).eq('id', orderId);
    if (updateError) {
      console.error('Error actualizando work_order:', updateError);
    }

    res.status(200).json({
      success: true,
      voucher: {
        number: voucherNumber,
        formatted_number: formattedVoucherNumber,
        cae: cae,
        cae_expiration: result.CAEFchVto,
        net_amount: impNeto,
        iva_amount: impIVA,
        total_amount: impTotal
      }
    });

  } catch (error) {
    console.error('AFIP Error:', error);
    const clientMessage = error.message?.includes('/tmp') || error.message?.includes('PEM') || error.message?.includes('ENOENT')
      ? 'Error de comunicación o certificados con los servidores de AFIP/ARCA.'
      : (error.message || 'Error interno al procesar comprobante fiscal');
    res.status(500).json({ error: clientMessage });
  }
}
