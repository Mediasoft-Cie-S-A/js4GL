const { PrismaClient } = require('@prisma/client');
const { ensureDatabaseSchema } = require('./seedDatabase');

let prismaInstance = null;
let schemaInitializationPromise = null;

function getPrismaClient() {
  if (!prismaInstance) {
    prismaInstance = new PrismaClient();
  }
  return prismaInstance;
}

function ensurePrismaReady() {
  if (!schemaInitializationPromise) {
    const client = getPrismaClient();
    schemaInitializationPromise = ensureDatabaseSchema(client).catch((error) => {
      schemaInitializationPromise = null;
      throw error;
    });
  }
  return schemaInitializationPromise;
}

module.exports = {
  prisma: getPrismaClient(),
  ensurePrismaReady
};
