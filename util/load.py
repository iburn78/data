#%% 
from pathlib import Path
import os
import pandas as pd

PROJECTS_DIR = Path(__file__).parent.parent.parent
DATA_DIR = PROJECTS_DIR / 'data'
MARKET_DIR = DATA_DIR / 'market'
os.makedirs(MARKET_DIR, exist_ok=True)
df_krx_path = MARKET_DIR / 'df_krx.feather'
fr_main_db_path = MARKET_DIR / 'financial_reports_main.parquet'
kospi_path = MARKET_DIR / 'kospi.feather'
kosdaq_path = MARKET_DIR / 'kosdaq.feather'
kospi200_path = MARKET_DIR / 'kospi200.feather'
prices_path = MARKET_DIR / 'price_db.feather'
volumes_path = MARKET_DIR / 'volume_db.feather'


def get_df_krx():
    return pd.read_feather(df_krx_path)

def get_fr_main_db():
    return pd.read_parquet(fr_main_db_path)

def get_market_index(name = None):
    index_dict = {
        'KOSPI': kospi_path,
        'KOSDAQ': kosdaq_path,
        'KOSPI200': kospi200_path,
    }
    if name is None:
        return [pd.read_feather(index_dict[k]) for k in index_dict.keys()]
    if name not in index_dict.keys(): 
        raise ValueError(f'Check index name: {name}')
    return pd.read_feather(index_dict[name])

def get_prices():
    return pd.read_feather(prices_path)

def get_volumes():
    return pd.read_feather(volumes_path)

