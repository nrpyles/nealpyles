// Daily mortgage rates from Mortgage News Daily.
// The site fetches this at /.netlify/functions/rates on page load.
const LABELS = [
  { key: '30yr',  label: '30 Yr. Fixed' },
  { key: '15yr',  label: '15 Yr. Fixed' },
  { key: 'fha',   label: '30 Yr. FHA' },
  { key: 'va',    label: '30 Yr. VA' },
  { key: 'jumbo', label: '30 Yr. Jumbo' },
];

const stripTags = (s) =>
  s.replace(/&#x2B;/gi, '+').replace(/&plus;/gi, '+')
   .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const nthIndex = (str, sub, n) => {
  let i = -1;
  while (n-- > 0) { i = str.indexOf(sub, i + 1); if (i < 0) break; }
  return i;
};

exports.handler = async () => {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=3600',
    'Access-Control-Allow-Origin': '*',
  };
  try {
    const res = await fetch('https://www.mortgagenewsdaily.com/mortgage-rates', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
        'Accept': 'text/html',
      },
    });
    if (!res.ok) throw new Error('MND status ' + res.status);
    const html = await res.text();

    const rates = {};
    for (const { key, label } of LABELS) {
      let i = nthIndex(html, label, 2);
      if (i < 0) i = html.indexOf(label);
      if (i < 0) continue;
      const slice = stripTags(html.slice(i, i + 600));
      const m = slice.match(/([0-9]\.[0-9]{2})%\s*Change:\s*([+\-]?[0-9]\.[0-9]{2})/);
      if (!m) continue;
      rates[key] = { rate: parseFloat(m[1]), change: parseFloat(m[2]) };
    }
    if (Object.keys(rates).length === 0) throw new Error('no rates parsed');

    const now = new Date();
    const updated = (now.getMonth() + 1) + '/' + now.getDate() + '/' + String(now.getFullYear()).slice(-2);

    return { statusCode: 200, headers,
      body: JSON.stringify({ rates, updated, source: 'Mortgage News Daily', fetched: now.toISOString() }) };
  } catch (e) {
    return { statusCode: 200, headers,
      body: JSON.stringify({ rates: {}, error: String(e && e.message || e), source: 'Mortgage News Daily' }) };
  }
};
