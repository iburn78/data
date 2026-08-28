import platform
import matplotlib.pyplot as plt

def set_KoreanFonts():
    os_ = platform.system()
    if os_ == 'Windows':
        plt.rcParams['font.family'] = ['DejaVu Sans', 'NanumGothic']
    elif os_ == 'Linux':
        plt.rcParams['font.family'] = ['DejaVu Sans', 'Noto Sans CJK JP']
    elif os_ == 'Darwin':   # macOS
        plt.rcParams['font.family'] = ['DejaVu Sans', 'AppleGothic']
    else:
        raise Exception(f"Unsupported OS: {os_}")
    return None