const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  console.log('--- 1. Testing QR Menu Page ---');
  const token = '9c3fac487338425c';
  const menuRes = await fetch(`http://localhost:3000/q/${token}`);
  console.log('GET /q/' + token + ' -> status:', menuRes.status);
  if (menuRes.status !== 200) {
    throw new Error('Menu page did not return 200');
  }

  console.log('\n--- 2. Fetching an active menu item for this restaurant ---');
  const qr = await prisma.qRCode.findUnique({ where: { token } });
  const item = await prisma.menuItem.findFirst({
    where: { restaurantId: qr.restaurantId, status: 'ACTIVE', isAvailable: true },
    include: { variants: true, addonLinks: { include: { addon: true } } }
  });
  console.log('Selected item:', item.name, 'ID:', item.id, 'Price:', Number(item.price));

  console.log('\n--- 3. Creating an order with special instructions ---');
  const orderRes = await fetch('http://localhost:3000/api/v1/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token,
      items: [{
        menuItemId: item.id,
        quantity: 2,
        specialInstructions: 'Make it spicy with less oil'
      }],
      specialInstructions: 'Table dining test order'
    })
  });
  const orderData = await orderRes.json();
  console.log('POST /api/v1/orders ->', orderData);
  if (!orderData.success) {
    throw new Error('Order creation failed: ' + JSON.stringify(orderData));
  }

  const orderId = orderData.order.id;

  console.log('\n--- 4. Tracking initial order status (PENDING) ---');
  const track1Res = await fetch(`http://localhost:3000/api/v1/orders/track?token=${token}&orderId=${orderId}`);
  const track1Data = await track1Res.json();
  console.log('GET /api/v1/orders/track -> Status:', track1Data.order?.status, 'Items:', track1Data.order?.items);
  if (track1Data.order?.status !== 'PENDING') {
    throw new Error('Initial status was not PENDING: ' + track1Data.order?.status);
  }

  console.log('\n--- 5. Simulating Kitchen status progression: PENDING -> ACCEPTED -> PREPARING -> READY ---');
  await prisma.order.update({
    where: { id: orderId },
    data: { status: 'PREPARING' }
  });

  const track2Res = await fetch(`http://localhost:3000/api/v1/orders/track?token=${token}&orderId=${orderId}`);
  const track2Data = await track2Res.json();
  console.log('GET /api/v1/orders/track after kitchen update -> Status:', track2Data.order?.status);
  if (track2Data.order?.status !== 'PREPARING') {
    throw new Error('Expected status to be PREPARING');
  }

  console.log('\n--- 6. Marking order READY ---');
  await prisma.order.update({
    where: { id: orderId },
    data: { status: 'READY' }
  });

  const track3Res = await fetch(`http://localhost:3000/api/v1/orders/track?token=${token}&orderId=${orderId}`);
  const track3Data = await track3Res.json();
  console.log('GET /api/v1/orders/track after kitchen update -> Status:', track3Data.order?.status);
  if (track3Data.order?.status !== 'READY') {
    throw new Error('Expected status to be READY');
  }

  console.log('\n✅ ALL CUSTOMER MENU & ORDER TRACKING CHECKS PASSED SUCCESSFULLY!');
}

run()
  .catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
