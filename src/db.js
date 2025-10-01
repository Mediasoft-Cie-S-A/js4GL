const { PrismaClient } = require('@prisma/client');

let prismaInstance = null;

function getPrismaClient() {
  if (!prismaInstance) {
    prismaInstance = new PrismaClient();
  }
  return prismaInstance;
}

module.exports = {
  prisma: getPrismaClient()
};
