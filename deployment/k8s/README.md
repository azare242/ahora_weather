# Kubernetes manifests explained

This guide explains the manifests in this directory. Commands assume you run
from the repository root and deploy into the `weather` namespace. See the
[root README](../../README.md#kubernetes-baseline) for image loading and Secret creation.

## How the resources connect

```text
weather-server-service:80
        → app Pods:9999 (three replicas)
              ├── configuration from my-configmap
              ├── API key from weather-server-secret
              ├── weather provider over HTTPS
              └── redis:6379 Service
                       → Redis Pod:6379
                              → /data
                              → redis-pv-claim (PVC)
                              → provisioned PV
```

A Deployment maintains Pods. A Service gives matching Pods a stable network
address. A ConfigMap supplies non-secret configuration. A Secret supplies the
API key. A PVC requests persistent storage, and a PV represents the supplied storage.

## Common manifest blocks

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: weather-server-deployment
```

- `apiVersion` chooses the API group and version for this object. Deployments use
  `apps/v1`; the Services, ConfigMap, PVC, and example PV here use `v1`.
- `kind` identifies the resource type.
- `metadata.name` names the object. References must match this name exactly.
- `metadata.labels` attaches key/value tags; labels alone do not select anything.
- `spec` describes the desired state. Its fields depend on the resource type.
- `template` inside a Deployment describes the Pods it will create.

No namespace is hardcoded. `kubectl -n weather apply -k deployment/k8s` places
namespaced objects in `weather`. A PV is cluster-scoped and has no namespace.

## `server-configmap.yml`: application settings

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: my-configmap
data:
  NODE_ENV: production
  PORT: "9999"
  REDIS_HOST: redis
  REDIS_PORT: "6379"
  REDIS_PAIR_TTL: "20"
  WEATHER_URL: "https://api.api-ninjas.com/v1/weather"
```

`data` contains string values that the app Deployment imports as environment
variables. Numeric-looking values are quoted to keep them strings.

| Key | Meaning in this project |
| --- | --- |
| `NODE_ENV` | Selects production mode for Node.js libraries that use this setting. |
| `PORT` | Port on which Express listens inside the container. |
| `REDIS_HOST` | Same-namespace DNS name of the Redis Service. |
| `REDIS_PORT` | Redis Service port. |
| `REDIS_PAIR_TTL` | Lifetime in seconds for a cached city weather entry. |
| `WEATHER_URL` | Provider endpoint; the app adds latitude and longitude. |

`WEATHER_AUTH` is deliberately absent: the Deployment reads it from a Secret.
Changing this ConfigMap does not replace environment variables in running
containers. Restart the app Deployment after changing it.

## `server-deployment.yml`: application Pods

### Identity, replicas, and rollout history

```yaml
metadata:
  name: weather-server-deployment
  labels:
    app: weather-server
spec:
  replicas: 3
  revisionHistoryLimit: 3
  progressDeadlineSeconds: 180
```

The Deployment requests three app Pods. The Deployment's own label helps organize
it; the labels on the Pod template below are what the Service selects.
`revisionHistoryLimit` retains up to three old ReplicaSets for rollback history.
`progressDeadlineSeconds` marks a rollout stalled after 180 seconds without
sufficient progress; it does not trigger automatic rollback.

### Update strategy

```yaml
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxUnavailable: 0
    maxSurge: 1
```

During an update, Kubernetes replaces Pods gradually. These settings aim to keep
three available replicas while allowing one extra replica during replacement.
Reserve capacity for that extra Pod. This controls planned rollout behavior;
it does not guarantee availability during crashes or node failures. See the
[Kubernetes Deployment guide](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/).

### Ownership and Pod labels

```yaml
selector:
  matchLabels:
    app: weather-server
template:
  metadata:
    labels:
      app: weather-server
```

The selector identifies Pods managed by this Deployment. Template labels must
match it. The app Service uses the same label to select traffic destinations.
A Deployment selector cannot normally be changed after creation.

### Pod identity and system call restrictions

```yaml
automountServiceAccountToken: false
securityContext:
  runAsNonRoot: true
  runAsUser: 1000
  runAsGroup: 1000
  seccompProfile:
    type: RuntimeDefault
```

These fields are under `template.spec`. The app needs no Kubernetes API access,
so no service-account token is automatically mounted. The container runs as UID
1000 and GID 1000, matching the Node user in the current app image. Kubernetes
requires a non-root identity. `RuntimeDefault` applies the container runtime's
default seccomp system-call filter.

### Container image

```yaml
containers:
  - name: weather-server
    image: ahora-weather:resilience-v1
    imagePullPolicy: IfNotPresent
```

`name` identifies this container inside its Pod. The image must be built and
loaded into Minikube, or replaced with an image accessible from a registry.
`IfNotPresent` uses a locally available image before trying to pull it. It does
not notice a rebuilt image with the same tag: load the new image and restart
Pods, or use unique tags/digests for repeatable releases.

### Configuration and credentials

```yaml
envFrom:
  - configMapRef:
      name: my-configmap
env:
  - name: WEATHER_AUTH
    valueFrom:
      secretKeyRef:
        name: weather-server-secret
        key: WEATHER_AUTH
```

`envFrom` imports the ConfigMap keys. `env` supplies one named variable from a
particular Secret key. The Secret must exist in the same namespace; it is created
separately using the root README instructions. A missing required ConfigMap,
Secret, or Secret key prevents the container from starting correctly.

### Listening port

```yaml
ports:
  - name: http
    containerPort: 9999
```

This declares and names the container port. It does not start a listener or
expose the app externally. The application must actually listen on 9999.
Services and probes refer to the name `http`.

### CPU and memory budget

```yaml
resources:
  requests:
    cpu: 100m
    memory: 64Mi
  limits:
    cpu: 500m
    memory: 256Mi
```

Requests guide scheduling: each app Pod requests 0.1 CPU and 64 MiB of memory.
Limits cap CPU at 0.5 CPU and memory at 256 MiB. CPU usage can be throttled;
exceeding the memory limit can cause an out-of-memory kill. These are starting
budgets, not measured sizing recommendations. Redis has the same budget.

### Container restrictions

```yaml
securityContext:
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  capabilities:
    drop: [ALL]
```

This container-level context prevents privilege escalation, makes the image's
root filesystem read-only, and removes Linux capabilities. Mounted writable
volumes remain writable. These settings also appear on Redis.
See [security contexts](https://kubernetes.io/docs/tasks/configure-pod-container/security-context/).

### HTTP probes

Startup and liveness call `/livez`; readiness calls `/readyz` on the named `http` port:

| Probe | Period | Timeout | Failure threshold | Effect |
| --- | --- | --- | --- | --- |
| `startupProbe` | 2 seconds | 2 seconds | 30 | Allows roughly 60 seconds for startup before a restart. |
| `readinessProbe` | 5 seconds | 2 seconds | 1 | Repeated failure marks the Pod unready for ordinary Service traffic. |
| `livenessProbe` | 10 seconds | 2 seconds | 3 (default) | Repeated failure triggers a container restart. |

```yaml
startupProbe:
  httpGet:
    path: /livez
    port: http
  periodSeconds: 2
  timeoutSeconds: 2
  failureThreshold: 30
```

Readiness and liveness use the same `httpGet` structure with their own timing.
They wait until startup succeeds. Probe timing is approximate, not an exact
recovery deadline. `/ping` remains a compatibility HTTP check. `/readyz` reflects explicit readiness
and shutdown state; `/livez` reflects process health. Neither depends on optional
Redis or provider reachability. Demo-only controls can change them independently.
See [probe behavior](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/).

### Temporary writable storage

```yaml
volumeMounts:
  - name: tmp
    mountPath: /tmp
```

This container mount attaches the Pod volume named `tmp` to `/tmp`.

```yaml
volumes:
  - name: tmp
    emptyDir:
      sizeLimit: 32Mi
```

The Pod-level declaration creates temporary storage capped at 32 MiB. It lasts
for the Pod's lifetime, including container restarts, and disappears when the Pod
is removed. This makes `/tmp` writable despite the read-only root filesystem.

## `server-service.yml`: stable app networking

```yaml
metadata:
  name: weather-server-service
spec:
  type: ClusterIP
  selector:
    app: weather-server
  ports:
    - name: http
      protocol: TCP
      port: 80
      targetPort: http
```

`ClusterIP` provides an internal virtual IP and DNS name. The selector finds app
Pods. `port: 80` is the Service port; `targetPort: http` resolves to their named
container port, 9999. `protocol` is TCP; the port's own name is `http`.
Within the namespace, clients can call `http://weather-server-service/ping`.
For local access, use the port-forward command in the root README.

## `redis-deployment.yml`: cache process and persistent data

### One replica and replacement updates

```yaml
metadata:
  name: redis
spec:
  replicas: 1
  strategy:
    type: Recreate
  revisionHistoryLimit: 3
```

One Redis Pod runs. `Recreate` removes old Deployment Pods before creating updated
ones, avoiding overlapping writers during a normal rollout. Redis is unavailable
while its replacement starts. This is not Redis replication or automatic failover.
History retention works as described for the app Deployment.

### Selector and Pod template

```yaml
selector:
  matchLabels:
    name: redis
template:
  metadata:
    labels:
      name: redis
```

The Deployment manages Pods with `name: redis`; the Redis Service also selects
that label. The key `name` here is an arbitrary label key, distinct from
`metadata.name`.

### Pod security and storage group

```yaml
automountServiceAccountToken: false
securityContext:
  runAsNonRoot: true
  runAsUser: 999
  runAsGroup: 1000
  fsGroup: 1000
  fsGroupChangePolicy: OnRootMismatch
  seccompProfile:
    type: RuntimeDefault
```

Redis runs as UID 999 and GID 1000. Token mounting and seccomp work as described
for the app. `fsGroup` requests group access to supported mounted volumes so the
non-root process can write data. `OnRootMismatch` avoids recursive permission
changes when the volume root already matches. Behavior depends on the storage
plugin; verify write access with your provisioner.

### Image, startup command, and port

```yaml
containers:
  - name: redis
    image: redis:7.2-alpine
    command: [redis-server, --appendonly, "yes"]
    ports:
      - name: redis
        containerPort: 6379
```

The Redis 7.2 Alpine image runs `redis-server` with append-only persistence.
Redis writes an append-only log beneath its data directory, `/data`. This helps
restore data after a restart when the volume survives; it does not create a
backup. The tag can change upstream; use a digest for exact image reproducibility.
The named port `redis` is referenced by the Redis Service.

### Resources and container security

Redis uses `100m` CPU / `64Mi` memory requests and `500m` CPU / `256Mi` memory
limits. Its container also disables privilege escalation, makes the root
filesystem read-only, and drops all capabilities. The mounted `/data` volume
remains writable. See the corresponding app sections for each field's meaning.

### Redis probes

```yaml
startupProbe:
  exec:
    command: [redis-cli, ping]
  periodSeconds: 2
  timeoutSeconds: 2
  failureThreshold: 60
```

Unlike the app's HTTP probes, `exec` runs a command inside the Redis container.
Kubernetes checks its exit status. The startup check allows roughly 120 seconds,
including time to load persisted data. Readiness uses the same command every
5 seconds; liveness uses it every 10 seconds. Both have a 2-second timeout and
the default failure threshold of 3. Readiness controls Service eligibility;
liveness restarts an unhealthy container. Neither proves Redis high availability.

### Mounting the PVC

```yaml
volumeMounts:
  - mountPath: /data
    name: redis-data-store
```

The container writes Redis data to `/data`, backed by the named Pod volume.

```yaml
volumes:
  - name: redis-data-store
    persistentVolumeClaim:
      claimName: redis-pv-claim
```

The Pod volume references the PVC in the same namespace. Replacing the Pod does
not itself delete the PVC. Recovery still depends on the backing storage being
available and writable.

## `redis-service.yml`: stable cache address

```yaml
metadata:
  name: redis
spec:
  type: ClusterIP
  ports:
    - name: redis
      targetPort: redis
      port: 6379
      protocol: TCP
  selector:
    name: redis
```

The app connects to DNS name `redis`, port 6379. Kubernetes routes this to ready
Pods labeled `name: redis`, resolving `targetPort: redis` to their named port 6379.
This Service is internal; it does not publish Redis on the host. A ClusterIP is
not an access-control policy: other reachable cluster workloads may connect.

## `redis-pvc.yml`: requesting storage

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: redis-pv-claim
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 500Mi
```

The PVC requests at least 500 MiB of storage. `ReadWriteOnce` allows a read-write
mount from one node; it does not guarantee a single Pod writer on that node.
There is no `storageClassName`, so a default StorageClass can be assigned.

In the Minikube cluster inspected for this project, `standard` is the default
and uses `k8s.io/minikube-hostpath`. Its provisioner creates a PV and binds it
to this claim, so no separate PV manifest is needed. This is still local node
storage, not storage replicated between nodes. Check the current configuration:

```sh
kubectl get storageclass
kubectl -n weather get pvc
kubectl get pv
```

Deleting a Pod is different from deleting the PVC. The inspected StorageClass
uses reclaim policy `Delete`, so deleting the claim can also remove its backing
storage. Preserve existing bound claims; changing storage class requires a
separate migration. See [persistent volumes](https://kubernetes.io/docs/concepts/storage/persistent-volumes/).

## `kustomization.yaml`: assembling the deployment

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - server-configmap.yml
  - server-deployment.yml
  - server-service.yml
  - redis-pvc.yml
  - redis-deployment.yml
  - redis-service.yml
  - server-pdb.yml
```

This is Kustomize input, processed locally by kubectl. It is not an ordinary
resource sent directly to the Kubernetes API. `resources` lists files to include;
paths are relative to this directory. The base also includes `server-pdb.yml` with `minAvailable: 2` for app Pods.
The Secret and namespace are external prerequisites, and the example PV is excluded.

```sh
# Render the combined manifests without changing the cluster.
kubectl kustomize deployment/k8s

# Ask the API server to validate without saving these resources.
kubectl -n weather apply --dry-run=server -k deployment/k8s

# Create or update the resources.
kubectl -n weather apply -k deployment/k8s
```

`-k` tells kubectl to build the Kustomization first. Listing resources does not
wait for each to become healthy before processing the next; controllers
reconcile them afterward. See [Kustomize documentation](https://kubernetes.io/docs/tasks/manage-kubernetes-objects/kustomization/).

## `examples/redis-pv.yml.example`: former manual storage setup

This preserved example is excluded from Kustomize. The `.example` suffix signals
that it is reference material; explicitly applying it with `-f` could still
create a resource.

```yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: redis-volume
  labels:
    type: local
spec:
  storageClassName: manual
  capacity:
    storage: 1Gi
  accessModes:
    - ReadWriteOnce
  hostPath:
    path: "/home/dev/redis_data"
```

- `PersistentVolume` represents storage supplied by an administrator.
- `metadata.name` identifies the PV across the cluster.
- `type: local` is only a label; it does not configure a Kubernetes local volume.
- `storageClassName: manual` identifies the class expected by matching claims;
  the name alone does not create a StorageClass or provisioner.
- `capacity.storage` advertises 1 GiB; hostPath does not enforce a disk quota.
- `accessModes` advertises a read-write mount from one node.
- `hostPath.path` points into the filesystem of the node running the Pod. The
  same path on another node may contain different data.

This example has no node affinity to tie scheduling to the machine with the data.
It also omits an explicit reclaim policy, whose PV default is `Retain`.
Using it would require a deliberately matching PVC and suitable directory
permissions. The active PVC instead uses default dynamic provisioning.
