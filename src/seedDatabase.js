const { PrismaClient } = require('@prisma/client');

const customerSeedData = [
  {
    name: 'Sportif Plus',
    city: 'Lyon',
    country: 'France',
    phone: '+33 4 72 00 11 22'
  },
  {
    name: 'Alpes Outdoor',
    city: 'Grenoble',
    country: 'France',
    phone: '+33 4 76 42 58 90'
  },
  {
    name: 'Bretagne Nautique',
    city: 'Brest',
    country: 'France',
    phone: '+33 2 98 56 12 34'
  }
];

const salesmanSeedData = [
  {
    name: 'Isabelle Laurent',
    region: 'Auvergne-Rhône-Alpes'
  },
  {
    name: 'Marc Dubois',
    region: 'Île-de-France'
  },
  {
    name: 'Sofia Martins',
    region: 'Bretagne'
  }
];

const itemSeedData = [
  {
    name: 'Raquette de tennis ProStrike',
    category: 'Tennis',
    price: 179.99
  },
  {
    name: 'Ballon de basket StreetMaster',
    category: 'Basketball',
    price: 39.5
  },
  {
    name: 'Chaussures de trail Alpina X',
    category: 'Running',
    price: 129.0
  },
  {
    name: 'Combinaison de surf Atlantik 4/3',
    category: 'Surf',
    price: 249.0
  },
  {
    name: 'Grip Performance',
    category: 'Accessoires',
    price: 8.5
  }
];

const orderSeedData = [
  {
    orderDate: new Date('2024-04-12T00:00:00Z'),
    customer: 'Sportif Plus',
    salesman: 'Isabelle Laurent',
    lines: [
      { item: 'Raquette de tennis ProStrike', quantity: 2, price: 179.99 },
      { item: 'Grip Performance', quantity: 6, price: 8.5 }
    ]
  },
  {
    orderDate: new Date('2024-04-18T00:00:00Z'),
    customer: 'Alpes Outdoor',
    salesman: 'Marc Dubois',
    lines: [
      { item: 'Chaussures de trail Alpina X', quantity: 5, price: 129.0 },
      { item: 'Ballon de basket StreetMaster', quantity: 3, price: 39.5 }
    ]
  },
  {
    orderDate: new Date('2024-05-03T00:00:00Z'),
    customer: 'Bretagne Nautique',
    salesman: 'Sofia Martins',
    lines: [
      { item: 'Combinaison de surf Atlantik 4/3', quantity: 4, price: 249.0 }
    ]
  },
  {
    orderDate: new Date('2024-05-22T00:00:00Z'),
    customer: 'Sportif Plus',
    salesman: 'Marc Dubois',
    lines: [
      { item: 'Ballon de basket StreetMaster', quantity: 10, price: 37.0 },
      { item: 'Grip Performance', quantity: 12, price: 7.9 }
    ]
  }
];

async function resetDatabase(prisma) {
  await prisma.$executeRawUnsafe('PRAGMA foreign_keys = OFF;');
  const tablesToDrop = [
    'orderline',
    'order',
    'item',
    'salesman',
    'customer',
    'OrderLine',
    'Order',
    'Item',
    'Salesman',
    'Customer'
  ];

  for (const table of tablesToDrop) {
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${table}";`);
  }

  await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON;');
}

async function applySport2000Schema(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE "customer" (
      "customerId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "name" TEXT NOT NULL,
      "city" TEXT,
      "country" TEXT,
      "phone" TEXT
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE "salesman" (
      "salesmanId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "name" TEXT NOT NULL,
      "region" TEXT
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE "item" (
      "itemId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "name" TEXT NOT NULL,
      "category" TEXT,
      "price" REAL NOT NULL
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE "order" (
      "orderId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "orderDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "customerId" INTEGER NOT NULL,
      "salesmanId" INTEGER,
      CONSTRAINT "order_customerId_fkey"
        FOREIGN KEY ("customerId")
        REFERENCES "customer"("customerId")
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
      CONSTRAINT "order_salesmanId_fkey"
        FOREIGN KEY ("salesmanId")
        REFERENCES "salesman"("salesmanId")
        ON DELETE SET NULL
        ON UPDATE CASCADE
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE "orderline" (
      "orderLineId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "orderId" INTEGER NOT NULL,
      "itemId" INTEGER NOT NULL,
      "quantity" INTEGER NOT NULL,
      "price" REAL NOT NULL,
      CONSTRAINT "orderline_orderId_fkey"
        FOREIGN KEY ("orderId")
        REFERENCES "order"("orderId")
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
      CONSTRAINT "orderline_itemId_fkey"
        FOREIGN KEY ("itemId")
        REFERENCES "item"("itemId")
        ON DELETE RESTRICT
        ON UPDATE CASCADE
    );
  `);

  await prisma.$executeRawUnsafe('CREATE INDEX "order_customerId_idx" ON "order"("customerId");');
  await prisma.$executeRawUnsafe('CREATE INDEX "order_salesmanId_idx" ON "order"("salesmanId");');
  await prisma.$executeRawUnsafe('CREATE INDEX "orderline_orderId_idx" ON "orderline"("orderId");');
  await prisma.$executeRawUnsafe('CREATE INDEX "orderline_itemId_idx" ON "orderline"("itemId");');
}

function getOrThrow(map, key, type) {
  const value = map.get(key);
  if (!value) {
    throw new Error(`Impossible de trouver ${type} « ${key} » dans les données de référence.`);
  }
  return value;
}

async function seedDatabase(existingClient) {
  const prisma = existingClient ?? new PrismaClient();
  const shouldDisconnect = !existingClient;

  try {
    await resetDatabase(prisma);
    await applySport2000Schema(prisma);

    const createdCustomers = await Promise.all(
      customerSeedData.map((customer) => prisma.customer.create({ data: customer }))
    );
    const createdSalesmen = await Promise.all(
      salesmanSeedData.map((salesman) => prisma.salesman.create({ data: salesman }))
    );
    const createdItems = await Promise.all(
      itemSeedData.map((item) => prisma.item.create({ data: item }))
    );

    const customerMap = new Map(createdCustomers.map((customer) => [customer.name, customer]));
    const salesmanMap = new Map(createdSalesmen.map((salesman) => [salesman.name, salesman]));
    const itemMap = new Map(createdItems.map((item) => [item.name, item]));

    let ordersCreated = 0;
    let orderLinesCreated = 0;

    for (const order of orderSeedData) {
      const createdOrder = await prisma.order.create({
        data: {
          orderDate: order.orderDate,
          customer: {
            connect: { customerId: getOrThrow(customerMap, order.customer, 'le client').customerId }
          },
          salesman: order.salesman
            ? {
                connect: {
                  salesmanId: getOrThrow(salesmanMap, order.salesman, 'le commercial').salesmanId
                }
              }
            : undefined,
          lines: {
            create: order.lines.map((line) => ({
              quantity: line.quantity,
              price: line.price,
              item: {
                connect: { itemId: getOrThrow(itemMap, line.item, "l'article").itemId }
              }
            }))
          }
        },
        include: { lines: true }
      });

      ordersCreated += 1;
      orderLinesCreated += createdOrder.lines.length;
    }

    return {
      customersCreated: createdCustomers.length,
      salesmenCreated: createdSalesmen.length,
      itemsCreated: createdItems.length,
      ordersCreated,
      orderLinesCreated
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
