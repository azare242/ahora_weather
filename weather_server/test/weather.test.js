const {test} = require('node:test');
const assert = require('node:assert/strict');
const {cities, resolveCity} = require('../cities');

test('all 20 cities and aliases resolve to valid coordinates', () => {
    assert.equal(cities.length, 20);
    for (const city of cities) {
        assert.ok(city.lat > 25 && city.lat < 40);
        assert.ok(city.lon > 44 && city.lon < 64);
        for (const alias of [city.name, ...city.aliases]) assert.equal(resolveCity(alias), city);
    }
    assert.equal(resolveCity(' BANDAR_ ABBAS '), resolveCity('بندر‌عباس'));
    assert.equal(resolveCity('شيراز'), resolveCity('Shiraz'));
    assert.equal(resolveCity('اراك'), resolveCity('ARAK'));
    assert.equal(resolveCity('London'), undefined);
    assert.equal(resolveCity('__proto__'), undefined);
});

test('requests use coordinates, share alias cache, and reject unknown cities locally', async () => {
    process.env.WEATHER_AUTH = 'test-key';
    process.env.WEATHER_URL = 'https://api.api-ninjas.com/v1/weather?city=&country=IR';
    const cache = new Map();
    require.cache[require.resolve('../redis')] = {exports: {
        redisGet: async key => cache.get(key),
        redisSet: async (key, value) => cache.set(key, value),
    }};
    const axios = require('axios');
    const original = axios.request;
    let calls = 0;
    axios.request = async options => {
        calls++;
        const url = new URL(options.url);
        assert.equal(url.searchParams.get('lat'), '32.6546');
        assert.equal(url.searchParams.get('lon'), '51.668');
        assert.equal(url.searchParams.has('city'), false);
        assert.equal(url.searchParams.has('country'), false);
        assert.equal(options.headers['X-API-KEY'], 'test-key');
        return {data: {min_temp: 10, max_temp: 20}};
    };
    try {
        const {getWeather} = require('../weather');
        assert.equal((await getWeather('London')).message, 'Unsupported city');
        assert.equal(calls, 0);
        assert.deepEqual(await getWeather(' ESFAHAN '), {min: 10, max: 20});
        assert.deepEqual(await getWeather('اصفهان'), {min: 10, max: 20});
        assert.equal(calls, 1);
        assert.ok(cache.has('isfahan'));
    } finally {
        axios.request = original;
    }
});
