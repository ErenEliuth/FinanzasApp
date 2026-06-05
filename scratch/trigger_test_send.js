const https = require('https');

const data = JSON.stringify({
  title: 'Santy te aconseja 🧠',
  body: '¡Hola! Esta es una prueba manual del backend.',
  userId: '6ca9b5e1-e30e-4187-b0af-8c90e6c8c862',
  url: '/goals'
});

const options = {
  hostname: 'finanzas-app-navy.vercel.app',
  port: 443,
  path: '/api/push/send',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

console.log('Sending request to Vercel API /api/push/send...');
const req = https.request(options, (res) => {
  console.log('Status Code:', res.statusCode);
  
  let responseData = '';
  res.on('data', (chunk) => {
    responseData += chunk;
  });

  res.on('end', () => {
    console.log('Response:', responseData);
  });
});

req.on('error', (error) => {
  console.error('Request error:', error);
});

req.write(data);
req.end();
