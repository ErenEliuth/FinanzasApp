const fs = require('fs');
const https = require('https');

const token = process.env.GITHUB_TOKEN || "";
const repo = "ErenEliuth/ErenEliuth";
const options = {
  hostname: 'api.github.com',
  path: `/repos/${repo}/contents/README.md`,
  headers: {
    'User-Agent': 'Node.js',
    'Authorization': `token ${token}`
  }
};

https.get(options, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);
    if(json.content) {
      const readme = Buffer.from(json.content, 'base64').toString('utf8');
      fs.writeFileSync('C:/Users/Admin/Desktop/AppMobile/profile_readme.md', readme);
      fs.writeFileSync('C:/Users/Admin/Desktop/AppMobile/profile_readme_sha.txt', json.sha);
      console.log('README fetch successful');
    } else {
      console.log('Error fetching README:', json);
    }
  });
});
