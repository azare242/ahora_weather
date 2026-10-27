## Kubernetes Training Project

**A Little Weather API Server working with Redis**

For local development, use Node.js 22 or newer (the app's `.nvmrc` selects 22):

```sh
cd weather_server
npm ci
npm start
```

`npm run dev` starts the application with nodemon. Configure the environment
variables listed below before requesting weather data. Redis is optional for
weather requests; `GET /ping` can be used to check the server without it.

 - Implemented with ExpressJs
 - You can access docker image of project with `azare242/weather-server:latest`
 - for weather i use [ninjas](https://api-ninjas.com/)  api

Run Docker Compose v2 or newer from the repository root:

```sh
cp deployment/.env.example deployment/.env
# Set WEATHER_AUTH in deployment/.env to your API Ninjas key.
docker build -t ahora-weather:local weather_server
docker compose -f deployment/docker-compose.yml up --no-build -d --wait
curl http://localhost:9999/ping
curl http://localhost:9999/api/v1/weather/tehran
```

The app starts independently of Redis and
runs as a non-root user with production dependencies, a read-only filesystem,
and a `/livez` health check. Redis is available only inside the Compose network;
its data is stored in a named volume with append-only persistence enabled.
The app binds to localhost on port 9999; change `APP_PORT` in `deployment/.env`
if that port is occupied. Weather requests require a valid API key and provider
access. `/ping` only checks the HTTP server, not Redis or the weather provider.

```sh
docker compose -f deployment/docker-compose.yml logs -f app
docker compose -f deployment/docker-compose.yml down
```

`down` preserves Redis data. Add `--volumes` only when you intend to delete it.
To build and run just the app image against an existing Redis server:

```sh
docker build -t ahora-weather:local weather_server
docker run --rm --init -p 127.0.0.1:9999:9999 --env-file deployment/.env \
  -e REDIS_HOST=your-redis-host -e REDIS_PORT=6379 ahora-weather:local
```

### Kubernetes baseline

Build the current app as `ahora-weather:resilience-v1` using the Docker command above
with its image tag changed accordingly.
For kind, load it with `kind load docker-image ahora-weather:resilience-v1`; for minikube,
use `minikube image load ahora-weather:resilience-v1`. For a remote cluster, push the
image with a unique version tag or digest and update `server-deployment.yml`.
The local tag uses `IfNotPresent`; rebuilds under the same tag require reloading
and restarting Pods. Use unique tags for repeatable rollouts.

Use a dedicated namespace and create the API key Secret without committing it:

```sh
kubectl create namespace weather
read -rs WEATHER_AUTH
printf '%s' "$WEATHER_AUTH" | kubectl -n weather create secret generic weather-server-secret \
  --from-file=WEATHER_AUTH=/dev/stdin --dry-run=client -o yaml | kubectl apply -f -
unset WEATHER_AUTH
kubectl kustomize deployment/k8s
kubectl -n weather apply --dry-run=server -k deployment/k8s
kubectl -n weather apply -k deployment/k8s
kubectl -n weather rollout status deployment/redis
kubectl -n weather rollout status deployment/weather-server-deployment
kubectl -n weather port-forward service/weather-server-service 9999:80
```

Enter the key after `read` and press Enter. Then, in another terminal:

```sh
curl http://localhost:9999/ping
curl http://localhost:9999/api/v1/weather/tehran
```

Non-secret settings live in `deployment/k8s/server-configmap.yml` and are
injected as environment variables. After changing the ConfigMap or Secret,
restart the app with `kubectl -n weather rollout restart deployment/weather-server-deployment`.
The Service routes port 80 to the app's named port on 9999.
Startup and liveness probes use `/livez`; readiness uses `/readyz`. Redis and
provider outages do not remove every replica from Service traffic. SIGTERM marks
the instance unready, waits five seconds for routing propagation, then drains
HTTP requests within a 25-second deadline.

Both workloads have resource budgets, non-root users, read-only root filesystems,
dropped capabilities, and no mounted Kubernetes API token. Size resources using
measurements. App rollouts allow one extra Pod and keep existing replicas until
new ones pass readiness; reserve capacity for four app Pods during updates.

Redis uses append-only persistence and a single replica with `Recreate` updates,
so Redis updates have downtime. The PVC requires a default StorageClass (check
`kubectl get storageclass`), or an explicitly configured class. The former
hostPath PV is retained only as `deployment/k8s/examples/redis-pv.yml.example`;
it is excluded from Kustomize. Use `apply -k`, rather than recursively applying
this directory. Existing bound PVCs keep their storage; changing storage class
requires a separately planned data migration. Do not delete a bound PVC to
apply this change. Storage durability and cross-node availability depend on
the provisioner; this single Redis instance does not provide high availability.
Redis is unauthenticated and intended for an isolated training namespace.

> for this project we focus on deployment with docker and k8s,
> if you want test this project without them,
>  do not forget look at `weather_server/config.js` and use `dotenv` package


### Supported city inputs

Weather requests resolve city names locally and call API Ninjas with `lat` and
`lon`, which work on the free plan. Set `WEATHER_AUTH` to your API key and
`WEATHER_URL` to `https://api.api-ninjas.com/v1/weather` (the default).

Supported cities: Tehran, Mashhad, Isfahan (Esfahan), Shiraz, Tabriz, Karaj,
Qom, Ahvaz, Kermanshah, Urmia, Rasht, Zahedan, Hamadan, Kerman, Yazd,
Ardabil, Bandar Abbas, Arak, Qazvin, and Zanjan. Persian names are also accepted.
Input is case-insensitive; spaces, hyphens, underscores, Persian half-spaces,
and Arabic variants of ی/ک are normalized. Aliases share a canonical cache key.
Unknown cities return HTTP 400 with the supported city names.

Examples: `/api/v1/weather/TEHRAN`, `/api/v1/weather/esfahan`,
`/api/v1/weather/bandar-abbas` (URL-encode Persian names or spaces).

### Fault tolerance demo

See [the demo runbook](deployment/demo/README.md) and
[implementation and measured results](IMPROVES-REPORT.md). The production base
keeps fault controls disabled. Use the isolated demo overlay for controlled faults.

Weather responses include `source` (`provider` or `cache`), `stale`, and
`observedAt`; `X-Pod-Name` identifies the serving instance. Unsupported cities
return 400; requests with no usable provider or retained cache return 503.
A failed cache read bypasses Redis, and a failed write preserves provider success.
The default provider deadline is 1500 ms; cache operations are bounded at 300 ms.
After three provider failures per process, a circuit opens for 10 seconds, then
allows one recovery probe. Fresh cache lasts 20 seconds; retained stale data may
be served for up to 300 seconds from fetch time. Redis must remain reachable for
stale fallback; there is no local cache or Redis high availability.
`observedAt` records application fetch time, not a provider observation timestamp.
Settings are listed in `weather_server/config.js` and the base ConfigMap.
The PDB requires two available app replicas for voluntary evictions; direct Pod
deletion and node crashes bypass this protection. Placement prefers host spread
but permits replacement on surviving nodes. Use three workers to demonstrate it.
