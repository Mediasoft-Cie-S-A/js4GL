const { PrismaClient } = require('@prisma/client');

async function seedDatabase(existingClient) {
  const prisma = existingClient ?? new PrismaClient();
  const shouldDisconnect = !existingClient;

  try {
    await prisma.order.deleteMany();
    await prisma.customer.deleteMany();

    const customers = await Promise.all([
      prisma.customer.create({
        data: {
          custNum: 'CUST-1001',
          name: 'Alice Martin',
          email: 'alice@example.com',
          city: 'Paris',
          state: 'IDF',
          balance: 125.5,
          creditLimit: 1000,
          orders: {
            create: [
              {
                orderNum: 'ORD-2001',
                orderDate: new Date('2023-01-15T10:30:00Z'),
                shipDate: new Date('2023-01-18T09:00:00Z'),
                total: 125.5,
                status: 'PROCESSING'
              },
              {
                orderNum: 'ORD-2002',
                orderDate: new Date('2023-02-02T14:00:00Z'),
                shipDate: new Date('2023-02-05T08:45:00Z'),
                total: 89.99,
                status: 'SHIPPED'
              }
            ]
          }
        },
        include: { orders: true }
      }),
      prisma.customer.create({
        data: {
          custNum: 'CUST-1002',
          name: 'Bruno Keller',
          email: 'bruno@example.com',
          city: 'Lyon',
          state: 'ARA',
          balance: 45,
          creditLimit: 750,
          orders: {
            create: [
              {
                orderNum: 'ORD-2003',
                orderDate: new Date('2023-03-10T11:15:00Z'),
                shipDate: null,
                total: 45.0,
                status: 'PENDING'
              }
            ]
          }
        },
        include: { orders: true }
      }),
      prisma.customer.create({
        data: {
          custNum: 'CUST-1003',
          name: 'Carla Dupont',
          email: 'carla@example.com',
          city: 'Marseille',
          state: 'PACA',
          balance: 0,
          creditLimit: 500
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

