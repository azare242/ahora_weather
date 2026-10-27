# Fault-tolerance experiment tools

These scripts generate weather traffic and exercise recovery in the isolated
`weather-demo` Kubernetes namespace. Python runs on your machine and invokes
`kubectl`; the JavaScript load generator runs inside the cluster's `load` Pod.
They are presentation and measurement tools, separate from the application tests.

## Files

| Script | Purpose | Cluster changes |
| --- | --- | --- |
| `load.js` | Send weather requests at a configured rate and report results. | None; sends HTTP requests only. |
| `cluster-experiments.py` | Measure healthy baselines, one-versus-three-replica Pod deletion, readiness failure, liveness failure, process crash, Redis outage, and provider errors/delay. | Scales Deployments, deletes app Pods, and changes demo fault controls. Attempts to restore three app replicas, one Redis replica, and healthy controls afterward. |
| `rollout-experiment.py` | Verify that three healthy old replicas keep serving while a new replica fails readiness. | Patches the readiness probe, verifies three ready Pods out of four, then undoes the rollout. |
| `pdb-experiment.py` | Verify that a PodDisruptionBudget blocks eviction with two healthy replicas. | Temporarily scales the app to two replicas, submits a **dry-run** eviction of a healthy Pod, expects rejection, then restores three replicas. |

The experiment scripts share helper functions from `cluster-experiments.py`.
No extra Python packages are needed.

## Prerequisites

- Python 3 and `kubectl` on your machine, with the intended cluster selected.
- The demo overlay deployed, with its mock provider and fault controls enabled.
- A running Pod named `load` in `weather-demo`, using the application image
  containing Node.js 22 or newer.

Follow the [demo setup instructions](../deployment/demo/README.md) first. If the
demo is already deployed but the load Pod is missing, run from the repository root:

```sh
kubectl -n weather-demo run load --image=ahora-weather:resilience-v1 \
  --image-pull-policy=IfNotPresent --command -- sleep 86400
kubectl -n weather-demo wait --for=condition=Ready pod/load --timeout=90s
```

Skip creation when `load` already exists. It exits after 24 hours; recreate it
when needed. Python scripts hardcode `weather-demo`, but use your current
`kubectl` context. Run experiments sequentially so their faults do not overlap.

## Run the experiments

From the repository root:

```sh
python3 tools/cluster-experiments.py
python3 tools/rollout-experiment.py
python3 tools/pdb-experiment.py
```

The core suite takes a few minutes. It normally measures at five requests per
second for 12 seconds per experiment, injecting faults after three seconds.
Liveness uses a 40-second window and process crash uses 15 seconds. The separate
bad-rollout experiment uses 20 seconds.

The core suite prints measurements for interpretation; it does not assert that
every request succeeds. The rollout and PDB scripts also assert their expected
Kubernetes behavior. A provider cache miss during outage is saved separately.

## Run traffic only

Stream the load generator into the existing Pod:

```sh
kubectl -n weather-demo exec -i load -- node - \
  http://weather-server-service/api/v1/weather/tehran 60 5 < tools/load.js
```

Arguments are URL, duration in seconds, and requests per second. Defaults are
the Tehran weather Service URL, 30 seconds, and five requests per second.
Requests start on a fixed schedule, use fresh connections, and have a four-second
client timeout. Actual request counts can differ slightly from rate × duration.
Using Service DNS exercises Service routing; forwarding directly to one Pod
does not measure distribution across replicas.

Each output line is JSON. Request records contain UTC start time, HTTP status
or client error, latency, serving Pod, response source, and staleness. The final
summary includes total requests, HTTP 200 successes, errors, client timeouts,
stale responses, actual throughput, and p95 latency in milliseconds.
Errors include non-200 responses and client failures; throughput counts all
completed attempts per elapsed second, not just successes.

## Saved evidence

The Python scripts write to the repository's `test-results/` directory, which
is ignored by Git. Repeating an experiment overwrites its corresponding files.

| Filename | Contents |
| --- | --- |
| `<experiment>.jsonl` | Per-request records followed by the load summary. |
| `<experiment>-fault.txt` | UTC timestamp immediately before fault injection. |
| `<experiment>-timeline.jsonl` | Approximately once-per-second Pod names, UIDs, readiness, and restart counts. |
| `<experiment>.json` | Timestamped snapshot of Pods, EndpointSlices, events, and PDBs. |
| `<experiment>-stats.json` | Per-Pod cache/provider counters and circuit state, or an unavailable marker. |
| `provider-cache-miss.json` | Response for an unprimed city during provider failure. |
| `pdb-eviction.txt` | API response from the dry-run eviction check. |
| `initial.json`, `restored.json`, `rollout-restored.json`, `pdb-blocked.json`, `final.json` | State snapshots at suite-specific checkpoints. |

Compare request timestamps with faults and Pod timelines to distinguish
user-visible interruption from replica recovery. Zero sampled errors in a short
window is an observation, not a guarantee of uninterrupted availability.

## Restoration and limits

The scripts use `finally` blocks to attempt restoration. If interrupted forcibly,
or if cluster access fails during cleanup, inspect the state before presenting:

```sh
kubectl -n weather-demo get deploy,pods,pdb
```

See the [demo runbook](../deployment/demo/README.md) for restoring individual
fault flags and mock-provider mode. The scripts preserve PVCs and do not drain
or stop nodes. Worker-failure and cross-worker placement experiments require a
separate multi-worker setup. The [implementation report](../IMPROVES-REPORT.md)
contains the recorded results and their limitations.
