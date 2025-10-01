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

