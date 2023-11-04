// const { createClient } = require('@redis/client');
const {createClient} = require("redis");


const redisSet = async (key, value) => {
    const redis_client = await createClient()
    .on("error", ()=>console.log("REDIS ERROR"))
    .connect();
    
    await redis_client.set(key, value);
} 


const redisGet = async (key) => {
    const redis_client = await createClient()
    .on("error", ()=>console.log("REDIS ERROR"))
    .connect();

    const result = await redis_client.get(key);
    return result;
}



module.exports = {
    redisSet,
    redisGet,
}