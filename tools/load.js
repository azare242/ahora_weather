// Run inside a cluster Pod: node load.js URL durationSeconds requestsPerSecond
const [url = 'http://weather-server-service/api/v1/weather/tehran', duration = '30', rate = '5'] = process.argv.slice(2);
if (!(Number(duration) > 0 && Number(rate) > 0)) throw new Error('Positive duration/rate required');
const started = Date.now(), rows = [], pending = new Set();
const timer = setInterval(() => {
    if (Date.now() - started >= Number(duration) * 1000) { clearInterval(timer); return; }
    const task = (async () => {
        const at = Date.now();
        let row = {at: new Date(at).toISOString()};
        try {
            const response = await fetch(url, {headers: {Connection: 'close'}, signal: AbortSignal.timeout(4000)});
            const body = await response.json();
            Object.assign(row, {status: response.status, pod: response.headers.get('x-pod-name'), source: body.weather?.source, stale: body.weather?.stale});
        } catch (error) { row.error = error.name; }
        row.latencyMs = Date.now() - at; rows.push(row); console.log(JSON.stringify(row));
    })();
    pending.add(task); task.finally(() => pending.delete(task));
}, 1000 / Number(rate));
process.on('beforeExit', () => {
    const latencies = rows.map(r => r.latencyMs).sort((a,b) => a-b);
    const successes = rows.filter(r => r.status === 200).length;
    console.log(JSON.stringify({summary: true, total: rows.length, successes, errors: rows.length-successes, timeouts: rows.filter(r => r.error === 'TimeoutError').length, stale: rows.filter(r => r.stale).length, throughput: rows.length/((Date.now()-started)/1000), p95Ms: latencies[Math.ceil(latencies.length*0.95)-1]}));
});
