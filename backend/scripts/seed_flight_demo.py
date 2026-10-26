"""Seed clearly-labelled demo flight schedules for Travel Mini coursework."""
from datetime import date, datetime, timedelta
from pymongo import MongoClient, ASCENDING
import os
from dotenv import load_dotenv

load_dotenv()
client = MongoClient(os.getenv("MONGO_URI", "mongodb://localhost:27017/"), serverSelectionTimeoutMS=5000)
db = client[os.getenv("MONGO_DB_NAME", "travel_mini")]

AIRPORTS = [
    {"code": "SGN", "name": "Sân bay quốc tế Tân Sơn Nhất", "city": "TP. Hồ Chí Minh", "country": "Việt Nam", "active": True},
    {"code": "HAN", "name": "Sân bay quốc tế Nội Bài", "city": "Hà Nội", "country": "Việt Nam", "active": True},
    {"code": "DAD", "name": "Sân bay quốc tế Đà Nẵng", "city": "Đà Nẵng", "country": "Việt Nam", "active": True},
    {"code": "CXR", "name": "Sân bay quốc tế Cam Ranh", "city": "Nha Trang", "country": "Việt Nam", "active": True},
    {"code": "PQC", "name": "Sân bay quốc tế Phú Quốc", "city": "Phú Quốc", "country": "Việt Nam", "active": True},
    {"code": "HPH", "name": "Sân bay quốc tế Cát Bi", "city": "Hải Phòng", "country": "Việt Nam", "active": True},
    {"code": "VCA", "name": "Sân bay quốc tế Cần Thơ", "city": "Cần Thơ", "country": "Việt Nam", "active": True},
]
AIRPORT = {a["code"]: a for a in AIRPORTS}
ROUTES = [
    ("SGN", "HAN", 125, 1490000), ("HAN", "SGN", 125, 1390000),
    ("SGN", "DAD", 85, 890000), ("DAD", "SGN", 85, 850000),
    ("SGN", "CXR", 65, 790000), ("CXR", "SGN", 65, 750000),
    ("SGN", "PQC", 65, 990000), ("PQC", "SGN", 65, 950000),
    ("HAN", "DAD", 85, 1050000), ("DAD", "HAN", 85, 990000),
    ("SGN", "HPH", 125, 1590000), ("SGN", "VCA", 55, 690000),
]
AIRLINES = [("Vietnam Airlines (DEMO)", "VN"), ("VietJet Air (DEMO)", "VJ"), ("Bamboo Airways (DEMO)", "QH")]

def main():
    db.flight_airports.create_index([("code", ASCENDING)], unique=True)
    db.flight_trips.create_index([("flightCode", ASCENDING)], unique=True)
    db.flight_bookings.create_index([("bookingCode", ASCENDING)], unique=True)
    for airport in AIRPORTS:
        db.flight_airports.update_one({"code": airport["code"]}, {"$set": airport}, upsert=True)
    today = date.today()
    inserted = 0
    for offset in range(0, 61):
        d = today + timedelta(days=offset)
        ds = d.isoformat()
        ymd = d.strftime("%Y%m%d")
        for route_index, (origin, destination, duration, base_price) in enumerate(ROUTES):
            # Two sample departures per route/day; generated fares and schedules are not live inventory.
            for variant in range(2):
                airline_name, airline_code = AIRLINES[(route_index + variant) % len(AIRLINES)]
                dep_hour = 6 + ((route_index * 2 + variant * 5) % 15)
                dep_minute = 10 if variant == 0 else 40
                departure_minutes = dep_hour * 60 + dep_minute
                arrival_minutes = departure_minutes + duration
                arrival_date = (d + timedelta(days=arrival_minutes // 1440)).isoformat()
                arr_minutes = arrival_minutes % 1440
                flight_code = f"TMF-{origin}-{destination}-{ymd}-{variant+1:02d}"
                doc = {
                    "flightCode": flight_code,
                    "airline": airline_name,
                    "airlineCode": airline_code,
                    "flightNumber": f"{airline_code}{100 + route_index * 7 + variant}",
                    "originCode": origin,
                    "originName": AIRPORT[origin]["name"],
                    "originCity": AIRPORT[origin]["city"],
                    "destinationCode": destination,
                    "destinationName": AIRPORT[destination]["name"],
                    "destinationCity": AIRPORT[destination]["city"],
                    "departureDate": ds,
                    "departureTime": f"{dep_hour:02d}:{dep_minute:02d}",
                    "arrivalDate": arrival_date,
                    "arrivalTime": f"{arr_minutes // 60:02d}:{arr_minutes % 60:02d}",
                    "durationMinutes": duration,
                    "stops": 0,
                    "basePrice": base_price + variant * 120000 + (offset % 5) * 25000,
                    "availableSeats": 80,
                    "status": "SCHEDULED",
                    "demoData": True,
                }
                db.flight_trips.update_one({"flightCode": flight_code}, {"$setOnInsert": doc}, upsert=True)
                inserted += 1
    print(f"Database: {db.name}")
    print(f"Airports upserted: {len(AIRPORTS)}")
    print(f"Demo flight schedule records checked/upserted: {inserted}")
    print("WARNING: all flights, fares, airline labels and inventory are demo data; not valid for real booking.")
    client.close()

if __name__ == "__main__":
    main()
