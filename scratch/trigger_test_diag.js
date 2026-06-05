const https = require('https');

const options = {
  hostname: 'finanzas-app-navy.vercel.app',
  port: 443,
  path: '/api/push/test',
  method: 'GET'
};

console.log('Fetching diagnostic endpoint...');
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

req.end();
