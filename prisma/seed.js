const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
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
          create: [
            { total: 45.0, status: 'PENDING' }
          ]
        }
      },
      include: { orders: true }
    }),
    prisma.customer.create({
      data: {
        name: 'Carla Dupont',
        email: 'carla@example.com',
        orders: {
          create: []
        }
      }
    })
  ]);

  console.log(`Seeded ${customers.length} customers and ${customers.reduce((sum, c) => sum + (c.orders?.length || 0), 0)} orders.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
