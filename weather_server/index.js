const {PORT} = require('./config')
const express = require('express');
const { getWeather } = require('./weather')
const morgan = require('morgan')
const app = express();

app.use(express.json());
app.use(morgan('[:method] ":url" (:status) :res[content-length] - :response-time ms'));

app.get('/ping', (_, res) => {
    res.status(200).json({message: "IM ALIVE"});
})


app.get('/api/v1/weather/:city', async (req, res) => {
    const weather = await getWeather(req.params.city);
    res.status(weather.message !== undefined ? 400 : 200).send({weather});
})





app.listen(PORT, () => {
    console.log(`Server running on ${PORT}`)
});