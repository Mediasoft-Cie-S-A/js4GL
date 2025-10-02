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
  },
  {
    name: 'Paris Cyclisme',
    city: 'Paris',
    country: 'France',
    phone: '+33 1 53 02 45 87'
  },
  {
    name: 'Méditerranée Plongée',
    city: 'Marseille',
    country: 'France',
    phone: '+33 4 91 12 67 50'
  },
  {
    name: 'Nordic Ski Shop',
    city: 'Chambéry',
    country: 'France',
    phone: '+33 4 79 22 45 18'
  },
  {
    name: 'Languedoc Rando',
    city: 'Montpellier',
    country: 'France',
    phone: '+33 4 67 45 67 10'
  },
  {
    name: 'Provence Escalade',
    city: 'Avignon',
    country: 'France',
    phone: '+33 4 90 12 78 45'
  },
  {
    name: 'Bordeaux Golf Club',
    city: 'Bordeaux',
    country: 'France',
    phone: '+33 5 56 47 89 12'
  },
  {
    name: 'Nice Fitness',
    city: 'Nice',
    country: 'France',
    phone: '+33 4 93 27 54 01'
  },
  {
    name: 'Toulouse Kayak',
    city: 'Toulouse',
    country: 'France',
    phone: '+33 5 61 45 12 99'
  },
  {
    name: 'Strasbourg Hockey',
    city: 'Strasbourg',
    country: 'France',
    phone: '+33 3 88 45 78 33'
  },
  {
    name: 'Marseille Vélo',
    city: 'Marseille',
    country: 'France',
    phone: '+33 4 91 30 22 11'
  },
  {
    name: 'Lille Running',
    city: 'Lille',
    country: 'France',
    phone: '+33 3 20 12 57 84'
  },
  {
    name: 'Corsica Aventure',
    city: 'Ajaccio',
    country: 'France',
    phone: '+33 4 95 20 31 55'
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
  },
  {
    name: 'Julien Caradec',
    region: 'Nouvelle-Aquitaine'
  },
  {
    name: 'Laura Chen',
    region: 'Occitanie'
  },
  {
    name: 'Amine Haddad',
    region: 'Provence-Alpes-Côte d’Azur'
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
  },
  {
    name: 'Vélo route AeroSonic 500',
    category: 'Cyclisme',
    price: 2399.0
  },
  {
    name: 'Casque VTT PeakGuard',
    category: 'Cyclisme',
    price: 89.9
  },
  {
    name: 'Sac à dos Trek Explorer 45L',
    category: 'Randonnée',
    price: 159.0
  },
  {
    name: 'Tente Alpinist 2P',
    category: 'Camping',
    price: 499.0
  },
  {
    name: 'Planche de snowboard Glacier Edge',
    category: 'Sports d’hiver',
    price: 399.0
  },
  {
    name: 'Ski nordique Borealis',
    category: 'Ski',
    price: 299.0
  },
  {
    name: 'Chaussures de ski Borealis Pro',
    category: 'Ski',
    price: 249.0
  },
  {
    name: 'Gants de gardien UltraGrip',
    category: 'Football',
    price: 64.0
  },
  {
    name: 'Ballon de football ElitePro',
    category: 'Football',
    price: 55.0
  },
  {
    name: 'Palmes BlueReef',
    category: 'Plongée',
    price: 74.5
  },
  {
    name: 'Combinaison de plongée Abyss 5mm',
    category: 'Plongée',
    price: 329.0
  },
  {
    name: 'Montre GPS TrailMaster',
    category: 'Accessoires',
    price: 219.0
  },
  {
    name: 'Rack d’haltères PowerStack',
    category: 'Fitness',
    price: 799.0
  },
  {
    name: 'Stand-up paddle Lago 11',
    category: 'Nautisme',
    price: 899.0
  },
  {
    name: 'Gants d’escalade GripMax',
    category: 'Escalade',
    price: 32.0
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
      { item: 'Combinaison de surf Atlantik 4/3', quantity: 4, price: 249.0 },
      { item: 'Stand-up paddle Lago 11', quantity: 2, price: 899.0 }
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
  },
  {
    orderDate: new Date('2024-05-28T00:00:00Z'),
    customer: 'Paris Cyclisme',
    salesman: 'Isabelle Laurent',
    lines: [
      { item: 'Vélo route AeroSonic 500', quantity: 3, price: 2299.0 },
      { item: 'Casque VTT PeakGuard', quantity: 5, price: 85.0 }
    ]
  },
  {
    orderDate: new Date('2024-06-02T00:00:00Z'),
    customer: 'Méditerranée Plongée',
    salesman: 'Sofia Martins',
    lines: [
      { item: 'Combinaison de plongée Abyss 5mm', quantity: 6, price: 319.0 },
      { item: 'Palmes BlueReef', quantity: 10, price: 69.9 }
    ]
  },
  {
    orderDate: new Date('2024-06-08T00:00:00Z'),
    customer: 'Nordic Ski Shop',
    salesman: 'Julien Caradec',
    lines: [
      { item: 'Ski nordique Borealis', quantity: 8, price: 289.0 },
      { item: 'Chaussures de ski Borealis Pro', quantity: 8, price: 239.0 },
      { item: 'Planche de snowboard Glacier Edge', quantity: 4, price: 379.0 }
    ]
  },
  {
    orderDate: new Date('2024-06-14T00:00:00Z'),
    customer: 'Languedoc Rando',
    salesman: 'Laura Chen',
    lines: [
      { item: 'Sac à dos Trek Explorer 45L', quantity: 12, price: 149.0 },
      { item: 'Tente Alpinist 2P', quantity: 4, price: 479.0 },
      { item: 'Montre GPS TrailMaster', quantity: 6, price: 209.0 }
    ]
  },
  {
    orderDate: new Date('2024-06-20T00:00:00Z'),
    customer: 'Provence Escalade',
    salesman: 'Amine Haddad',
    lines: [
      { item: 'Gants d’escalade GripMax', quantity: 30, price: 29.5 },
      { item: 'Sac à dos Trek Explorer 45L', quantity: 5, price: 155.0 }
    ]
  },
  {
    orderDate: new Date('2024-06-27T00:00:00Z'),
    customer: 'Bordeaux Golf Club',
    salesman: 'Marc Dubois',
    lines: [
      { item: 'Rack d’haltères PowerStack', quantity: 2, price: 749.0 },
      { item: 'Montre GPS TrailMaster', quantity: 3, price: 215.0 }
    ]
  },
  {
    orderDate: new Date('2024-07-03T00:00:00Z'),
    customer: 'Nice Fitness',
    salesman: 'Amine Haddad',
    lines: [
      { item: 'Rack d’haltères PowerStack', quantity: 3, price: 779.0 },
      { item: 'Ballon de basket StreetMaster', quantity: 20, price: 35.0 }
    ]
  },
  {
    orderDate: new Date('2024-07-09T00:00:00Z'),
    customer: 'Toulouse Kayak',
    salesman: 'Laura Chen',
    lines: [
      { item: 'Stand-up paddle Lago 11', quantity: 4, price: 869.0 },
      { item: 'Sac à dos Trek Explorer 45L', quantity: 6, price: 152.0 }
    ]
  },
  {
    orderDate: new Date('2024-07-18T00:00:00Z'),
    customer: 'Strasbourg Hockey',
    salesman: 'Isabelle Laurent',
    lines: [
      { item: 'Gants de gardien UltraGrip', quantity: 15, price: 60.0 },
      { item: 'Ballon de football ElitePro', quantity: 12, price: 49.5 }
    ]
  },
  {
    orderDate: new Date('2024-07-24T00:00:00Z'),
    customer: 'Lille Running',
    salesman: 'Julien Caradec',
    lines: [
      { item: 'Chaussures de trail Alpina X', quantity: 12, price: 119.0 },
      { item: 'Montre GPS TrailMaster', quantity: 8, price: 205.0 }
    ]
  },
  {
    orderDate: new Date('2024-07-30T00:00:00Z'),
    customer: 'Corsica Aventure',
    salesman: 'Sofia Martins',
    lines: [
      { item: 'Tente Alpinist 2P', quantity: 3, price: 489.0 },
      { item: 'Stand-up paddle Lago 11', quantity: 1, price: 879.0 },
      { item: 'Sac à dos Trek Explorer 45L', quantity: 4, price: 150.0 }
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

async function ensureDatabaseSchema(existingClient) {
  const prisma = existingClient ?? new PrismaClient();
  const shouldDisconnect = !existingClient;

  try {
    const requiredTables = ['customer', 'salesman', 'item', 'order', 'orderline'];
    const placeholders = requiredTables.map(() => '?').join(', ');
    const existingTables = await prisma.$queryRawUnsafe(
      `SELECT name FROM sqlite_master WHERE type='table' AND name IN (${placeholders})`,
      ...requiredTables
    );

    const missingTables = requiredTables.filter(
      (tableName) => !existingTables.some((row) => row.name === tableName)
    );

    if (missingTables.length > 0) {
      await applySport2000Schema(prisma);
    }
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
