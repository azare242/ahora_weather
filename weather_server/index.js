const config = require('./config');
const express = require('express');
const weather = require('./weather');
const cache = require('./redis');
function createApp() {
    const app = express();
    const health = {ready: true, live: true, draining: false};
    app.use(express.json({limit: '1kb'}));
    app.use((req, res, next) => { res.set('X-Pod-Name', process.env.POD_NAME || process.env.HOSTNAME || 'local'); next(); });
    app.get('/ping', (_, res) => res.json({message: 'IM ALIVE'}));
    app.get('/livez', (_, res) => res.status(health.live ? 200 : 503).json({live: health.live}));
    app.get('/readyz', (_, res) => res.status(health.ready && !health.draining ? 200 : 503).json({ready: health.ready && !health.draining}));
    app.get('/api/v1/weather/:city', async (req, res) => {
        const data = await weather.getWeather(req.params.city);
        res.status(data.unavailable ? 503 : data.message ? 400 : 200).json({weather: data});
    });
    if (config.DEMO_FAULTS) {
        app.get('/demo/stats', (_, res) => res.json(weather.stats()));
        app.post('/demo/fault', (req, res) => {
            const {ready, live, crash} = req.body;
            if ([ready, live, crash].some(value => value !== undefined && typeof value !== 'boolean')) return res.status(400).json({message: 'Use boolean fields'});
            if (ready !== undefined) health.ready = ready;
            if (live !== undefined) health.live = live;
            res.json(health);
            if (crash === true) setTimeout(() => process.exit(1), 20);
        });
    }
    return {app, health};
}
if (require.main === module) {
    const {app, health} = createApp();
    const server = app.listen(config.PORT, () => console.log(`Server running on ${config.PORT}`));
    let stopping = false;
    const shutdown = () => {
        if (stopping) return;
        stopping = true; health.draining = true;
        const deadline = setTimeout(() => process.exit(1), 25000); deadline.unref();
        setTimeout(() => server.close(() => { cache.close(); clearTimeout(deadline); process.exit(0); }), config.SHUTDOWN_DELAY_MS);
    };
    process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
}
module.exports = {createApp};
