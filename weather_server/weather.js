const axios = require('axios');
const {redisSet, redisGet} = require('./redis');
const {WEATHER_URL, WEATHER_AUTH, REDIS_PAIR_TTL} = require('./config');

const getWeather = async (city) => { 
//    console.log("redis://" + REDIS_HOST + ":" + REDIS_PORT)
    if (!WEATHER_URL || !WEATHER_AUTH) return {message: "OUT OF SERVICE"}
    try {
      const cache = await redisGet(city);
      if (cache) {
        console.log("CACHE HIT")
        return (JSON.parse(cache));
      }
      console.log("CACHE MISS")
      const response = await axios.request({
        method: "GET",
        url: WEATHER_URL + city,
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
        console.error(error)
      return {message: "Error in API call"};
    }
  };


module.exports = {
    getWeather
}
