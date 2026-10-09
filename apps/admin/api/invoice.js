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

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Token inválido o expirado. Acceso denegado.' });
    }

    // 2. Procesar solicitud de factura
    const amount = req.body.amount || 0;
    
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
      'DocTipo' 	: 99, 
      'DocNro' 	: 0,  
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
      'MonCotiz' 	: 1    
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

    const result = await afip.ElectronicBilling.createVoucher(data);

    res.status(200).json({
      success: true,
      voucher: {
        number: lastVoucher + 1,
        cae: result.CAE,
        cae_expiration: result.CAEFchVto
      }
    });

  } catch (error) {
    console.error('AFIP Error:', error);
    res.status(500).json({ error: error.message || 'Error interno al generar factura' });
  }
}
