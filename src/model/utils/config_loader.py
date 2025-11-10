import yaml
from pathlib import Path

def load_config(version: str = "v2"):
    """common.yaml + versiyon.yaml birleştirir"""
    base_dir = Path(__file__).resolve().parents[1] / "config"
    with open(base_dir / "common.yaml") as f:
        common_cfg = yaml.safe_load(f)
    with open(base_dir / f"{version}.yaml") as f:
        version_cfg = yaml.safe_load(f)

    def deep_merge(a, b):
        for k, v in b.items():
            if isinstance(v, dict) and k in a:
                deep_merge(a[k], v)
            elif v is None and k in a:
                a.pop(k, None)  # null gelirse key'i tamamen kaldır
            else:
                a[k] = v
        return a

    return deep_merge(common_cfg, version_cfg)
