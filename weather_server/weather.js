const axios = require('axios');
const {redisSet, redisGet} = require('./redis');
const { json } = require('express');


const getWeather = async (city) => { 
    try {
      const cache = await redisGet(city);
      if (cache) {
        console.log("CACHE HIT")
        return (JSON.parse(cache));
      }
      console.log("CACHE MISS")
      const response = await axios.request({
        method: "GET",
        url: 'https://api.api-ninjas.com/v1/weather?city=' + city,
        headers: {
            "X-API-KEY": "YbdgZf59lSo6VSJ6BaklYQ==xghcOBjyCR8UbPPf"
        }
      });
      const weather_data = {
        min: response.data.min_temp,
        max: response.data.max_temp
      };

      await redisSet(city, JSON.stringify(weather_data), "EX", 300);
      return weather_data;
    } catch (error) {
        console.error(error)
      return {message: "Error in API call"};
    }
  };


module.exports = {
    getWeather
}