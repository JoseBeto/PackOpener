const https = require('https');

const testUrls = [
  'https://api.tcgdex.dev',
  'https://api.tcgdex.dev/',
  'https://api.tcgdex.dev/v1',
  'https://api.tcgdex.dev/v1/en',
  'https://tcgdex.dev/api',
  'https://tcgdex.dev/rest/sets',
  'https://tcgdex.dev/rest',
  'https://api.tcgdex.dev/en/rest/sets'
];

async function testUrl(url) {
  return new Promise((resolve) => {
    const req = https.get(url, { rejectUnauthorized: false }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const preview = data.substring(0, 100).replace(/\n/g, ' ');
        resolve(`${url} -> ${res.statusCode} (${preview})`);
      });
    }).on('error', (e) => {
      resolve(`${url} -> ERROR: ${e.message}`);
    });
    req.setTimeout(5000, function() {
      this.destroy();
      resolve(`${url} -> TIMEOUT`);
    });
  });
}

(async () => {
  for (const url of testUrls) {
    const result = await testUrl(url);
    console.log(result);
  }
})();
