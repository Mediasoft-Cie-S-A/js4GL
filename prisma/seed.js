const { PrismaClient } = require('@prisma/client');
const { seedDatabase } = require('../src/seedDatabase');

const prisma = new PrismaClient();

seedDatabase(prisma)
  .then(({ customersCreated, ordersCreated }) => {
    console.log(`Seeded ${customersCreated} customers and ${ordersCreated} orders.`);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
