const express = require('express');
const path = require('path');
const { interpret4GL } = require('../mini4GL.js');
const { prisma, ensurePrismaReady } = require('./db');
const { seedDatabase } = require('./seedDatabase');

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const ROOT_DIR = path.resolve(__dirname, '..');
const HTML_ENTRY = path.join(ROOT_DIR, 'index.html');

const app = express();

app.use(express.json({ limit: '256kb' }));

app.get('/mini4GL.js', (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'mini4GL.js'));
});

app.post('/api/run', async (req, res) => {
  const { source, inputs } = req.body || {};
  if (typeof source !== 'string' || !source.trim()) {
    return res
      .status(400)
      .json({ status: 'error', message: 'Aucun programme 4GL fourni.' });
  }

  const sanitizedInputs = Array.isArray(inputs) ? inputs.slice(0, 64) : [];

  try {
    const prismaReadyPromise = ensurePrismaReady();
    await prismaReadyPromise;
    const result = await interpret4GL(source, {
      prisma,
      inputs: sanitizedInputs,
      prismaReady: prismaReadyPromise
    });
    res.json({ status: 'ok', output: result.output });
  } catch (error) {
    console.error('Execution error', error);
    const message =
      (typeof error?.message === 'string' && error.message.trim()) ||
      "Erreur lors de l'exécution du programme.";
    res.status(400).json({ status: 'error', message });
  }
});

app.post('/api/seed', async (req, res) => {
  try {
    const result = await seedDatabase(prisma);
    res.json({
      status: 'ok',
      customers: result.customersCreated,
      salesmen: result.salesmenCreated,
      items: result.itemsCreated,
      orders: result.ordersCreated,
      orderLines: result.orderLinesCreated
    });
  } catch (error) {
    console.error('Failed to seed database', error);
    res.status(500).json({ status: 'error', message: 'Impossible de générer les données.' });
  }
});

app.get('/api/seed', (req, res) => {
  res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
});

app.all('/api/run', (req, res) => {
  res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
});

app.get(['/','/index.html'], (req, res) => {
  res.sendFile(HTML_ENTRY);
});

app.use((req, res) => {
  res.status(404).send('Not found');
});

app.listen(PORT, () => {
  console.log(`Mini4GL demo server ready on http://localhost:${PORT}`);
});

