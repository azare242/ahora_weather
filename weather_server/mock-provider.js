// Isolated demo only: no credentials or external provider needed.
const http = require('node:http');
let mode = 'ok', delayMs = 0;
http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://mock');
    if (req.method === 'POST' && url.pathname === '/control') {
        const next = url.searchParams.get('mode');
        const delay = Number(url.searchParams.get('delayMs') || 0);
        if (!['ok', 'error', 'slow'].includes(next) || !Number.isFinite(delay) || delay < 0 || delay > 30000) { res.writeHead(400); return res.end(); }
        mode = next; delayMs = delay;
        return res.end(JSON.stringify({mode, delayMs}));
    }
    if (url.pathname === '/livez') return res.end('ok');
    const current = mode;
    if (current === 'slow') await new Promise(resolve => setTimeout(resolve, delayMs));
    res.writeHead(current === 'error' ? 503 : 200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify(current === 'error' ? {error: 'injected'} : {min_temp: 12, max_temp: 24}));
}).listen(8080);
