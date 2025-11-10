from pathlib import Path

# ROOT: proje kök dizini
ROOT = Path(__file__).resolve().parents[3]

DATA_DIR = ROOT / "data"
MODEL_DIR = ROOT / "models"
REPORT_DIR = ROOT / "reports"
FIG_DIR = REPORT_DIR / "figs"

# Split feature verileri
SPLIT_FEATURES_DIR = DATA_DIR / "processed" / "split_features"

def ensure_dirs():
    """Eğitim öncesi gerekli dizinleri oluşturur."""
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    FIG_DIR.mkdir(parents=True, exist_ok=True)
