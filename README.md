## Kubernetes Training Project

**A Little Weather API Server working with Redis**

 - Implemented with ExpressJs
 - You can access docker image of project with `azare242/weather-server:latest`


**if you want use docker-compose**, just fill environment section in `deployment/docker-compose.yml`:
```yaml
    environment:
      - PORT=
      - REDIS_HOST=
      - REDIS_PORT=
      - WEATHER_URL=
      - WEATHER_AUTH=
      - REDIS_PAIR_TTL=
```

> for weather i use [ninjas](https://api-ninjas.com/)  api

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
