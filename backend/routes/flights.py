"""Demo flight-search and booking API for Travel Mini.

IMPORTANT: flight schedules, availability, airline names and fares are sample data.
This module is for coursework/local testing, not a live airline inventory integration.
"""
from __future__ import annotations

import re
import secrets
from datetime import datetime, timezone
from flask import Blueprint, jsonify, request
from pymongo import ReturnDocument

flights_bp = Blueprint("flights", __name__, url_prefix="/api/flights")


def get_db():
    from app import db
    return db


def json_error(message, status=400, **extra):
    body = {"success": False, "message": message}
    body.update(extra)
    return jsonify(body), status


def iso(value):
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    return value


def public_flight(doc):
    if not doc:
        return None
    return {
        "id": str(doc.get("flightCode", doc.get("_id", ""))),
        "flightCode": doc.get("flightCode", ""),
        "airline": doc.get("airline", "Hãng bay mô phỏng"),
        "airlineCode": doc.get("airlineCode", "TM"),
        "flightNumber": doc.get("flightNumber", ""),
        "originCode": doc.get("originCode", ""),
        "originName": doc.get("originName", ""),
        "originCity": doc.get("originCity", ""),
        "destinationCode": doc.get("destinationCode", ""),
        "destinationName": doc.get("destinationName", ""),
        "destinationCity": doc.get("destinationCity", ""),
        "departureDate": doc.get("departureDate", ""),
        "departureTime": doc.get("departureTime", ""),
        "arrivalDate": doc.get("arrivalDate", ""),
        "arrivalTime": doc.get("arrivalTime", ""),
        "durationMinutes": int(doc.get("durationMinutes", 0)),
        "stops": int(doc.get("stops", 0)),
        "basePrice": int(doc.get("basePrice", 0)),
        "availableSeats": int(doc.get("availableSeats", 0)),
        "demoData": True,
    }


def public_booking(doc):
    if not doc:
        return None
    return {
        "bookingCode": doc.get("bookingCode", ""),
        "flightCode": doc.get("flightCode", ""),
        "airline": doc.get("airline", ""),
        "flightNumber": doc.get("flightNumber", ""),
        "originCode": doc.get("originCode", ""),
        "originName": doc.get("originName", ""),
        "destinationCode": doc.get("destinationCode", ""),
        "destinationName": doc.get("destinationName", ""),
        "departureDate": doc.get("departureDate", ""),
        "departureTime": doc.get("departureTime", ""),
        "arrivalDate": doc.get("arrivalDate", ""),
        "arrivalTime": doc.get("arrivalTime", ""),
        "passengerCount": int(doc.get("passengerCount", 0)),
        "passengers": doc.get("passengers", []),
        "contactName": doc.get("contactName", ""),
        "contactEmail": doc.get("contactEmail", ""),
        "contactPhone": doc.get("contactPhone", ""),
        "totalAmount": int(doc.get("totalAmount", 0)),
        "status": doc.get("status", "PENDING_PAYMENT"),
        "paymentStatus": doc.get("paymentStatus", "PENDING"),
        "ticketCode": doc.get("ticketCode"),
        "qrPayload": doc.get("qrPayload"),
        "createdAt": iso(doc.get("createdAt")),
        "demoData": True,
    }


@flights_bp.get("/health")
def health():
    try:
        db = get_db()
        db.command("ping")
        return jsonify({"success": True, "message": "Flight API is running", "database": "connected", "mode": "DEMO_DATA"})
    except Exception:
        return json_error("Không kết nối được cơ sở dữ liệu.", 503)


@flights_bp.get("/airports")
def airports():
    query = str(request.args.get("q", "")).strip().lower()
    db = get_db()
    criteria = {"active": {"$ne": False}}
    docs = list(db.flight_airports.find(criteria).sort([("city", 1), ("code", 1)]))
    if query:
        docs = [d for d in docs if query in str(d.get("code", "")).lower() or query in str(d.get("name", "")).lower() or query in str(d.get("city", "")).lower()]
    return jsonify({"success": True, "items": [{"code": d.get("code", ""), "name": d.get("name", ""), "city": d.get("city", ""), "country": d.get("country", "Việt Nam")} for d in docs]})


@flights_bp.get("/search")
def search_flights():
    origin = str(request.args.get("origin", "")).upper().strip()
    destination = str(request.args.get("destination", "")).upper().strip()
    travel_date = str(request.args.get("date", "")).strip()
    try:
        passengers = int(request.args.get("passengers", "1"))
    except ValueError:
        return json_error("Số hành khách không hợp lệ.")
    if not re.fullmatch(r"[A-Z]{3}", origin) or not re.fullmatch(r"[A-Z]{3}", destination):
        return json_error("Vui lòng chọn sân bay đi và sân bay đến từ danh sách.")
    if origin == destination:
        return json_error("Sân bay đi và sân bay đến phải khác nhau.")
    try:
        datetime.strptime(travel_date, "%Y-%m-%d")
    except ValueError:
        return json_error("Ngày bay không hợp lệ.")
    if not 1 <= passengers <= 9:
        return json_error("Số hành khách phải từ 1 đến 9.")
    db = get_db()
    docs = list(db.flight_trips.find({
        "originCode": origin,
        "destinationCode": destination,
        "departureDate": travel_date,
        "status": "SCHEDULED",
        "availableSeats": {"$gte": passengers},
    }).sort([("departureTime", 1), ("basePrice", 1)]))
    airports_by_code = {d.get("code"): d for d in db.flight_airports.find({"code": {"$in": [origin, destination]}})}
    return jsonify({
        "success": True,
        "mode": "DEMO_DATA",
        "message": "Đây là chuyến bay và giá vé mô phỏng dùng để kiểm thử đồ án, không phải dữ liệu đặt chỗ thực tế.",
        "query": {"origin": origin, "destination": destination, "date": travel_date, "passengers": passengers},
        "origin": airports_by_code.get(origin, {}).get("city", origin),
        "destination": airports_by_code.get(destination, {}).get("city", destination),
        "items": [public_flight(d) for d in docs],
    })


@flights_bp.get("/trips/<flight_code>")
def flight_detail(flight_code):
    doc = get_db().flight_trips.find_one({"flightCode": flight_code, "status": "SCHEDULED"})
    if not doc:
        return json_error("Không tìm thấy chuyến bay hoặc chuyến bay không còn mở bán.", 404)
    return jsonify({"success": True, "item": public_flight(doc)})


@flights_bp.post("/bookings")
def create_booking():
    data = request.get_json(silent=True) or {}
    flight_code = str(data.get("flightCode", "")).strip()
    try:
        count = int(data.get("passengerCount", 0))
    except (TypeError, ValueError):
        return json_error("Số hành khách không hợp lệ.")
    passengers = data.get("passengers")
    if not isinstance(passengers, list) or len(passengers) != count or not 1 <= count <= 9:
        return json_error("Vui lòng nhập đầy đủ thông tin từng hành khách.")
    clean_passengers = []
    for index, p in enumerate(passengers, 1):
        if not isinstance(p, dict) or not str(p.get("fullName", "")).strip():
            return json_error(f"Vui lòng nhập họ tên hành khách số {index}.")
        clean_passengers.append({"fullName": str(p.get("fullName", "")).strip(), "documentNumber": str(p.get("documentNumber", "")).strip()})
    contact_name = str(data.get("contactName", "")).strip()
    contact_email = str(data.get("contactEmail", "")).strip()
    contact_phone = str(data.get("contactPhone", "")).strip()
    if not contact_name or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", contact_email) or not contact_phone:
        return json_error("Vui lòng nhập tên, email và số điện thoại liên hệ hợp lệ.")
    db = get_db()
    flight = db.flight_trips.find_one_and_update(
        {"flightCode": flight_code, "status": "SCHEDULED", "availableSeats": {"$gte": count}},
        {"$inc": {"availableSeats": -count}},
        return_document=ReturnDocument.AFTER,
    )
    if not flight:
        return json_error("Chuyến bay không còn đủ chỗ. Hãy tìm lại chuyến bay.", 409)
    now = datetime.now(timezone.utc)
    booking_code = "TMF-" + now.strftime("%y%m%d") + "-" + secrets.token_hex(3).upper()
    booking = {
        "_id": booking_code,
        "bookingCode": booking_code,
        "flightCode": flight_code,
        "airline": flight.get("airline", "Hãng bay mô phỏng"),
        "flightNumber": flight.get("flightNumber", ""),
        "originCode": flight.get("originCode", ""),
        "originName": flight.get("originName", ""),
        "destinationCode": flight.get("destinationCode", ""),
        "destinationName": flight.get("destinationName", ""),
        "departureDate": flight.get("departureDate", ""),
        "departureTime": flight.get("departureTime", ""),
        "arrivalDate": flight.get("arrivalDate", ""),
        "arrivalTime": flight.get("arrivalTime", ""),
        "passengerCount": count,
        "passengers": clean_passengers,
        "contactName": contact_name,
        "contactEmail": contact_email,
        "contactPhone": contact_phone,
        "unitPrice": int(flight.get("basePrice", 0)),
        "totalAmount": int(flight.get("basePrice", 0)) * count,
        "status": "PENDING_PAYMENT",
        "paymentStatus": "PENDING",
        "paymentProvider": "DEMO",
        "createdAt": now,
    }
    try:
        db.flight_bookings.insert_one(booking)
    except Exception:
        db.flight_trips.update_one({"flightCode": flight_code}, {"$inc": {"availableSeats": count}})
        raise
    return jsonify({"success": True, "mode": "DEMO_DATA", "item": public_booking(booking)}), 201


@flights_bp.post("/bookings/<booking_code>/demo-payment")
def demo_payment(booking_code):
    """Simulate a successful payment for local coursework only; never moves real money."""
    db = get_db()
    booking = db.flight_bookings.find_one({"bookingCode": booking_code})
    if not booking:
        return json_error("Không tìm thấy đơn đặt vé.", 404)
    if booking.get("paymentStatus") == "PAID":
        return jsonify({"success": True, "mode": "DEMO_DATA", "item": public_booking(booking)})
    ticket_code = "TMFT-" + secrets.token_hex(4).upper()
    qr_payload = f"TRAVELMINI-FLIGHT|{booking_code}|{booking.get('flightCode')}|{ticket_code}"
    db.flight_bookings.update_one({"bookingCode": booking_code, "paymentStatus": "PENDING"}, {"$set": {
        "status": "CONFIRMED", "paymentStatus": "PAID_DEMO", "ticketCode": ticket_code,
        "qrPayload": qr_payload, "paidAt": datetime.now(timezone.utc), "paymentProvider": "DEMO",
    }})
    updated = db.flight_bookings.find_one({"bookingCode": booking_code})
    return jsonify({"success": True, "mode": "DEMO_DATA", "message": "Thanh toán mô phỏng thành công; không có tiền thật được chuyển.", "item": public_booking(updated)})


@flights_bp.get("/bookings/<booking_code>")
def get_booking(booking_code):
    doc = get_db().flight_bookings.find_one({"bookingCode": booking_code})
    if not doc:
        return json_error("Không tìm thấy đơn đặt vé.", 404)
    return jsonify({"success": True, "item": public_booking(doc)})


@flights_bp.get("/bookings")
def list_bookings():
    email = str(request.args.get("email", "")).strip().lower()
    if not email:
        return json_error("Cần email liên hệ để tìm lịch sử đặt vé.")
    docs = list(get_db().flight_bookings.find({"contactEmail": email}).sort("createdAt", -1).limit(50))
    return jsonify({"success": True, "items": [public_booking(d) for d in docs]})
