"""Demonstrate a bad-readiness rollout; always undo it in the demo namespace."""
import importlib.util, subprocess, time, json
from pathlib import Path
spec = importlib.util.spec_from_file_location('experiments', Path(__file__).with_name('cluster-experiments.py'))
e = importlib.util.module_from_spec(spec); spec.loader.exec_module(e)
if __name__ == '__main__':
    patch = {'spec':{'template':{'spec':{'containers':[{'name':'weather-server','readinessProbe':{'httpGet':{'path':'/missing-ready','port':'http'}}}]}}}}
    try:
        e.measure('bad-rollout', lambda: e.k('patch','deployment','weather-server-deployment','--type=strategic','-p',json.dumps(patch)), 20)
        pods = e.pods()
        ready = [p for p in pods if any(c['type']=='Ready' and c['status']=='True' for c in p['status']['conditions'])]
        assert len(pods) == 4 and len(ready) == 3, 'Expected 3 healthy old Pods and 1 unready new Pod'
    finally:
        e.k('rollout','undo','deployment/weather-server-deployment'); e.rollout(); e.snapshot('rollout-restored')
