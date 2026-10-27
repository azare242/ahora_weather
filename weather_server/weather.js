const axios = require('axios');
const cache = require('./redis');
const config = require('./config');
const {resolveCity, cities} = require('./cities');

function createWeather({store = cache, request = options => axios.request(options), now = Date.now, settings = config} = {}) {
    let failures = 0, openedAt = null, probing = false;
    const metrics = {cacheHits: 0, cacheBypasses: 0, providerCalls: 0, providerTimeouts: 0, staleResponses: 0};
    const state = () => openedAt === null ? 'closed' : (now() - openedAt < settings.BREAKER_COOLDOWN_MS ? 'open' : 'half-open');
    async function getWeather(input) {
        const location = resolveCity(input);
        if (!location) return {message: 'Unsupported city', supportedCities: cities.map(city => city.name)};
        let cached;
        try {
            cached = JSON.parse(await store.redisGet(location.name) || 'null');
            if (!cached || !Number.isFinite(cached.timestamp) || !Number.isFinite(cached.min) || !Number.isFinite(cached.max)) cached = null;
        } catch { metrics.cacheBypasses++; }
        const age = () => cached ? now() - cached.timestamp : Infinity;
        const result = (data, source, stale) => ({min: data.min, max: data.max, source, stale, observedAt: new Date(data.timestamp).toISOString()});
        if (age() >= 0 && age() < settings.REDIS_PAIR_TTL * 1000) {
            metrics.cacheHits++;
            return result(cached, 'cache', false);
        }
        try {
            if (state() === 'open' || probing) throw new Error('Circuit open');
            if (!settings.WEATHER_AUTH) throw new Error('Provider not configured');
            probing = openedAt !== null;
            try {
                const url = new URL(settings.WEATHER_URL);
                for (const key of ['city', 'state', 'country', 'zip']) url.searchParams.delete(key);
                url.searchParams.set('lat', location.lat);
                url.searchParams.set('lon', location.lon);
                metrics.providerCalls++;
                const response = await request({method: 'GET', url: url.toString(), timeout: settings.PROVIDER_TIMEOUT_MS, headers: {'X-API-KEY': settings.WEATHER_AUTH}});
                const data = {min: response.data.min_temp, max: response.data.max_temp, timestamp: now()};
                if (!Number.isFinite(data.min) || !Number.isFinite(data.max)) throw new Error('Invalid provider response');
                failures = 0; openedAt = null;
                try { await store.redisSet(location.name, JSON.stringify(data)); } catch { metrics.cacheBypasses++; }
                return result(data, 'provider', false);
            } catch (error) {
                if (['ECONNABORTED', 'ETIMEDOUT'].includes(error.code)) metrics.providerTimeouts++;
                if (++failures >= settings.BREAKER_THRESHOLD) openedAt = now();
                throw error;
            } finally { probing = false; }
        } catch {
            if (age() >= 0 && age() <= settings.CACHE_MAX_AGE * 1000) {
                metrics.staleResponses++;
                return result(cached, 'cache', true);
            }
            return {message: 'Weather temporarily unavailable', unavailable: true};
        }
    }
    return {getWeather, stats: () => ({...metrics, circuit: state()})};
}
module.exports = {...createWeather(), createWeather};
