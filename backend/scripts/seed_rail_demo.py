"""Seed clearly labelled demo railway trips for Travel Mini coursework."""
from datetime import date, timedelta
import os
from dotenv import load_dotenv
from pymongo import ASCENDING, MongoClient

load_dotenv()
client = MongoClient(os.getenv("MONGO_URI", "mongodb://localhost:27017/"), serverSelectionTimeoutMS=5000)
db = client[os.getenv("MONGO_DB_NAME", "travel_mini")]

STATIONS = [
    {"code": "HNO", "name": "Ga Hà Nội", "city": "Hà Nội", "region": "Miền Bắc", "active": True},
    {"code": "VIN", "name": "Ga Vinh", "city": "Vinh", "region": "Bắc Trung Bộ", "active": True},
    {"code": "HUE", "name": "Ga Huế", "city": "Huế", "region": "Miền Trung", "active": True},
    {"code": "DAN", "name": "Ga Đà Nẵng", "city": "Đà Nẵng", "region": "Miền Trung", "active": True},
    {"code": "DTR", "name": "Ga Diêu Trì", "city": "Quy Nhơn", "region": "Nam Trung Bộ", "active": True},
    {"code": "NTR", "name": "Ga Nha Trang", "city": "Nha Trang", "region": "Nam Trung Bộ", "active": True},
    {"code": "SGN", "name": "Ga Sài Gòn", "city": "TP. Hồ Chí Minh", "region": "Miền Nam", "active": True},
]
STATION = {s["code"]: s for s in STATIONS}

# These are invented schedules/prices for a software demo. High-speed trips are conceptual demo service entries.
ROUTES = [
    ("SGN", "NTR", "STANDARD", 420, 430000),
    ("NTR", "SGN", "STANDARD", 420, 420000),
    ("SGN", "DAN", "STANDARD", 960, 690000),
    ("DAN", "SGN", "STANDARD", 960, 660000),
    ("DAN", "HUE", "STANDARD", 170, 130000),
    ("HUE", "DAN", "STANDARD", 170, 125000),
    ("HNO", "VIN", "STANDARD", 360, 280000),
    ("VIN", "HNO", "STANDARD", 360, 270000),
    ("HNO", "DAN", "STANDARD", 780, 620000),
    ("DAN", "HNO", "STANDARD", 780, 600000),
    ("SGN", "HNO", "STANDARD", 1920, 990000),
    ("HNO", "SGN", "STANDARD", 1920, 960000),
    ("HNO", "DAN", "HIGH_SPEED_DEMO", 300, 1120000),
    ("DAN", "HNO", "HIGH_SPEED_DEMO", 300, 1090000),
    ("SGN", "DAN", "HIGH_SPEED_DEMO", 360, 980000),
    ("DAN", "SGN", "HIGH_SPEED_DEMO", 360, 950000),
    ("HNO", "HUE", "HIGH_SPEED_DEMO", 210, 850000),
    ("HUE", "HNO", "HIGH_SPEED_DEMO", 210, 820000),
]


def main():
    db.rail_stations.create_index([("code", ASCENDING)], unique=True)
    db.rail_trips.create_index([("trainCode", ASCENDING)], unique=True)
    db.rail_bookings.create_index([("bookingCode", ASCENDING)], unique=True)
    for station in STATIONS:
        db.rail_stations.update_one({"code": station["code"]}, {"$set": station}, upsert=True)

    today = date.today()
    trip_count = 0
    for offset in range(0, 46):
        travel_day = today + timedelta(days=offset)
        day_str = travel_day.isoformat()
        ymd = travel_day.strftime("%Y%m%d")
        for route_index, (origin, destination, train_type, duration, base_price) in enumerate(ROUTES):
            # Two departures per day for each route. Times are made-up demo schedules.
            for variant in range(2):
                dep_hour = 5 + ((route_index * 2 + variant * 6) % 17)
                dep_minute = 15 if variant == 0 else 45
                dep_total = dep_hour * 60 + dep_minute
                arr_total = dep_total + duration
                arrival_date = (travel_day + timedelta(days=arr_total // 1440)).isoformat()
                arr_mod = arr_total % 1440
                service_number = ("HSR" if train_type == "HIGH_SPEED_DEMO" else "SE") + f"{100 + route_index * 3 + variant}"
                train_code = f"TMR-{origin}-{destination}-{ymd}-{train_type[:2]}-{variant + 1}"
                if train_type == "HIGH_SPEED_DEMO":
                    operator = "Travel Mini High-Speed (DEMO)"
                    type_label = "Tàu cao tốc đường sắt (DEMO)"
                else:
                    operator = "Đường sắt mô phỏng"
                    type_label = "Tàu hỏa (DEMO)"
                doc = {
                    "trainCode": train_code,
                    "trainType": train_type,
                    "trainTypeLabel": type_label,
                    "operator": operator,
                    "serviceNumber": service_number,
                    "originCode": origin,
                    "originName": STATION[origin]["name"],
                    "originCity": STATION[origin]["city"],
                    "destinationCode": destination,
                    "destinationName": STATION[destination]["name"],
                    "destinationCity": STATION[destination]["city"],
                    "departureDate": day_str,
                    "departureTime": f"{dep_hour:02d}:{dep_minute:02d}",
                    "arrivalDate": arrival_date,
                    "arrivalTime": f"{arr_mod // 60:02d}:{arr_mod % 60:02d}",
                    "durationMinutes": duration,
                    "basePrice": base_price + variant * 45000 + (offset % 5) * 12000,
                    "availableSeats": 120 if train_type == "HIGH_SPEED_DEMO" else 80,
                    "status": "SCHEDULED",
                    "demoData": True,
                }
                db.rail_trips.update_one({"trainCode": train_code}, {"$setOnInsert": doc}, upsert=True)
                trip_count += 1
    print(f"Database: {db.name}")
    print(f"Rail stations upserted: {len(STATIONS)}")
    print(f"Demo rail trips checked/upserted: {trip_count}")
    print("IMPORTANT: all train schedules, high-speed services, operators, fares and inventory are fabricated demo data, not live services.")
    client.close()


if __name__ == "__main__":
    main()
