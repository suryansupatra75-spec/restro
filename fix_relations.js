const fs = require('fs');
let s = fs.readFileSync('prisma/schema.prisma', 'utf8');

if (!s.includes('orderItems   OrderItem[]')) {
  s = s.replace(/addonLinks   MenuItemAddonLink\[\]/g, 'addonLinks   MenuItemAddonLink[]\n  orderItems   OrderItem[]');
}
if (!s.includes('orderItemVariants OrderItemVariant[]')) {
  s = s.replace(/menuItem     MenuItem @relation\(fields: \[menuItemId\], references: \[id\], onDelete: Cascade\)\n\n  @@index\(\[menuItemId\]\)/g, 'menuItem     MenuItem @relation(fields: [menuItemId], references: [id], onDelete: Cascade)\n  orderItemVariants OrderItemVariant[]\n\n  @@index([menuItemId])');
}
if (!s.includes('orderItemAddons OrderItemAddon[]')) {
  s = s.replace(/itemLinks    MenuItemAddonLink\[\]/g, 'itemLinks    MenuItemAddonLink[]\n  orderItemAddons OrderItemAddon[]');
}

fs.writeFileSync('prisma/schema.prisma', s);
console.log('Fixed relations.');
