const number = (name, fallback) => {
    const value = Number(process.env[name] ?? fallback);
    if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid ${name}`);
    return value;
};
module.exports = {
    PORT: number('PORT', 9999),
    REDIS_HOST: process.env.REDIS_HOST || 'localhost',
    REDIS_PORT: number('REDIS_PORT', 6379),
    REDIS_PAIR_TTL: number('REDIS_PAIR_TTL', 20),
    CACHE_MAX_AGE: number('CACHE_MAX_AGE', 300),
    CACHE_TIMEOUT_MS: number('CACHE_TIMEOUT_MS', 300),
    PROVIDER_TIMEOUT_MS: number('PROVIDER_TIMEOUT_MS', 1500),
    BREAKER_THRESHOLD: number('BREAKER_THRESHOLD', 3),
    BREAKER_COOLDOWN_MS: number('BREAKER_COOLDOWN_MS', 10000),
    SHUTDOWN_DELAY_MS: number('SHUTDOWN_DELAY_MS', 5000),
    WEATHER_URL: process.env.WEATHER_URL || 'https://api.api-ninjas.com/v1/weather',
    WEATHER_AUTH: process.env.WEATHER_AUTH,
    DEMO_FAULTS: process.env.DEMO_FAULTS === 'true',
};
