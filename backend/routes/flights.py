"""Demo flight-search and booking API for Travel Mini.

IMPORTANT: flight schedules, availability, airline names and fares are sample data.
This module is for coursework/local testing, not a live airline inventory integration.
"""
from __future__ import annotations

import re
import secrets
import os
import hmac
import hashlib
from urllib.parse import urlencode, quote
from datetime import datetime, timezone, timedelta
from flask import Blueprint, jsonify, request, redirect
from pymongo import ReturnDocument

flights_bp = Blueprint("flights", __name__, url_prefix="/api/flights")


def get_db():
    from app import db
    return db


def json_error(message, status=400, **extra):
    body = {"success": False, "message": message}
    body.update(extra)
    return jsonify(body), status


# Demo coupons for coursework only. Backend re-calculates discounts; client prices are never trusted.
COUPONS = {
    "TMWELCOME75": {"kind": "fixed", "amount": 75000, "minimum": 500000, "modes": {"flight", "train"}, "label": "Giảm 75.000đ"},
    "TMFLIGHT10": {"kind": "percent", "rate": 0.10, "maximum": 200000, "minimum": 500000, "modes": {"flight"}, "label": "Giảm 10% vé máy bay"},
    "TMTRAIN50": {"kind": "fixed", "amount": 50000, "minimum": 200000, "modes": {"train"}, "label": "Giảm 50.000đ vé tàu"},
}

def calculate_coupon_discount(code, subtotal, mode):
    normalized = str(code or "").strip().upper()
    subtotal = max(0, int(subtotal or 0))
    if not normalized:
        return "", 0
    coupon = COUPONS.get(normalized)
    if not coupon or mode not in coupon["modes"]:
        raise ValueError("Mã giảm giá không tồn tại hoặc không áp dụng cho phương tiện này.")
    if subtotal < int(coupon["minimum"]):
        raise ValueError(f"Đơn hàng cần tối thiểu {int(coupon['minimum']):,}đ để dùng mã {normalized}.")
    if coupon["kind"] == "fixed":
        discount = int(coupon["amount"])
    else:
        discount = min(int(subtotal * float(coupon["rate"])), int(coupon["maximum"]))
    return normalized, min(subtotal, max(0, discount))


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
        "seatNumbers": doc.get("seatNumbers", []),
        "contactName": doc.get("contactName", ""),
        "contactEmail": doc.get("contactEmail", ""),
        "contactPhone": doc.get("contactPhone", ""),
        "subtotal": int(doc.get("subtotal", doc.get("totalAmount", 0))),
        "couponCode": doc.get("couponCode", ""),
        "discountAmount": int(doc.get("discountAmount", 0)),
        "totalAmount": int(doc.get("totalAmount", 0)),
        "status": doc.get("status", "PENDING_PAYMENT"),
        "paymentStatus": doc.get("paymentStatus", "PENDING"),
        "paymentProvider": doc.get("paymentProvider", ""),
        "paidAt": iso(doc.get("paidAt")),
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




@flights_bp.get("/trips/<flight_code>/seats")
def flight_seats(flight_code):
    """Return a demo 3-aisle-3 airplane seat map with seats occupied by live demo bookings."""
    db = get_db()
    flight = db.flight_trips.find_one({"flightCode": flight_code, "status": "SCHEDULED"})
    if not flight:
        return json_error("Không tìm thấy chuyến bay.", 404)
    bookings = db.flight_bookings.find(
        {"flightCode": flight_code, "status": {"$in": ["PENDING_PAYMENT", "CONFIRMED"]}},
        {"seatNumbers": 1},
    )
    occupied = {str(seat).upper() for booking in bookings for seat in booking.get("seatNumbers", [])}
    items = []
    for row in range(1, 17):
        for letter in "ABCDEF":
            seat_number = f"{row}{letter}"
            items.append({"seatNumber": seat_number, "row": row, "column": letter, "available": seat_number not in occupied, "type": "STANDARD" if row > 2 else "FRONT"})
    return jsonify({"success": True, "items": items, "layout": {"rows": 16, "columns": ["A", "B", "C", "D", "E", "F"], "aisleAfter": "C"}, "mode": "DEMO_DATA"})


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
    contact_email = str(data.get("contactEmail", "")).strip().lower()
    contact_phone = str(data.get("contactPhone", "")).strip()
    if not contact_name or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", contact_email) or not contact_phone:
        return json_error("Vui lòng nhập tên, email và số điện thoại liên hệ hợp lệ.")

    seat_numbers = [str(seat).strip().upper() for seat in (data.get("seatNumbers") or [])]
    if seat_numbers and (len(seat_numbers) != count or len(set(seat_numbers)) != len(seat_numbers)):
        return json_error("Số ghế phải đúng bằng số hành khách và không được trùng nhau.")
    if any(not re.fullmatch(r"(?:[1-9]|1[0-6])[A-F]", seat) for seat in seat_numbers):
        return json_error("Sơ đồ demo có ghế từ 1A đến 16F.")

    db = get_db()
    flight_snapshot = db.flight_trips.find_one({"flightCode": flight_code, "status": "SCHEDULED"})
    if not flight_snapshot:
        return json_error("Không tìm thấy chuyến bay.", 404)
    subtotal = int(flight_snapshot.get("basePrice", 0)) * count
    try:
        coupon_code, discount_amount = calculate_coupon_discount(data.get("couponCode", ""), subtotal, "flight")
    except ValueError as exc:
        return json_error(str(exc), 400)

    if seat_numbers:
        existing_bookings = db.flight_bookings.find(
            {"flightCode": flight_code, "status": {"$in": ["PENDING_PAYMENT", "CONFIRMED"]}},
            {"seatNumbers": 1},
        )
        occupied = {str(seat).upper() for booking in existing_bookings for seat in booking.get("seatNumbers", [])}
        conflicts = sorted(occupied.intersection(seat_numbers))
        if conflicts:
            return json_error("Ghế vừa được người khác chọn: " + ", ".join(conflicts) + ". Vui lòng chọn ghế khác.", 409)

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
        "seatNumbers": seat_numbers,
        "contactName": contact_name,
        "contactEmail": contact_email,
        "contactPhone": contact_phone,
        "unitPrice": int(flight.get("basePrice", 0)),
        "subtotal": subtotal,
        "couponCode": coupon_code,
        "discountAmount": discount_amount,
        "totalAmount": max(0, subtotal - discount_amount),
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


# --------------------------- VNPay integration for flight bookings ---------------------------
VN_TIMEZONE = timezone(timedelta(hours=7))
VNPAY_DEFAULT_URL = "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html"


def flight_vnpay_config():
    """Reuse the existing VNPay Sandbox merchant settings without exposing secrets."""
    return_url = os.getenv("VNPAY_FLIGHT_RETURN_URL", "").strip()
    if not return_url:
        # Keep the current public host but route the return to the flight handler,
        # not the bus handler. An explicit VNPAY_FLIGHT_RETURN_URL is preferred.
        existing = os.getenv("VNPAY_RETURN_URL", "").strip()
        old_path = "/api/bus/payments/vnpay/return"
        if existing.endswith(old_path):
            return_url = existing[:-len(old_path)] + "/api/flights/payments/vnpay/return"
    return {
        "tmn_code": os.getenv("VNPAY_TMN_CODE", "").strip(),
        "hash_secret": os.getenv("VNPAY_HASH_SECRET", "").strip(),
        "payment_url": os.getenv("VNPAY_PAYMENT_URL", VNPAY_DEFAULT_URL).strip(),
        "return_url": return_url,
        "frontend_url": os.getenv("VNPAY_FRONTEND_URL", "http://localhost:5175").rstrip("/"),
        "enabled": os.getenv("VNPAY_ENABLED", "false").strip().lower() == "true",
    }


def flight_vnpay_query_string(params):
    return urlencode(sorted((str(k), str(v)) for k, v in params.items() if v is not None))


def flight_vnpay_hash(params, secret):
    raw = flight_vnpay_query_string(params)
    return hmac.new(secret.encode("utf-8"), raw.encode("utf-8"), hashlib.sha512).hexdigest()


def verify_flight_vnpay_query(args):
    cfg = flight_vnpay_config()
    if not cfg["hash_secret"]:
        return False, {}, "Thiếu VNPAY_HASH_SECRET."
    values = {str(k): str(v) for k, v in args.items()}
    supplied = values.pop("vnp_SecureHash", "").lower()
    values.pop("vnp_SecureHashType", None)
    if not supplied:
        return False, values, "Thiếu chữ ký VNPay."
    expected = flight_vnpay_hash(values, cfg["hash_secret"]).lower()
    return hmac.compare_digest(expected, supplied), values, "Chữ ký VNPay không hợp lệ."


def flight_ticket_fields(booking):
    ticket_code = booking.get("ticketCode") or ("TMFT-" + secrets.token_hex(4).upper())
    qr_payload = f"TRAVELMINI-FLIGHT|{booking['bookingCode']}|{booking.get('flightCode')}|{ticket_code}"
    return ticket_code, qr_payload


def apply_flight_vnpay_result(booking, params):
    db = get_db()
    booking_code = booking.get("bookingCode")
    if booking.get("paymentStatus") in {"PAID_VNPAY", "PAID_DEMO"}:
        return "ALREADY_PAID"
    response_code = params.get("vnp_ResponseCode", "")
    transaction_status = params.get("vnp_TransactionStatus", "")
    update = {
        "vnpayResponseCode": response_code,
        "vnpayTransactionStatus": transaction_status,
        "vnpayTransactionNo": params.get("vnp_TransactionNo"),
        "vnpayBankCode": params.get("vnp_BankCode"),
        "vnpayPayDate": params.get("vnp_PayDate"),
        "vnpayUpdatedAt": datetime.now(timezone.utc),
        "paymentProvider": "VNPAY",
    }
    if response_code == "00" and transaction_status == "00":
        ticket_code, qr_payload = flight_ticket_fields(booking)
        update.update({
            "status": "CONFIRMED",
            "paymentStatus": "PAID_VNPAY",
            "ticketCode": ticket_code,
            "qrPayload": qr_payload,
            "paidAt": datetime.now(timezone.utc),
        })
        db.flight_bookings.update_one(
            {"bookingCode": booking_code, "paymentStatus": {"$nin": ["PAID_VNPAY", "PAID_DEMO"]}},
            {"$set": update},
        )
        fresh = db.flight_bookings.find_one({"bookingCode": booking_code}) or {}
        return "SUCCESS" if fresh.get("paymentStatus") == "PAID_VNPAY" else "ALREADY_PAID"
    update.update({"status": "PAYMENT_FAILED", "paymentStatus": "FAILED"})
    db.flight_bookings.update_one(
        {"bookingCode": booking_code, "paymentStatus": {"$nin": ["PAID_VNPAY", "PAID_DEMO"]}},
        {"$set": update},
    )
    return "FAILED"


@flights_bp.post("/bookings/<booking_code>/payments")
def create_flight_payment(booking_code):
    db = get_db()
    booking = db.flight_bookings.find_one({"bookingCode": booking_code})
    if not booking:
        return json_error("Không tìm thấy đơn đặt vé máy bay.", 404)
    if booking.get("paymentStatus") in {"PAID_VNPAY", "PAID_DEMO"}:
        return json_error("Đơn này đã được thanh toán.", 409)
    cfg = flight_vnpay_config()
    missing = [key for key, value in (("VNPAY_TMN_CODE", cfg["tmn_code"]), ("VNPAY_HASH_SECRET", cfg["hash_secret"]), ("VNPAY_FLIGHT_RETURN_URL", cfg["return_url"])) if not value]
    if not cfg["enabled"] or missing:
        return json_error(
            "VNPay chưa được cấu hình cho vé máy bay. Kiểm tra VNPAY_ENABLED, TMN Code, Hash Secret và VNPAY_FLIGHT_RETURN_URL trong backend/.env.",
            503,
        )
    if not cfg["payment_url"].startswith("https://"):
        return json_error("VNPAY_PAYMENT_URL phải dùng HTTPS.", 503)
    try:
        amount = int(booking.get("totalAmount", 0))
    except (TypeError, ValueError):
        amount = 0
    if amount <= 0:
        return json_error("Số tiền vé không hợp lệ.", 400)
    now_vn = datetime.now(timezone.utc).astimezone(VN_TIMEZONE)
    expiry_vn = (datetime.now(timezone.utc) + timedelta(minutes=15)).astimezone(VN_TIMEZONE)
    txn_ref = "TMF" + now_vn.strftime("%y%m%d%H%M%S") + secrets.token_hex(3).upper()
    ip = str(request.headers.get("X-Forwarded-For", request.remote_addr or "127.0.0.1")).split(",")[0].strip()
    if ip in {"::1", "localhost", ""} or len(ip) > 45:
        ip = "127.0.0.1"
    params = {
        "vnp_Version": "2.1.0",
        "vnp_Command": "pay",
        "vnp_TmnCode": cfg["tmn_code"],
        "vnp_Amount": str(amount * 100),
        "vnp_CurrCode": "VND",
        "vnp_TxnRef": txn_ref,
        "vnp_OrderInfo": f"Thanh toan ve may bay {booking_code}",
        "vnp_OrderType": "other",
        "vnp_Locale": "vn",
        "vnp_ReturnUrl": cfg["return_url"],
        "vnp_IpAddr": ip,
        "vnp_CreateDate": now_vn.strftime("%Y%m%d%H%M%S"),
        "vnp_ExpireDate": expiry_vn.strftime("%Y%m%d%H%M%S"),
    }
    signature = flight_vnpay_hash(params, cfg["hash_secret"])
    payment_url = f"{cfg['payment_url']}?{flight_vnpay_query_string(params)}&vnp_SecureHash={signature}"
    db.flight_bookings.update_one({"bookingCode": booking_code, "paymentStatus": {"$nin": ["PAID_VNPAY", "PAID_DEMO"]}}, {"$set": {
        "paymentStatus": "PENDING", "paymentProvider": "VNPAY", "vnpTxnRef": txn_ref,
        "vnpPaymentUrl": payment_url, "vnpPaymentCreatedAt": datetime.now(timezone.utc),
    }})
    return jsonify({"success": True, "payment": {"provider": "VNPAY", "transactionCode": txn_ref, "amount": amount, "currency": "VND", "paymentUrl": payment_url}}), 201


def flight_vnpay_frontend_url(booking_code=None, status="failed"):
    cfg = flight_vnpay_config()
    base = cfg["frontend_url"] or "http://localhost:5175"
    if booking_code:
        target = f"{base}/flight/ticket/{quote(str(booking_code), safe='')}"
    else:
        target = f"{base}/flight/search"
    return f"{target}?payment={quote(status, safe='')}"


@flights_bp.get("/payments/vnpay/return")
def flight_vnpay_return():
    valid, params, _message = verify_flight_vnpay_query(request.args)
    if not valid:
        return redirect(flight_vnpay_frontend_url(None, "vnpay_invalid_signature"), code=302)
    txn_ref = params.get("vnp_TxnRef", "")
    db = get_db()
    booking = db.flight_bookings.find_one({"vnpTxnRef": txn_ref, "paymentProvider": "VNPAY"})
    if not booking:
        return redirect(flight_vnpay_frontend_url(None, "vnpay_order_not_found"), code=302)
    try:
        received_amount = int(params.get("vnp_Amount", "0"))
    except (TypeError, ValueError):
        received_amount = -1
    if received_amount != int(booking.get("totalAmount", 0)) * 100:
        return redirect(flight_vnpay_frontend_url(booking["bookingCode"], "vnpay_invalid_amount"), code=302)
    result = apply_flight_vnpay_result(booking, params)
    status = "vnpay_success" if result in {"SUCCESS", "ALREADY_PAID"} else "vnpay_failed"
    return redirect(flight_vnpay_frontend_url(booking["bookingCode"], status), code=302)


@flights_bp.get("/payments/vnpay/ipn")
def flight_vnpay_ipn():
    valid, params, _message = verify_flight_vnpay_query(request.args)
    if not valid:
        return jsonify({"RspCode": "97", "Message": "Invalid signature"}), 200
    booking = get_db().flight_bookings.find_one({"vnpTxnRef": params.get("vnp_TxnRef", ""), "paymentProvider": "VNPAY"})
    if not booking:
        return jsonify({"RspCode": "01", "Message": "Order not found"}), 200
    try:
        received_amount = int(params.get("vnp_Amount", "0"))
    except (TypeError, ValueError):
        received_amount = -1
    if received_amount != int(booking.get("totalAmount", 0)) * 100:
        return jsonify({"RspCode": "04", "Message": "Invalid amount"}), 200
    apply_flight_vnpay_result(booking, params)
    return jsonify({"RspCode": "00", "Message": "Confirm Success"}), 200


@flights_bp.post("/bookings/<booking_code>/demo-payment")
def demo_payment(booking_code):
    """Simulate a successful payment for local coursework only; never moves real money."""
    db = get_db()
    booking = db.flight_bookings.find_one({"bookingCode": booking_code})
    if not booking:
        return json_error("Không tìm thấy đơn đặt vé.", 404)
    if booking.get("paymentStatus") in {"PAID", "PAID_DEMO", "PAID_VNPAY"}:
        return jsonify({"success": True, "mode": "DEMO_DATA", "item": public_booking(booking)})
    ticket_code = "TMFT-" + secrets.token_hex(4).upper()
    qr_payload = f"TRAVELMINI-FLIGHT|{booking_code}|{booking.get('flightCode')}|{ticket_code}"
    db.flight_bookings.update_one({"bookingCode": booking_code, "paymentStatus": "PENDING"}, {"$set": {
        "status": "CONFIRMED", "paymentStatus": "PAID_DEMO", "ticketCode": ticket_code, "paymentProvider": "DEMO",
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
