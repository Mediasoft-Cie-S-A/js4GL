const express = require('express');
const path = require('path');
const { prisma } = require('./db');
const { seedDatabase } = require('./seedDatabase');

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const ROOT_DIR = path.resolve(__dirname, '..');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(ROOT_DIR, 'views'));

app.get('/mini4GL.js', (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'mini4GL.js'));
});

app.post('/api/seed', async (req, res) => {
  try {
    const result = await seedDatabase(prisma);
    res.json({
      status: 'ok',
      customers: result.customersCreated,
      orders: result.ordersCreated
    });
  } catch (error) {
    console.error('Failed to seed database', error);
    res.status(500).json({ status: 'error', message: 'Impossible de générer les données.' });
  }
});

app.get('/api/seed', (req, res) => {
  res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
});

app.get('/', (req, res) => {
  res.render('index');
});

app.use((req, res) => {
  res.status(404).send('Not found');
});

app.listen(PORT, () => {
  console.log(`Mini4GL demo server ready on http://localhost:${PORT}`);
});

