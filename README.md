## Kubernetes Training Project

**A Little Weather API Server working with Redis**

For local development, use Node.js 22 or newer (the app's `.nvmrc` selects 22):

```sh
cd weather_server
npm ci
npm start
```

`npm run dev` starts the application with nodemon. Configure the environment
variables listed below before requesting weather data. Redis is required for
weather requests; `GET /ping` can be used to check the server without it.

 - Implemented with ExpressJs
 - You can access docker image of project with `azare242/weather-server:latest`
 - for weather i use [ninjas](https://api-ninjas.com/)  api

Run Docker Compose v2 or newer from the repository root. In your zsh setup,
prefix every Docker command below with `withproxy` to use the proxy defined
in `~/.zshrc`:

```sh
cp deployment/.env.example deployment/.env
# Set WEATHER_AUTH in deployment/.env to your API Ninjas key.
withproxy docker build --network=host \
  --build-arg HTTP_PROXY --build-arg HTTPS_PROXY \
  --build-arg http_proxy --build-arg https_proxy \
  -t ahora-weather:local weather_server
withproxy docker compose -f deployment/docker-compose.yml up --no-build -d --wait
curl http://localhost:9999/ping
curl http://localhost:9999/api/v1/weather/tehran
```

The build command uses host networking so the build can reach your localhost
proxy on Linux; proxy values are passed as build arguments, not saved as image
environment variables. Without this local proxy setup, `docker compose up
--build -d --wait` builds normally. Compose waits for Redis to become healthy. The app
runs as a non-root user with production dependencies, a read-only filesystem,
and a `/ping` health check. Redis is available only inside the Compose network;
its data is stored in a named volume with append-only persistence enabled.
The app binds to localhost on port 9999; change `APP_PORT` in `deployment/.env`
if that port is occupied. Weather requests require a valid API key and provider
access. `/ping` only checks the HTTP server, not Redis or the weather provider.

```sh
withproxy docker compose -f deployment/docker-compose.yml logs -f app
withproxy docker compose -f deployment/docker-compose.yml down
```

`down` preserves Redis data. Add `--volumes` only when you intend to delete it.
To build and run just the app image against an existing Redis server:

```sh
withproxy docker build --network=host \
  --build-arg HTTP_PROXY --build-arg HTTPS_PROXY \
  --build-arg http_proxy --build-arg https_proxy \
  -t ahora-weather:local weather_server
withproxy docker run --rm --init -p 127.0.0.1:9999:9999 --env-file deployment/.env \
  -e REDIS_HOST=your-redis-host -e REDIS_PORT=6379 ahora-weather:local
```

**if you want use k8s,** fill data section in config map in `deployment/k8s/server-configmap.yml`:
```yaml
data:
   PORT:
   REDIS_HOST:
   REDIS_PORT:
   WEATHER_URL:
   WEATHER_AUTH:
   REDIS_PAIR_TTL:
```
and  fill env section in deployment in `deployment/k8s/server-deployment.yml`
```yaml
        env:
          - name: PORT
            value: 
          - name: REDIS_HOST
            value: 
          - name: REDIS_PORT
            value: 
          - name: WEATHER_URL
            value:
          - name: WEATHER_AUTH
            value: 
          - name: REDIS_PAIR_TTL
            value:
```
then you can deploy it with kubectl with:

    cd deployment/k8s
    kubectl apply -f .



> for this project we focus on deployment with docker and k8s,
> if you want test this project without them,
>  do not forget look at `weather_server/config.js` and use `dotenv` package

