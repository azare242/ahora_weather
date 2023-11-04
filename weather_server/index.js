const express = require('express');
const { getWeather } = require('./weather')
// const redis = require('./redis');
const {set, get} = require('./redis');
// const redis = require('redis');
// const redisclient = redis.createClient();
// redisclient.connect();
const app = express();

app.use(express.json());


app.get('/ping', (_, res) => {
    res.status(200).json({message: "IM ALIVE"});
})


app.get('/api/v1/weather/:city', async (req, res) => {
    const { city } = req.params;
    const weather = await getWeather(req.params.city);
    res.status(weather.message !== undefined ? 400 : 200).send({weather});
})





app.listen(process.env.PORT);