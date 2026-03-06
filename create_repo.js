const https = require('https');

const data = JSON.stringify({
    name: 'FinanzasApp',
    private: false
});

const options = {
    hostname: 'api.github.com',
    path: '/user/repos',
    method: 'POST',
    headers: {
        'Authorization': 'token YOUR_GITHUB_TOKEN',
        'User-Agent': 'Node.js',
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

const req = https.request(options, res => {
    let resData = '';
    res.on('data', d => {
        resData += d;
    });
    res.on('end', () => {
        console.log(res.statusCode);
        console.log(resData);
    });
});

req.on('error', error => {
    console.error(error);
});

req.write(data);
req.end();
