const {REDIS_HOST, REDIS_PORT, REDIS_PAIR_TTL} = require("./config")
const {createClient} = require("redis");


const redisSet = async (key, value) => {
    const redis_client = await createClient({
        url: `redis://${REDIS_HOST}:${REDIS_PORT}`
    })
    .on("error", (error)=>console.log(error))
    .connect();
    
    await redis_client.set(key, value,{EX: REDIS_PAIR_TTL});
} 


const redisGet = async (key) => {
    const redis_client = await createClient()
    .on("error", (error)=>console.log(error))
    .connect();

    const result = await redis_client.get(key);
    return result;
}



module.exports = {
    redisSet,
    redisGet,
}
