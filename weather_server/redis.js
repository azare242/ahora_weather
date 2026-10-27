const {createClient} = require('redis');
const config = require('./config');
const client = createClient({
    url: `redis://${config.REDIS_HOST}:${config.REDIS_PORT}`,
    disableOfflineQueue: true,
    socket: {connectTimeout: config.CACHE_TIMEOUT_MS, reconnectStrategy: false},
});
client.on('error', () => {});
let connecting;
async function command(operation) {
    let timer;
    try {
        return await Promise.race([
            (async () => {
                if (!client.isOpen) {
                    if (!connecting) connecting = client.connect().finally(() => { connecting = undefined; });
                    await connecting;
                }
                if (!client.isReady) throw new Error('Cache unavailable');
                return operation();
            })(),
            new Promise((_, reject) => { timer = setTimeout(() => {
                if (client.isOpen) client.destroy();
                reject(new Error('Cache deadline exceeded'));
            }, config.CACHE_TIMEOUT_MS); }),
        ]);
    } finally { clearTimeout(timer); }
}
module.exports = {
    redisGet: key => command(() => client.get(key)),
    redisSet: (key, value) => command(() => client.set(key, value, {EX: config.CACHE_MAX_AGE})),
    close: () => { if (client.isOpen) client.destroy(); },
};
