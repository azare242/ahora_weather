const axios = require('axios');
const {redisSet, redisGet} = require('./redis');
const {WEATHER_URL, WEATHER_AUTH} = require('./config');

const {resolveCity, cities} = require('./cities');

const getWeather = async (input) => {
    const location = resolveCity(input);
    if (!location) return {message: 'Unsupported city', supportedCities: cities.map(city => city.name)};
    const city = location.name;
    if (!WEATHER_URL || !WEATHER_AUTH) return {message: "OUT OF SERVICE"}
    try {
      const cache = await redisGet(city);
      if (cache) {
        console.log("CACHE HIT")
        return (JSON.parse(cache));
      }
      console.log("CACHE MISS")
      const weatherUrl = new URL(WEATHER_URL);
      for (const key of ['city', 'state', 'country', 'zip']) weatherUrl.searchParams.delete(key);
      weatherUrl.searchParams.set('lat', location.lat);
      weatherUrl.searchParams.set('lon', location.lon);
      const response = await axios.request({
        method: "GET",
        url: weatherUrl.toString(),
        headers: {
            "X-API-KEY": WEATHER_AUTH
        }
      });
      const weather_data = {
        min: response.data.min_temp,
        max: response.data.max_temp
      };

      await redisSet(city, JSON.stringify(weather_data));
      return weather_data;
    } catch (error) {
        console.error('Weather request failed:', error.code || error.message)
      return {message: "Error in API call"};
    }
  };


module.exports = {
    getWeather
}
