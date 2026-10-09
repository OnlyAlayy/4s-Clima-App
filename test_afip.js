const Afip = require('@afipsdk/afip.js');
const fs = require('fs');

async function test() {
  try {
    console.log('Iniciando test...');
    const afip = new Afip({
      CUIT: 23477380719,
      cert: 'afip_certificado.crt',
      key: 'afip_privada.key',
      res_folder: __dirname,
      production: false
    });

    console.log('Obteniendo último comprobante...');
    const lastVoucher = await afip.ElectronicBilling.getLastVoucher(1, 11);
    console.log('Último comprobante:', lastVoucher);
  } catch (error) {
    console.error('Error detallado:', error);
  }
}
test();
