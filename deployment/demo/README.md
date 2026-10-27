# Isolated Minikube demo

Run from the repository root. The overlay creates `weather-demo`, a dummy API
key, a controllable mock provider, and the application with demo controls enabled.
It leaves the production `weather` namespace alone. Do not expose this namespace
to untrusted clients: the demo controls have no authentication.

```sh
docker build -t ahora-weather:resilience-v1 weather_server
minikube image load ahora-weather:resilience-v1
kubectl apply -k deployment/demo
kubectl -n weather-demo rollout status deployment/weather-server-deployment
kubectl -n weather-demo rollout status deployment/redis
kubectl -n weather-demo run load --image=ahora-weather:resilience-v1 \
  --image-pull-policy=IfNotPresent --command -- sleep 86400
kubectl -n weather-demo wait --for=condition=Ready pod/load --timeout=90s
python3 tools/cluster-experiments.py
```

If the load Pod already exists, skip `run`. The script writes raw per-request
JSONL and timestamped Kubernetes snapshots to `test-results/`. It temporarily
scales app and Redis replicas, deletes app Pods, changes readiness/liveness,
crashes a process, and changes mock-provider responses. Its `finally` block
restores three app replicas, one Redis replica, healthy fault flags, and provider
success mode. Inspect cluster state if interrupted forcibly. The experiment
uses 12-second windows at five requests/second for replica comparisons; liveness
and crash windows are longer to capture restart detection.

To measure manually through Service DNS (fresh connections):

```sh
kubectl -n weather-demo exec -i load -- node - \
  http://weather-server-service/api/v1/weather/tehran 60 5 < tools/load.js
```

The summary reports successes, errors, timeouts, throughput, stale responses,
and p95 latency. Each request includes UTC start time, status, latency, source,
and Pod. Recovery timing must be interpreted from request rows and snapshots;
a Ready-count recovery is different from continued request service.

Target an individual Pod IP from `load` for fault control, never the app Service:

```sh
kubectl -n weather-demo get pods -l app=weather-server -o wide
kubectl -n weather-demo exec load -- node -e \
  "fetch('http://POD_IP:9999/demo/fault',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ready:false})}).then(r=>r.text()).then(console.log)"
```

Use `{ready:true}` to restore, `{live:false}` for probe-triggered restart, or
`{crash:true}` for process exit. Fault flags reset on container restart.
`GET /demo/stats` on each Pod reports counters and circuit state (per process).
These routes return 404 when `DEMO_FAULTS` is disabled.

From `load`, POST to `http://mock-provider:8080/control?mode=error`,
`?mode=slow&delayMs=3000`, or `?mode=ok`. The mock captures each request's mode
at arrival. The demo freshness period is three seconds, with 300-second retained
cache. Prime Tehran before provider faults; use an unprimed city to show 503.
After restoring the provider, allow 10 seconds for open circuits to retry.

Use a unique image tag for later revisions and update both base app and mock
images. A tag identifies this source revision but is not content immutable;
use a registry digest when distributing reproducible releases.

For worker disruption, use a separate three-worker cluster with capacity for a
surge Pod. Capture node conditions, events, EndpointSlices, request rows and
Ready counts while draining a worker and separately stopping a worker. A PDB
constrains evictions, not abrupt failures. Do not run node-stop tests on the sole
control plane. Redis storage remains local and single-instance.

Keep the namespace for further demos. To remove it intentionally, remember that
`kubectl delete namespace weather-demo` also deletes its PVC and may delete the
backing data. The experiments never delete PVCs.

Additional controlled checks (after the core suite):

```sh
python3 tools/rollout-experiment.py
python3 tools/pdb-experiment.py
```

The rollout check verifies three old healthy Pods remain while one new Pod fails
readiness, then explicitly undoes the rollout. The PDB check temporarily scales
the isolated demo to two replicas and submits a server-side dry-run eviction;
it expects rejection with zero allowed disruptions and restores three replicas.
It does not drain or stop the single Minikube control-plane node.
