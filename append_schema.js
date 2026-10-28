const fs = require('fs');
const schemaPath = 'prisma/schema.prisma';

const orderModels = `
model Order {
  id                  String      @id @default(uuid())
  restaurantId        String
  tableId             String
  orderNumber         String      @unique
  status              String      @default("PENDING") // PENDING, ACCEPTED, PREPARING, READY, COMPLETED, CANCELLED
  subtotal            Decimal     @default(0.00)
  tax                 Decimal     @default(0.00)
  total               Decimal     @default(0.00)
  specialInstructions String?
  createdAt           DateTime    @default(now())
  updatedAt           DateTime    @updatedAt

  restaurant          Restaurant  @relation(fields: [restaurantId], references: [id], onDelete: Cascade)
  table               Table       @relation(fields: [tableId], references: [id], onDelete: Restrict)
  items               OrderItem[]

  @@index([restaurantId])
  @@index([tableId])
  @@index([status])
}

model OrderItem {
  id                  String   @id @default(uuid())
  orderId             String
  menuItemId          String
  name                String   
  price               Decimal  
  quantity            Int
  specialInstructions String?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  order               Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)
  menuItem            MenuItem @relation(fields: [menuItemId], references: [id], onDelete: Restrict)

  selectedVariant     OrderItemVariant?
  selectedAddons      OrderItemAddon[]

  @@index([orderId])
  @@index([menuItemId])
}

model OrderItemVariant {
  id          String   @id @default(uuid())
  orderItemId String   @unique
  variantId   String
  name        String   
  price       Decimal  

  orderItem   OrderItem       @relation(fields: [orderItemId], references: [id], onDelete: Cascade)
  variant     MenuItemVariant @relation(fields: [variantId], references: [id], onDelete: Restrict)
}

model OrderItemAddon {
  id          String   @id @default(uuid())
  orderItemId String
  addonId     String
  name        String   
  price       Decimal  

  orderItem   OrderItem     @relation(fields: [orderItemId], references: [id], onDelete: Cascade)
  addon       MenuItemAddon @relation(fields: [addonId], references: [id], onDelete: Restrict)

  @@index([orderItemId])
}
`;

let schema = fs.readFileSync(schemaPath, 'utf8');
if (!schema.includes('model Order {')) {
  fs.writeFileSync(schemaPath, schema + '\n' + orderModels);
  console.log("Appended Order models.");
} else {
  console.log("Order models already exist.");
}

// Add 'orders Order[]' to Restaurant and Table models
let updatedSchema = fs.readFileSync(schemaPath, 'utf8');

if (!updatedSchema.includes('orders         Order[]')) {
  updatedSchema = updatedSchema.replace(
    /tables         Table\[\]\n  qrCodes        QRCode\[\]/g, 
    'tables         Table[]\n  qrCodes        QRCode[]\n  orders         Order[]'
  );
  updatedSchema = updatedSchema.replace(
    /qrCodes      QRCode\[\]/g,
    'qrCodes      QRCode[]\n  orders       Order[]'
  );
  fs.writeFileSync(schemaPath, updatedSchema);
  console.log("Updated relationships.");
}
