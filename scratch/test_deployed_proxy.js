const https = require('https');

const targetUrl = 'https://scanner.tradingview.com/colombia/scan';
const proxyUrl = `/api/proxy?url=${encodeURIComponent(targetUrl)}`;

const postData = JSON.stringify({
  symbols: { tickers: ['BVC:ECOPETROL'] },
  columns: ['close', 'change', 'change_abs', 'description']
});

const options = {
  hostname: 'finanzas-app-navy.vercel.app',
  port: 443,
  path: proxyUrl,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

console.log('Testing deployed proxy endpoint...');
const req = https.request(options, (res) => {
  console.log('Status Code:', res.statusCode);
  console.log('Headers:', res.headers);
  
  let responseData = '';
  res.on('data', (chunk) => {
    responseData += chunk;
  });

  res.on('end', () => {
    console.log('Response (first 500 chars):', responseData.substring(0, 500));
  });
});

req.on('error', (error) => {
  console.error('Request error:', error);
});

req.write(postData);
req.end();
