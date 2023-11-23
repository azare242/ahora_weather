module.exports = {
    PORT: process.env.PORT || 9999,
    REDIS_HOST: process.env.REDIS_HOST || "localhost",
    REDIS_PORT: process.env.REDIS_PORT || 6379,
    REDIS_PAIR_TTL: process.env.REDIS_PAIR_TTL || 20,
    WEATHER_URL: process.env.WEATHER_URL,
    WEATHER_AUTH: process.env.WEATHER_AUTH || undefined
}