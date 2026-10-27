"""Use a dry-run eviction request; restore three replicas afterward."""
import importlib.util, json, subprocess, time
from pathlib import Path
spec = importlib.util.spec_from_file_location('experiments', Path(__file__).with_name('cluster-experiments.py'))
e = importlib.util.module_from_spec(spec); spec.loader.exec_module(e)
try:
    e.scale(2)
    for _ in range(20):
        budget = json.loads(e.k('get','pdb','weather-server','-o','json'))
        if budget['status'].get('currentHealthy') == 2 and budget['status'].get('disruptionsAllowed') == 0: break
        time.sleep(1)
    else: raise RuntimeError('PDB did not reach expected status')
    name = next(p['metadata']['name'] for p in e.pods() if not p['metadata'].get('deletionTimestamp') and any(c['type'] == 'Ready' and c['status'] == 'True' for c in p['status']['conditions']))
    result = subprocess.run(['kubectl','create','--raw',f'/api/v1/namespaces/weather-demo/pods/{name}/eviction?dryRun=All','-f','-'],input=json.dumps({'apiVersion':'policy/v1','kind':'Eviction','metadata':{'name':name,'namespace':'weather-demo'}}),text=True,capture_output=True)
    (e.OUT/'pdb-eviction.txt').write_text(result.stdout+result.stderr)
    assert result.returncode != 0 and 'disruption budget' in result.stderr.lower(), result.stderr
    e.snapshot('pdb-blocked')
finally:
    e.scale(3); e.snapshot('final')
