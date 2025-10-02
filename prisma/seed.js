const { PrismaClient } = require('@prisma/client');
const { seedDatabase } = require('../src/seedDatabase');

const prisma = new PrismaClient();

seedDatabase(prisma)
  .then(({ customersCreated, salesmenCreated, itemsCreated, ordersCreated, orderLinesCreated }) => {
    console.log(
      `Seeded ${customersCreated} customers, ${salesmenCreated} salesmen, ${itemsCreated} items, ${ordersCreated} orders and ${orderLinesCreated} order lines.`
    );
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
