const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createWeather} = require('../weather');
const settings = {...require('../config'), WEATHER_AUTH: 'test', REDIS_PAIR_TTL: 1, CACHE_MAX_AGE: 10, BREAKER_THRESHOLD: 2, BREAKER_COOLDOWN_MS: 100};
test('cache failures preserve provider success; provider failure returns bounded unavailable', async () => {
    const store = {redisGet: async () => {throw Error();}, redisSet: async () => {throw Error();}};
    const service = createWeather({store, settings, request: async options => {
        assert.equal(options.timeout, settings.PROVIDER_TIMEOUT_MS);
        return {data: {min_temp: 1, max_temp: 2}};
    }});
    assert.equal((await service.getWeather('tehran')).source, 'provider');
    assert.equal(service.stats().cacheBypasses, 2);
    const failed = createWeather({store, settings, request: async () => {throw Error();}});
    assert.equal((await failed.getWeather('tehran')).unavailable, true);
});
test('fresh, stale, expired cache and breaker cooldown recovery', async () => {
    let time = 10000, calls = 0, fail = true;
    const store = {redisGet: async () => JSON.stringify({min: 1, max: 2, timestamp: 9500}), redisSet: async () => {}};
    const service = createWeather({store, settings, now: () => time, request: async () => {
        calls++; if (fail) throw Object.assign(Error(), {code: 'ECONNABORTED'});
        return {data: {min_temp: 3, max_temp: 4}};
    }});
    assert.equal((await service.getWeather('tehran')).stale, false);
    time = 11000;
    assert.equal((await service.getWeather('tehran')).stale, true);
    await service.getWeather('tehran');
    assert.equal(service.stats().circuit, 'open');
    await service.getWeather('tehran'); assert.equal(calls, 2);
    time += 101; fail = false;
    assert.equal((await service.getWeather('tehran')).source, 'provider');
    assert.equal(service.stats().circuit, 'closed');
    time = 20000; fail = true;
    assert.equal((await service.getWeather('tehran')).unavailable, true);
});
test('health faults are independent and disabled by default', async () => {
    const {app, health} = require('../index').createApp();
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        health.ready = false;
        assert.equal((await fetch(base+'/readyz')).status, 503);
        assert.equal((await fetch(base+'/livez')).status, 200);
        assert.equal((await fetch(base+'/demo/fault', {method: 'POST'})).status, 404);
        assert.equal((await fetch(base+'/api/v1/weather/london')).status, 400);
        health.draining = true; health.ready = true;
        assert.equal((await fetch(base+'/readyz')).status, 503);
    } finally { await new Promise(resolve => server.close(resolve)); }
});
