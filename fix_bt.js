const fs = require('fs');
['src/app/api/v1/orders/admin/[id]/route.ts', 'src/app/dashboard/orders/client-dashboard.tsx'].forEach(file => {
  let f = fs.readFileSync(file, 'utf8');
  f = f.replace(/\\`/g, '`');
  fs.writeFileSync(file, f);
});
console.log('Fixed backticks.');
