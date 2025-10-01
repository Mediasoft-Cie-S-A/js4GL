const { PrismaClient } = require('@prisma/client');

async function ensureDatabaseSchema(prisma) {
  const existingTables = await prisma.$queryRaw`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('Customer', 'Order')`;
  const tableSet = new Set(existingTables.map((table) => table.name));

  if (!tableSet.has('Customer')) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "Customer" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "name" TEXT NOT NULL,
        "email" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await prisma.$executeRawUnsafe(
      'CREATE UNIQUE INDEX IF NOT EXISTS "Customer_email_key" ON "Customer"("email");'
    );
  }

  if (!tableSet.has('Order')) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "Order" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "total" REAL NOT NULL,
        "status" TEXT NOT NULL,
        "placedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "customerId" INTEGER NOT NULL,
        CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE
      );
    `);
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "Order_customerId_idx" ON "Order"("customerId");'
    );
  }
}

async function seedDatabase(existingClient) {
  const prisma = existingClient ?? new PrismaClient();
  const shouldDisconnect = !existingClient;

  try {
    await ensureDatabaseSchema(prisma);
    await prisma.order.deleteMany();
    await prisma.customer.deleteMany();

    const customers = await Promise.all([
      prisma.customer.create({
        data: {
          name: 'Alice Martin',
          email: 'alice@example.com',
          orders: {
            create: [
              { total: 125.5, status: 'PROCESSING' },
              { total: 89.99, status: 'SHIPPED' }
            ]
          }
        },
        include: { orders: true }
      }),
      prisma.customer.create({
        data: {
          name: 'Bruno Keller',
          email: 'bruno@example.com',
          orders: {
            create: [{ total: 45.0, status: 'PENDING' }]
          }
        },
        include: { orders: true }
      }),
      prisma.customer.create({
        data: {
          name: 'Carla Dupont',
          email: 'carla@example.com'
        },
        include: { orders: true }
      })
    ]);

    const ordersCreated = customers.reduce(
      (sum, customer) => sum + (customer.orders?.length || 0),
      0
    );

    return {
      customersCreated: customers.length,
      ordersCreated,
      customers
    };
  } finally {
    if (shouldDisconnect) {
      await prisma.$disconnect();
    }
  }
}

module.exports = {
  seedDatabase
};

