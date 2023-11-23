module.exports = {
    PORT: process.env.PORT || 9999,
    REDIS_HOST: process.env.REDIS_HOST || "localhost",
    REDIS_PORT: process.env.exports || 6379,
    REDIS_PAIR_TTL: process.env.REDIS_PAIR_TTL || undefined,
    WEATHER_URL: process.env.WEATHER_URL || undefined,
    WEATHER_AUTH: process.env.WEATHER_AUTH || undefined
}