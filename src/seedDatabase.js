const { PrismaClient } = require('@prisma/client');

const customerSeedData = [
  {
    custNum: 1001,
    name: 'Acme Industries',
    contact: 'Evelyn Harper',
    phone: '603-555-0101',
    address: '12 Industrial Way',
    city: 'Concord',
    state: 'NH',
    postalCode: '03301',
    balance: 1250.75,
    creditLimit: 5000,
    orders: [
      {
        orderNum: 5001,
        total: 620.5,
        status: 'PROCESSING',
        orderDate: new Date('2024-03-02T00:00:00Z'),
        shipDate: new Date('2024-03-05T00:00:00Z')
      },
      {
        orderNum: 5002,
        total: 310.0,
        status: 'PENDING',
        orderDate: new Date('2024-03-18T00:00:00Z'),
        shipDate: null
      }
    ]
  },
  {
    custNum: 1005,
    name: 'Granite Outfitters',
    contact: 'Liam Chen',
    phone: '603-555-0142',
    address: '88 Summit Ave',
    city: 'Littleton',
    state: 'NH',
    postalCode: '03561',
    balance: 980.4,
    creditLimit: 4200,
    orders: [
      {
        orderNum: 5003,
        total: 1540.25,
        status: 'SHIPPED',
        orderDate: new Date('2024-04-05T00:00:00Z'),
        shipDate: new Date('2024-04-10T00:00:00Z')
      },
      {
        orderNum: 5004,
        total: 275.0,
        status: 'BACKORDER',
        orderDate: new Date('2024-04-21T00:00:00Z'),
        shipDate: null
      }
    ]
  },
  {
    custNum: 1010,
    name: 'Lakeside Crafts',
    contact: 'Nora Patel',
    phone: '603-555-0175',
    address: '5 Shoreline Rd',
    city: 'Laconia',
    state: 'NH',
    postalCode: '03246',
    balance: 430.2,
    creditLimit: 3100,
    orders: [
      {
        orderNum: 5005,
        total: 865.5,
        status: 'PROCESSING',
        orderDate: new Date('2024-05-02T00:00:00Z'),
        shipDate: new Date('2024-05-07T00:00:00Z')
      },
      {
        orderNum: 5006,
        total: 142.75,
        status: 'PENDING',
        orderDate: new Date('2024-05-19T00:00:00Z'),
        shipDate: null
      }
    ]
  }
];
async function ensureDatabaseSchema(prisma) {
  const existingTables = await prisma.$queryRaw`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('Customer', 'Order')`;
  const tableSet = new Set(existingTables.map((table) => table.name));

  if (!tableSet.has('Customer')) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "Customer" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "custNum" INTEGER NOT NULL,
        "name" TEXT NOT NULL,
        "contact" TEXT,
        "phone" TEXT,
        "address" TEXT,
        "city" TEXT NOT NULL,
        "state" TEXT NOT NULL DEFAULT 'NH',
        "postalCode" TEXT,
        "balance" REAL NOT NULL,
        "creditLimit" REAL NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await prisma.$executeRawUnsafe(
      'CREATE UNIQUE INDEX IF NOT EXISTS "Customer_custNum_key" ON "Customer"("custNum");'
    );
  }

  if (!tableSet.has('Order')) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "Order" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "orderNum" INTEGER NOT NULL,
        "total" REAL NOT NULL,
        "status" TEXT NOT NULL,
        "orderDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "shipDate" DATETIME,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "customerId" INTEGER NOT NULL,
        CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE
      );
    `);
    await prisma.$executeRawUnsafe(
      'CREATE UNIQUE INDEX IF NOT EXISTS "Order_orderNum_key" ON "Order"("orderNum");'
    );
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

    await prisma.$transaction([
      prisma.order.deleteMany(),
      prisma.customer.deleteMany()
    ]);

    const createdCustomers = [];

    for (const customer of customerSeedData) {
      const created = await prisma.customer.create({
        data: {
          custNum: customer.custNum,
          name: customer.name,
          contact: customer.contact,
          phone: customer.phone,
          address: customer.address,
          city: customer.city,
          state: customer.state,
          postalCode: customer.postalCode,
          balance: customer.balance,
          creditLimit: customer.creditLimit,
          orders: {
            create: customer.orders.map((order) => ({
              orderNum: order.orderNum,
              total: order.total,
              status: order.status,
              orderDate: order.orderDate,
              shipDate: order.shipDate
            }))
          }
        },
        include: { orders: true }
      });

      createdCustomers.push(created);
    }


    const ordersCreated = createdCustomers.reduce(
      (sum, customer) => sum + (customer.orders?.length || 0),
      0
    );

    return {
      customersCreated: createdCustomers.length,
      ordersCreated,
      customers: createdCustomers
    };
  } finally {
    if (shouldDisconnect) {
      await prisma.$disconnect();
    }
  }
}

module.exports = {
  seedDatabase,
  ensureDatabaseSchema
};

