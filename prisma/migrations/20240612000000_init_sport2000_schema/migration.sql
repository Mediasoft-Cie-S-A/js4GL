PRAGMA foreign_keys=OFF;
DROP TABLE IF EXISTS "orderline";
DROP TABLE IF EXISTS "order";
DROP TABLE IF EXISTS "item";
DROP TABLE IF EXISTS "salesman";
DROP TABLE IF EXISTS "customer";
DROP TABLE IF EXISTS "OrderLine";
DROP TABLE IF EXISTS "Order";
DROP TABLE IF EXISTS "Item";
DROP TABLE IF EXISTS "Salesman";
DROP TABLE IF EXISTS "Customer";
PRAGMA foreign_keys=ON;

CREATE TABLE "customer" (
    "customerId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "country" TEXT,
    "phone" TEXT
);

CREATE TABLE "salesman" (
    "salesmanId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "region" TEXT
);

CREATE TABLE "item" (
    "itemId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "price" REAL NOT NULL
);

CREATE TABLE "order" (
    "orderId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orderDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customerId" INTEGER NOT NULL,
    "salesmanId" INTEGER,
    CONSTRAINT "order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer"("customerId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "order_salesmanId_fkey" FOREIGN KEY ("salesmanId") REFERENCES "salesman"("salesmanId") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "orderline" (
    "orderLineId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orderId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" REAL NOT NULL,
    CONSTRAINT "orderline_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "order"("orderId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "orderline_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "item"("itemId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "order_customerId_idx" ON "order"("customerId");
CREATE INDEX "order_salesmanId_idx" ON "order"("salesmanId");
CREATE INDEX "orderline_orderId_idx" ON "orderline"("orderId");
CREATE INDEX "orderline_itemId_idx" ON "orderline"("itemId");
