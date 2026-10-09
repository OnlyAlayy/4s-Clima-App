const fs = require('fs');
const cert = fs.readFileSync('afip_certificado.crt', 'utf8').replace(/\r?\n/g, '\\n');
const key = fs.readFileSync('afip_privada.key', 'utf8').replace(/\r?\n/g, '\\n');
fs.writeFileSync('supabase/.env.secrets', `AFIP_CERT_PEM="${cert}"\nAFIP_KEY_PEM="${key}"\n`);
console.log('Secrets file written.');
