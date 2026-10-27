"""Run only against the isolated weather-demo namespace; preserves its PVC."""
import subprocess, json, time, pathlib, datetime, threading
ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results'
OUT.mkdir(exist_ok=True)
def k(*args, check=True):
    return subprocess.run(['kubectl','-n','weather-demo',*args], text=True, capture_output=True, check=check).stdout

def snapshot(label):
    data = {kind: json.loads(k('get',kind,'-o','json')) for kind in ['pods','endpointslices','events','pdb']}
    data['at'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    (OUT / (label+'.json')).write_text(json.dumps(data, indent=2))

def fetch(url, method='GET', body=None):
    code = "const r=await fetch("+json.dumps(url)+", {method:"+json.dumps(method)+",body:"+json.dumps(json.dumps(body) if body is not None else None)+",headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(5000)});console.log(JSON.stringify({status:r.status,body:await r.text()}))"
    return json.loads(k('exec','load','--','node','--input-type=module','-e',code))

def pods():
    return json.loads(k('get','pods','-l','app=weather-server','-o','json'))['items']
def direct(pod, path='/demo/fault'):
    return 'http://'+pod['status']['podIP']+':9999'+path

def rollout(): k('rollout','status','deployment/weather-server-deployment','--timeout=120s')
def scale(n): k('scale','deployment/weather-server-deployment','--replicas='+str(n)); rollout()
def measure(name, fault=None, duration=12):
    stop = threading.Event()
    def observe():
        with (OUT/(name+'-timeline.jsonl')).open('w') as stream:
            while not stop.is_set():
                current = pods()
                row = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'pods': [
                    {'name': pod['metadata']['name'], 'uid': pod['metadata']['uid'],
                     'ready': any(c['type'] == 'Ready' and c['status'] == 'True' for c in pod['status'].get('conditions', [])),
                     'restarts': sum(c['restartCount'] for c in pod['status'].get('containerStatuses', []))}
                    for pod in current]}
                stream.write(json.dumps(row)+'\n'); stream.flush()
                stop.wait(1)
    observer = threading.Thread(target=observe, daemon=True); observer.start()
    handle = (OUT/(name+'.jsonl')).open('w')
    proc = subprocess.Popen(['kubectl','-n','weather-demo','exec','-i','load','--','node','-','http://weather-server-service/api/v1/weather/tehran',str(duration),'5'],stdin=subprocess.PIPE,stdout=handle,stderr=subprocess.STDOUT,text=True)
    proc.stdin.write((ROOT/'tools/load.js').read_text()); proc.stdin.close()
    if fault:
        time.sleep(3)
        (OUT/(name+'-fault.txt')).write_text(datetime.datetime.now(datetime.timezone.utc).isoformat())
        fault()
    try: proc.wait(timeout=duration+15)
    finally: stop.set(); observer.join(timeout=5); handle.close()
    if proc.returncode: raise RuntimeError(name+' load failed')
    snapshot(name)
    stats = {}
    for pod in pods():
        try: stats[pod['metadata']['name']] = fetch(direct(pod, '/demo/stats'))
        except Exception: stats[pod['metadata']['name']] = {'unavailable': True}
    (OUT/(name+'-stats.json')).write_text(json.dumps(stats, indent=2))
    print(name, (OUT/(name+'.jsonl')).read_text().splitlines()[-1], flush=True)

if __name__ == '__main__':
    fetch('http://mock-provider:8080/control?mode=ok','POST')
    scale(3); snapshot('initial')
    try:
        measure('baseline-three')
        for replicas in [1,3]:
            scale(replicas)
            if replicas == 1: measure('baseline-one')
            target = pods()[0]['metadata']['name']
            measure('delete-'+str(replicas), lambda: k('delete','pod',target,'--wait=false'))
            rollout()
        target = pods()[0]
        measure('readiness', lambda: fetch(direct(target),'POST',{'ready':False}))
        fetch(direct(target),'POST',{'ready':True}); rollout()
        measure('liveness', lambda: fetch(direct(target),'POST',{'live':False}), 40)
        rollout()
        target = pods()[0]
        measure('crash', lambda: fetch(direct(target),'POST',{'crash':True}), 15)
        rollout()
        measure('redis-outage', lambda: k('scale','deployment/redis','--replicas=0'))
        k('scale','deployment/redis','--replicas=1'); k('rollout','status','deployment/redis','--timeout=120s')
        fetch('http://weather-server-service/api/v1/weather/tehran')
        measure('provider-error', lambda: fetch('http://mock-provider:8080/control?mode=error','POST'))
        (OUT/'provider-cache-miss.json').write_text(json.dumps(fetch('http://weather-server-service/api/v1/weather/yazd')))
        fetch('http://mock-provider:8080/control?mode=ok','POST'); time.sleep(11)
        fetch('http://weather-server-service/api/v1/weather/tehran')
        measure('provider-slow', lambda: fetch('http://mock-provider:8080/control?mode=slow&delayMs=3000','POST'))
    finally:
        fetch('http://mock-provider:8080/control?mode=ok','POST')
        k('scale','deployment/redis','--replicas=1'); scale(3)
        for pod in pods(): fetch(direct(pod),'POST',{'ready':True,'live':True})
        time.sleep(11)
        snapshot('restored')
