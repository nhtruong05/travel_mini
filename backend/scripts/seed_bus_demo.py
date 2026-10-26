"""Seed local demo data for Travel Mini bus-ticket booking.

Run from backend/: python scripts/seed_bus_demo.py
This script upserts demo data and does not delete users or existing non-demo trips.
All prices are one ticket price per trip: no fare classes are created.
"""
import os
from datetime import date, datetime, time, timedelta, timezone

from dotenv import load_dotenv
from pymongo import MongoClient, ASCENDING, UpdateOne

load_dotenv()
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
DB_NAME = os.getenv("MONGO_DB_NAME", "travel_mini")
client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000, tz_aware=True)
db = client[DB_NAME]
LOCAL_TZ = timezone(timedelta(hours=7))
UTC = timezone.utc

LOCATIONS = [
    {"_id": "SG-BUS", "code": "SG-BUS", "name": "Bến xe Miền Đông mới", "city": "TP. Hồ Chí Minh", "type": "BUS_STATION", "transport": "BUS", "aliases": ["TPHCM", "TP HCM", "Sài Gòn", "Ho Chi Minh City", "Miền Đông mới"], "linkedLocationCodes": [], "latitude": 10.881, "longitude": 106.813},
    {"_id": "DN-BUS", "code": "DN-BUS", "name": "Bến xe Đà Nẵng", "city": "Đà Nẵng", "type": "BUS_STATION", "transport": "BUS", "aliases": ["Da Nang", "Đà Nẵng city"], "linkedLocationCodes": [], "latitude": 16.070, "longitude": 108.214},
    {"_id": "CTH-BUS", "code": "CTH-BUS", "name": "Bến xe Trung tâm Cần Thơ", "city": "Cần Thơ", "type": "BUS_STATION", "transport": "BUS", "aliases": ["Can Tho", "Cần Thơ city"], "linkedLocationCodes": [], "latitude": 10.045, "longitude": 105.746},
    {"_id": "HN-BUS", "code": "HN-BUS", "name": "Bến xe Giáp Bát", "city": "Hà Nội", "type": "BUS_STATION", "transport": "BUS", "aliases": ["Ha Noi", "Hà Nội city", "Giáp Bát"], "linkedLocationCodes": [], "latitude": 20.980, "longitude": 105.841},
    {"_id": "HPH-BUS", "code": "HPH-BUS", "name": "Bến xe Niệm Nghĩa", "city": "Hải Phòng", "type": "BUS_STATION", "transport": "BUS", "aliases": ["Hai Phong", "Hải Phòng city"], "linkedLocationCodes": [], "latitude": 20.844, "longitude": 106.674},
    {"_id": "DL-BUS", "code": "DL-BUS", "name": "Bến xe liên tỉnh Đà Lạt", "city": "Đà Lạt", "type": "BUS_STATION", "transport": "BUS", "aliases": ["Da Lat", "Lâm Đồng"], "linkedLocationCodes": [], "latitude": 11.946, "longitude": 108.441},
    {"_id": "VT-BUS", "code": "VT-BUS", "name": "Bến xe Vũng Tàu", "city": "Vũng Tàu", "type": "BUS_STATION", "transport": "BUS", "aliases": ["Vung Tau", "Bà Rịa - Vũng Tàu"], "linkedLocationCodes": [], "latitude": 10.411, "longitude": 107.136},
    {"_id": "HUE-BUS", "code": "HUE-BUS", "name": "Bến xe phía Bắc Huế", "city": "Huế", "type": "BUS_STATION", "transport": "BUS", "aliases": ["Hue", "Thừa Thiên Huế"], "linkedLocationCodes": [], "latitude": 16.479, "longitude": 107.588},
    {"_id": "LOC-HOI-AN", "code": "LOC-HOI-AN", "name": "Phố cổ Hội An", "city": "Hội An", "type": "PLACE", "transport": "BUS", "aliases": ["Hoi An", "Hội An", "Phố cổ", "Hoi An Ancient Town"], "linkedLocationCodes": ["DN-BUS"], "nearestStationName": "Bến xe Đà Nẵng", "estimatedDistanceKm": 30, "latitude": 15.880, "longitude": 108.338},
    {"_id": "LOC-BA-NA", "code": "LOC-BA-NA", "name": "Khu du lịch Bà Nà Hills", "city": "Đà Nẵng", "type": "PLACE", "transport": "BUS", "aliases": ["Ba Na Hills", "Bà Nà", "Bana Hills"], "linkedLocationCodes": ["DN-BUS"], "nearestStationName": "Bến xe Đà Nẵng", "estimatedDistanceKm": 35, "latitude": 15.997, "longitude": 107.988},
    {"_id": "LOC-SUN-WORLD-VT", "code": "LOC-SUN-WORLD-VT", "name": "Bãi Sau Vũng Tàu", "city": "Vũng Tàu", "type": "PLACE", "transport": "BUS", "aliases": ["Bai Sau", "Bãi Sau", "Thùy Vân"], "linkedLocationCodes": ["VT-BUS"], "nearestStationName": "Bến xe Vũng Tàu", "estimatedDistanceKm": 4, "latitude": 10.334, "longitude": 107.087},
]

PROVIDERS = [
    {"_id": "PROVIDER-TM-DEMO", "code": "TM-DEMO", "name": "Travel Mini Express", "transport": "BUS", "phone": "1900 1000", "status": "ACTIVE", "demoSeed": True},
    {"_id": "PROVIDER-MINH-AN", "code": "MINH-AN", "name": "Minh An Bus", "transport": "BUS", "phone": "1900 2000", "status": "ACTIVE", "demoSeed": True},
    {"_id": "PROVIDER-AN-PHU", "code": "AN-PHU", "name": "An Phú Limousine", "transport": "BUS", "phone": "1900 3000", "status": "ACTIVE", "demoSeed": True},
]

ROUTES = [
    ("SG-BUS", "DN-BUS", 620, 390000, "SLEEPER_SINGLE"),
    ("DN-BUS", "SG-BUS", 620, 390000, "SLEEPER_SINGLE"),
    ("SG-BUS", "CTH-BUS", 210, 180000, "LIMOUSINE_SEAT"),
    ("CTH-BUS", "SG-BUS", 210, 180000, "LIMOUSINE_SEAT"),
    ("HN-BUS", "HPH-BUS", 130, 150000, "LIMOUSINE_SEAT"),
    ("HPH-BUS", "HN-BUS", 130, 150000, "LIMOUSINE_SEAT"),
    ("SG-BUS", "DL-BUS", 420, 300000, "SLEEPER_DOUBLE"),
    ("DL-BUS", "SG-BUS", 420, 300000, "SLEEPER_DOUBLE"),
    ("SG-BUS", "VT-BUS", 150, 170000, "LIMOUSINE_SEAT"),
    ("VT-BUS", "SG-BUS", 150, 170000, "LIMOUSINE_SEAT"),
    ("HN-BUS", "HUE-BUS", 720, 420000, "SLEEPER_SINGLE"),
    ("HUE-BUS", "HN-BUS", 720, 420000, "SLEEPER_SINGLE"),
]


def upsert_docs(collection, docs, preserve_existing=()):
    """Bulk-upsert demo data without resetting transaction-owned fields on re-run."""
    preserve_existing = set(preserve_existing)
    operations = []
    for doc in docs:
        updates = {key: value for key, value in doc.items() if key not in preserve_existing}
        set_on_insert = {key: doc[key] for key in preserve_existing if key in doc}
        update = {"$set": updates}
        if set_on_insert:
            update["$setOnInsert"] = set_on_insert
        operations.append(UpdateOne({"_id": doc["_id"]}, update, upsert=True))
    for start in range(0, len(operations), 500):
        collection.bulk_write(operations[start:start + 500], ordered=False)


def seat_layout(trip_id, seat_kind):
    result = []
    if seat_kind == "LIMOUSINE_SEAT":
        rows, cols, total = 6, 3, 18
    elif seat_kind == "SLEEPER_DOUBLE":
        rows, cols, total = 6, 4, 24
    else:
        rows, cols, total = 8, 4, 32
    for index in range(1, total + 1):
        row = (index - 1) // cols + 1
        col = (index - 1) % cols + 1
        if seat_kind == "LIMOUSINE_SEAT":
            seat_no = f"L{index:02d}"
        elif seat_kind == "SLEEPER_DOUBLE":
            seat_no = f"D{index:02d}"
        else:
            seat_no = f"A{index:02d}"
        result.append({"_id": f"{trip_id}-{seat_no}", "tripId": trip_id, "seatNumber": seat_no,
                       "seatType": seat_kind, "row": row, "column": col, "deck": 1,
                       "coach": "A", "status": "AVAILABLE", "demoSeed": True})
    return result


def main():
    upsert_docs(db.locations, LOCATIONS)
    upsert_docs(db.providers, PROVIDERS, preserve_existing=("status",))
    location_by_code = {d["code"]: d for d in LOCATIONS}
    provider_list = PROVIDERS
    today = datetime.now(LOCAL_TZ).date()
    trips, fares, seats, vehicles, route_docs = [], [], [], [], []
    for route_index, (origin_code, destination_code, duration, base_price, seat_kind) in enumerate(ROUTES):
        origin = location_by_code[origin_code]
        destination = location_by_code[destination_code]
        route_id = f"ROUTE-{origin_code}-{destination_code}"
        route_docs.append({"_id": route_id, "routeCode": route_id, "transport": "BUS", "originCode": origin_code,
                           "destinationCode": destination_code, "originLocationId": origin_code,
                           "destinationLocationId": destination_code, "originName": origin["name"], "destinationName": destination["name"],
                           "originCity": origin["city"], "destinationCity": destination["city"], "status": "ACTIVE", "demoSeed": True})
        for variant, provider in enumerate(provider_list[:2] if route_index % 3 else provider_list):
            vehicle_id = f"VEH-{provider['code']}-{seat_kind}-{origin_code}-{destination_code}"
            vehicle_type = {"SLEEPER_SINGLE": "Xe giường nằm đơn", "SLEEPER_DOUBLE": "Xe giường nằm đôi", "LIMOUSINE_SEAT": "Limousine"}[seat_kind]
            seat_total = {"SLEEPER_SINGLE": 32, "SLEEPER_DOUBLE": 24, "LIMOUSINE_SEAT": 18}[seat_kind]
            vehicles.append({"_id": vehicle_id, "vehicleCode": vehicle_id, "providerId": provider["_id"], "transport": "BUS",
                             "vehicleType": vehicle_type, "seatCapacity": seat_total, "seatLayout": seat_kind, "status": "ACTIVE", "demoSeed": True})
            for day_offset in range(0, 15):
                travel_day = today + timedelta(days=day_offset)
                # Local Vietnam departure time; MongoClient stores timezone-aware UTC datetimes.
                local_hour = [6, 8, 20, 22][(day_offset + variant + route_index) % 4]
                if route_index in (2, 3, 4, 5, 8, 9):
                    local_hour = [6, 9, 15, 18][(day_offset + variant) % 4]
                local_departure = datetime.combine(travel_day, time(local_hour, (variant * 15) % 60), tzinfo=LOCAL_TZ)
                if local_departure <= datetime.now(LOCAL_TZ):
                    continue
                departure_utc = local_departure.astimezone(UTC)
                arrival_utc = (local_departure + timedelta(minutes=duration)).astimezone(UTC)
                trip_id = f"BUS-{origin_code}-{destination_code}-{travel_day:%Y%m%d}-{provider['code']}-{variant+1}"
                price = base_price + variant * (25000 if seat_kind == "LIMOUSINE_SEAT" else 30000) + ((day_offset % 3) * 10000)
                trip = {
                    "_id": trip_id, "tripCode": trip_id, "transport": "BUS", "routeId": route_id,
                    "vehicleId": vehicle_id, "providerId": provider["_id"], "provider": provider["name"],
                    "providerLogoText": "TM" if variant == 0 else provider["name"][:2].upper(),
                    "originCode": origin_code, "originLocationId": origin_code, "originName": origin["name"], "originCity": origin["city"],
                    "destinationCode": destination_code, "destinationLocationId": destination_code,
                    "destinationName": destination["name"], "destinationCity": destination["city"],
                    "departureAt": departure_utc, "arrivalAt": arrival_utc, "departureDate": travel_day.isoformat(),
                    "departureHour": local_hour, "durationMinutes": duration, "stops": 0,
                    "vehicleType": vehicle_type, "seatCapacity": seat_total, "basePrice": price,
                    "status": "SCHEDULED", "recommendedScore": 100 - variant * 3 + (14 - day_offset),
                    "changePolicy": "Yêu cầu đổi vé được xét theo chính sách nhà xe trước giờ khởi hành.",
                    "refundPolicy": "Yêu cầu hoàn vé được xét theo chính sách nhà xe; số tiền hoàn cần được xác nhận.",
                    "demoSeed": True,
                }
                trips.append(trip)
                fares.append({"_id": f"FARE-{trip_id}", "tripId": trip_id, "price": price,
                              "currency": "VND", "changePolicy": trip["changePolicy"], "refundPolicy": trip["refundPolicy"],
                              "effectiveFrom": departure_utc - timedelta(days=60), "effectiveTo": arrival_utc + timedelta(days=60),
                              "demoSeed": True})
                seats.extend(seat_layout(trip_id, seat_kind))
    upsert_docs(db.routes, route_docs, preserve_existing=("status",))
    upsert_docs(db.vehicles, vehicles, preserve_existing=("status",))
    upsert_docs(db.trips, trips, preserve_existing=("status",))
    upsert_docs(db.fares, fares)
    # Re-seeding must never reset a sold/held seat to AVAILABLE.
    upsert_docs(db.seats, seats, preserve_existing=("status", "holdId", "heldUntil", "bookingCode"))

    now = datetime.now(UTC)
    promotion_fields = {
        "code": "TM10BUS", "scope": "BUS", "discountType": "PERCENT", "discountValue": 10,
        "maxDiscount": 50000, "minimumAmount": 100000, "startAt": now - timedelta(days=1), "endAt": now + timedelta(days=180),
        "usageLimit": 1000, "demoSeed": True,
    }
    db.promotions.update_one({"_id": "PROMO-TM10BUS"}, {
        "$set": promotion_fields,
        "$setOnInsert": {"_id": "PROMO-TM10BUS", "usedCount": 0, "status": "ACTIVE"},
    }, upsert=True)

    db.locations.create_index([("transport", ASCENDING), ("city", ASCENDING), ("name", ASCENDING)])
    db.providers.create_index([("transport", ASCENDING), ("status", ASCENDING)])
    db.vehicles.create_index([("providerId", ASCENDING), ("status", ASCENDING)])
    db.routes.create_index([("originCode", ASCENDING), ("destinationCode", ASCENDING)])
    db.trips.create_index([("transport", ASCENDING), ("departureDate", ASCENDING), ("destinationCode", ASCENDING), ("status", ASCENDING)])
    db.trips.create_index([("routeId", ASCENDING), ("departureAt", ASCENDING)])
    db.fares.create_index([("tripId", ASCENDING), ("price", ASCENDING)])
    db.seats.create_index([("tripId", ASCENDING), ("seatNumber", ASCENDING)], unique=True)
    db.seats.create_index([("status", ASCENDING), ("heldUntil", ASCENDING)])
    db.seat_holds.create_index("expiresAt", expireAfterSeconds=0)
    db.seat_holds.create_index([("sessionId", ASCENDING), ("status", ASCENDING)])
    db.bookings.create_index("bookingCode", unique=True, sparse=True)
    db.bookings.create_index("holdId", unique=True, partialFilterExpression={"holdId": {"$type": "string"}})
    db.bookings.create_index([("userId", ASCENDING), ("createdAt", -1)])
    db.tickets.create_index("ticketCode", unique=True, sparse=True)
    db.tickets.create_index([("bookingId", ASCENDING)])
    db.payments.create_index("transactionCode", unique=True, sparse=True)
    db.payments.create_index([("bookingId", ASCENDING), ("status", ASCENDING)])
    db.refunds.create_index([("bookingId", ASCENDING), ("status", ASCENDING)])
    db.promotions.create_index("code", unique=True)
    db.reviews.create_index([("userId", ASCENDING), ("tripId", ASCENDING), ("bookingId", ASCENDING)], unique=True, partialFilterExpression={"userId": {"$exists": True}, "tripId": {"$exists": True}, "bookingId": {"$exists": True}})

    print(f"Database: {DB_NAME}")
    print(f"Locations upserted: {len(LOCATIONS)}")
    print(f"Providers upserted: {len(PROVIDERS)}")
    print(f"Routes upserted: {len(route_docs)}")
    print(f"Demo vehicles upserted: {len(vehicles)}")
    print(f"Demo trips upserted: {len(trips)}")
    print(f"Single ticket-price records upserted: {len(fares)} (no fare classes)")
    print(f"Seat records upserted: {len(seats)}")
    print("Promotion code: TM10BUS")
    print("Demo data only. Review before using in production.")
    client.close()


if __name__ == "__main__":
    main()
