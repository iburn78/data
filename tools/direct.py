# The code below is direct access to data
# 1) KRX via API (currently open market data is not available)
# 2) Naver without API 

import json
from pathlib import Path
import requests
import pandas as pd
from io import StringIO
import re

CONFIG_DIR = Path(__file__).parent.parent.parent / 'config'
with open(CONFIG_DIR / 'KRX_openapi.json', 'r') as json_file:
    KRX_openapi_key = json.load(json_file)['KRX_openapi']

KRX_URL = "https://data-dbg.krx.co.kr/svc/apis/sto/stk_bydd_trd"

def get_date_str():
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://data.krx.co.kr/contents/MDC/MDI/outerLoader/index.cmd'
    }
    url = 'http://data.krx.co.kr/comm/bldAttendant/executeForResourceBundle.cmd?baseName=krx.mdc.i18n.component&key=B128.bld'
    try: 
        r = requests.get(url, headers=headers)
        j = json.loads(r.text)
        return j['result']['output'][0]['max_work_dt']
    except:
        return None

def get_krx_stocks(bas_dd: str) -> list[dict]: # 'yyyymmdd' format
    response = requests.get(
        KRX_URL,
        headers={
            "AUTH_KEY": KRX_openapi_key
        },
        params={"basDd": bas_dd},
        timeout=30,
    )
    if not response.ok:
        raise RuntimeError(
            f"KRX API error {response.status_code}: {response.text}"
        )

    return pd.DataFrame(response.json()["OutBlock_1"])

def naver_data_reader(symbol):
    url = 'https://fchart.stock.naver.com/sise.nhn?timeframe=day&count=6000&requestType=0&symbol='
    r = requests.get(url + symbol)

    data_list = re.findall(r'<item data=\"(.*?)\" />', r.text, re.DOTALL)
    if len(data_list) == 0:
        print(f'"{symbol}" invalid symbol or has no data')
        return pd.DataFrame()
    data = '\n'.join(data_list)
    df = pd.read_csv(StringIO(data), delimiter='|', header=None, dtype={0:str})
    df.columns  = ['Date', 'Open', 'High', 'Low', 'Close', 'Volume']
    df['Date'] = pd.to_datetime(df['Date'], format='%Y%m%d')
    df.set_index('Date', inplace=True)
    df.sort_index(inplace=True)
    df['Change'] = df['Close'].pct_change()
    return df

if __name__ == "__main__":
    date_str = get_date_str()
    krx_stocks = get_krx_stocks(date_str)
    # today data maybe empty
    print(krx_stocks)
    stock_prices = naver_data_reader('005930')
    print(stock_prices)

