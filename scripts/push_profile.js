const fs = require('fs');
const https = require('https');

const token = process.env.GITHUB_TOKEN || "";
const repo = "ErenEliuth/ErenEliuth";
const sha = fs.readFileSync('C:/Users/Admin/Desktop/AppMobile/profile_readme_sha.txt', 'utf8').trim();
const content = fs.readFileSync('C:/Users/Admin/Desktop/AppMobile/profile_readme.md', 'utf8');

const data = JSON.stringify({
  message: "Update profile with FinanzasApp portfolio",
  content: Buffer.from(content).toString('base64'),
  sha: sha
});

const options = {
  hostname: 'api.github.com',
  path: `/repos/${repo}/contents/README.md`,
  method: 'PUT',
  headers: {
    'User-Agent': 'Node.js',
    'Authorization': `token ${token}`,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = https.request(options, res => {
  let resData = '';
  res.on('data', chunk => resData += chunk);
  res.on('end', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log('Profile update successful');
    } else {
      console.log('Error updating profile:', res.statusCode, resData);
    }
  });
});

req.on('error', e => console.error(e));
req.write(data);
req.end();
