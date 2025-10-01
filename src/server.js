const http = require('http');
const fs = require('fs');
const path = require('path');
const { prisma } = require('./db');
const { seedDatabase } = require('./seedDatabase');

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const ROOT_DIR = path.resolve(__dirname, '..');

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.statusCode = err.code === 'ENOENT' ? 404 : 500;
      res.end(res.statusCode === 404 ? 'Not found' : 'Internal server error');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8'
    }[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const { method } = req;
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (method === 'POST' && url.pathname === '/api/seed') {
    try {
      const result = await seedDatabase(prisma);
      sendJson(res, 200, {
        status: 'ok',
        customers: result.customersCreated,
        orders: result.ordersCreated
      });
    } catch (error) {
      console.error('Failed to seed database', error);
      sendJson(res, 500, { status: 'error', message: 'Impossible de générer les données.' });
    }
    return;
  }

  if (method === 'GET' && url.pathname === '/api/seed') {
    sendJson(res, 405, { status: 'error', message: 'Method Not Allowed' });
    return;
  }

  if (method === 'GET') {
    let filePath = path.join(ROOT_DIR, url.pathname);
    if (url.pathname === '/' || url.pathname === '') {
      filePath = path.join(ROOT_DIR, 'index.html');
    }
    sendFile(res, filePath);
    return;
  }

  res.statusCode = 404;
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`Mini4GL demo server ready on http://localhost:${PORT}`);
});

