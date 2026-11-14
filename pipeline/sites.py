"""Landing-site list and shared time grid."""
from datetime import datetime, timedelta, timezone

SITES = [
    # id, Korean name, English name, lat (deg), lon east (deg)
    ("cr1", "연결 능선 CR1", "Connecting Ridge CR1", -89.4679, -137.411),
    ("sr1", "섀클턴 림 SR1", "Shackleton rim SR1", -89.7755, -156.448),
    ("gr1", "드 제를라슈 림 GR1", "de Gerlache rim GR1", -88.6952, -68.2846),
    ("mp1", "말라페르트 봉 MP1", "Malapert peak MP1", -85.9756, -2.11241),
    ("lp1", "라이프니츠 β 고원 LP1", "Leibnitz beta plateau LP1", -85.4596, 31.78053),
    ("im2", "IM-2 Athena 착륙 지점", "IM-2 Athena landing site", -84.7906, 29.1957),
    ("pole", "남극점", "South Pole", -90.0, 0.0),
    ("shk", "섀클턴 크레이터 바닥", "Shackleton crater floor", -89.67, 129.78),
]

T0 = datetime(2026, 11, 1, tzinfo=timezone.utc)
T1 = datetime(2029, 1, 1, tzinfo=timezone.utc)
STEP_H = 1
N_T = int((T1 - T0).total_seconds() // 3600)
MAST_M = 2.0
R_MOON_KM = 1737.4


def iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%MZ")


def times_utc():
    return [iso(T0 + timedelta(hours=i * STEP_H)) for i in range(N_T)]
