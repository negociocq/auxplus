const https = require('https');
const fs = require('fs');

const TABLES = [
  'users', 'folders', 'folder_settings', 'items',
  'tickets', 'settings', 'whatsapp_messages', 'folder_messages',
  'platform_settings',
];

const headers = {
  'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjdWVobnphb25oZGNqYnhoYWR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNTUzMTEsImV4cCI6MjEwMDgzMTMxMX0.Qr8gPL_nfgS6R0YbluZLpnA1a_CQp3Cu1_GXk-1TFI8',
  'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjdWVobnphb25oZGNqYnhoYWR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNTUzMTEsImV4cCI6MjEwMDgzMTMxMX0.Qr8gPL_nfgS6R0YbluZLpnA1a_CQp3Cu1_GXk-1TFI8',
  'Accept': 'application/json',
};

function fetchTable(table) {
  return new Promise((resolve, reject) => {
    let allData = [];
    let url = `/rest/v1/${table}?select=*&limit=1000`;

    function fetchPage(pageUrl) {
      const [path, query] = pageUrl.split('?');
      const req = https.request({
        hostname: 'jcuehnzaonhdcjbxhadz.supabase.co',
        path: path + (query ? '?' + query : ''),
        method: 'GET',
        headers: headers,
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (Array.isArray(json) && json.length > 0) {
              allData = allData.concat(json);
              // Check if there's a next page via Range header
              const range = res.headers['content-range'];
              if (range) {
                const parts = range.split('/');
                const total = parseInt(parts[1]);
                if (allData.length < total) {
                  const offset = allData.length;
                  fetchPage(`${path}?select=*&limit=1000&offset=${offset}`);
                  return;
                }
              }
            }
            resolve(allData);
          } catch (e) {
            reject(e);
          }
        });
      });
      req.on('error', reject);
      req.end();
    }

    fetchPage(url);
  });
}

async function main() {
  const backup = {};
  for (const table of TABLES) {
    try {
      console.log(`Dumping ${table}...`);
      const data = await fetchTable(table);
      backup[table] = data;
      console.log(`  ${table}: ${data.length} rows`);
    } catch (e) {
      console.log(`  ${table}: ERROR - ${e.message}`);
    }
  }

  fs.writeFileSync('supabase-backup.json', JSON.stringify(backup, null, 2));
  console.log('Saved to supabase-backup.json');
  console.log('Tables:', Object.keys(backup).join(', '));
}

main().catch(e => { console.error(e); process.exit(1); });
