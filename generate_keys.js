const forge = require('node-forge');
const fs = require('fs');

console.log('Generando nueva Clave Privada y Pedido de Certificado (CSR) para AFIP...');

// 1. Generate Key Pair
const keys = forge.pki.rsa.generateKeyPair(2048);
const privateKeyPem = forge.pki.privateKeyToPem(keys.privateKey);

// 2. Generate CSR
const csr = forge.pki.createCertificationRequest();
csr.publicKey = keys.publicKey;
csr.setSubject([
  { shortName: 'C', value: 'AR' },
  { shortName: 'O', value: '4S Clima' },
  { shortName: 'CN', value: 'PruebaFacturacion' },
  { type: '2.5.4.5', value: 'CUIT 23477380719' } // OID for serialNumber
]);
csr.sign(keys.privateKey, forge.md.sha256.create());
const csrPem = forge.pki.certificationRequestToPem(csr);

// 3. Save to files
fs.writeFileSync('afip_privada.key', privateKeyPem);
fs.writeFileSync('afip_pedido.csr', csrPem);

console.log('¡Listo!');
console.log('Archivos generados:');
console.log('1. afip_privada.key (¡ESTA ES TU CLAVE PRIVADA, NO LA PIERDAS!)');
console.log('2. afip_pedido.csr (Este es el que tenés que subir a la web de AFIP para que te den el certificado nuevo)');
