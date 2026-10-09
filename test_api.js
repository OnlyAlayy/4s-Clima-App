const express = require('express');
const bodyParser = require('body-parser');


const app = express();
app.use(bodyParser.json());

// Mocking Vercel's req/res for the handler
app.all('/api/invoice', async (req, res) => {
  // To simulate the Vercel env
  const module = await import('./apps/admin/api/invoice.js');
  await module.default(req, res);
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Local Vercel API Simulator running on http://localhost:${PORT}`);
  console.log('You can now test the Facturar button in the frontend (the Vite proxy will route it here)');
});
