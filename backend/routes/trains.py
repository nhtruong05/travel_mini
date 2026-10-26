"""Demo railway booking API for Travel Mini.

All schedules, high-speed rail services, prices and inventory are SAMPLE DATA.
High-speed entries are conceptual demo services, not a claim of current real-world operations.
"""
from __future__ import annotations

import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode, quote
from zoneinfo import ZoneInfo

from flask import Blueprint, jsonify, redirect, request
from pymongo import ReturnDocument

trains_bp = Blueprint("trains", __name__, url_prefix="/api/trains")
VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")

SEAT_CLASSES = {
    "hard_seat": {"label": "Ghế ngồi cứng (DEMO)", "multiplier": 0.65, "types": ["STANDARD"]},
    "soft_seat": {"label": "Ghế ngồi mềm (DEMO)", "multiplier": 1.0, "types": ["STANDARD"]},
    "sleeper_6": {"label": "Giường nằm khoang 6 (DEMO)", "multiplier": 1.45, "types": ["STANDARD"]},
    "sleeper_4": {"label": "Giường nằm khoang 4 (DEMO)", "multiplier": 1.85, "types": ["STANDARD"]},
    "hs_standard": {"label": "Ghế tiêu chuẩn tàu cao tốc (DEMO)", "multiplier": 1.0, "types": ["HIGH_SPEED_DEMO"]},
    "hs_business": {"label": "Ghế thương gia tàu cao tốc (DEMO)", "multiplier": 1.8, "types": ["HIGH_SPEED_DEMO"]},
}


def get_db():
    # Uses the same initialized MongoDB connection as the existing Travel Mini API.
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


def public_station(doc):
    return {"code": doc.get("code", ""), "name": doc.get("name", ""), "city": doc.get("city", ""), "region": doc.get("region", ""), "active": doc.get("active", True)}


def public_trip(doc):
    if not doc:
        return None
    return {
        "id": str(doc.get("trainCode", doc.get("_id", ""))),
        "trainCode": doc.get("trainCode", ""),
        "trainType": doc.get("trainType", "STANDARD"),
        "trainTypeLabel": doc.get("trainTypeLabel", "Tàu hỏa (DEMO)"),
        "operator": doc.get("operator", "Đường sắt mô phỏng"),
        "serviceNumber": doc.get("serviceNumber", ""),
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
        "basePrice": int(doc.get("basePrice", 0)),
        "availableSeats": int(doc.get("availableSeats", 0)),
        "demoData": True,
    }


def public_booking(doc):
    if not doc:
        return None
    return {
        "bookingCode": doc.get("bookingCode", ""),
        "trainCode": doc.get("trainCode", ""),
        "trainType": doc.get("trainType", "STANDARD"),
        "trainTypeLabel": doc.get("trainTypeLabel", "Tàu hỏa (DEMO)"),
        "operator": doc.get("operator", ""),
        "serviceNumber": doc.get("serviceNumber", ""),
        "originCode": doc.get("originCode", ""),
        "originName": doc.get("originName", ""),
        "destinationCode": doc.get("destinationCode", ""),
        "destinationName": doc.get("destinationName", ""),
        "departureDate": doc.get("departureDate", ""),
        "departureTime": doc.get("departureTime", ""),
        "arrivalDate": doc.get("arrivalDate", ""),
        "arrivalTime": doc.get("arrivalTime", ""),
        "durationMinutes": int(doc.get("durationMinutes", 0)),
        "passengerCount": int(doc.get("passengerCount", 0)),
        "passengers": doc.get("passengers", []),
        "seatClass": doc.get("seatClass", ""),
        "seatClassLabel": doc.get("seatClassLabel", ""),
        "contactName": doc.get("contactName", ""),
        "contactEmail": doc.get("contactEmail", ""),
        "contactPhone": doc.get("contactPhone", ""),
        "unitPrice": int(doc.get("unitPrice", 0)),
        "subtotal": int(doc.get("subtotal", doc.get("totalAmount", 0))),
        "couponCode": doc.get("couponCode", ""),
        "discountAmount": int(doc.get("discountAmount", 0)),
        "totalAmount": int(doc.get("totalAmount", 0)),
        "status": doc.get("status", "PENDING_PAYMENT"),
        "paymentStatus": doc.get("paymentStatus", "PENDING"),
        "paymentProvider": doc.get("paymentProvider", ""),
        "ticketCode": doc.get("ticketCode"),
        "qrPayload": doc.get("qrPayload"),
        "paymentFailureReason": doc.get("paymentFailureReason"),
        "createdAt": iso(doc.get("createdAt")),
        "demoData": True,
    }


def payment_config():
    return {
        "enabled": os.getenv("VNPAY_ENABLED", "false").strip().lower() == "true",
        "tmn_code": os.getenv("VNPAY_TMN_CODE", "").strip(),
        "hash_secret": os.getenv("VNPAY_HASH_SECRET", "").strip(),
        "payment_url": os.getenv("VNPAY_PAYMENT_URL", "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html").strip(),
        "return_url": os.getenv("VNPAY_TRAIN_RETURN_URL", "").strip(),
        "frontend_url": os.getenv("VNPAY_FRONTEND_URL", "http://localhost:5175").strip().rstrip("/"),
    }


def query_string(params):
    return urlencode(sorted((str(k), str(v)) for k, v in params.items() if v is not None))


def payment_hash(params, secret):
    return hmac.new(secret.encode("utf-8"), query_string(params).encode("utf-8"), hashlib.sha512).hexdigest()


def new_ticket_fields(booking):
    ticket_code = booking.get("ticketCode") or ("TMRT-" + secrets.token_hex(4).upper())
    return {
        "status": "CONFIRMED",
        "paymentStatus": "PAID" if booking.get("paymentProvider") == "VNPAY" else "PAID_DEMO",
        "ticketCode": ticket_code,
        "qrPayload": f"TRAVELMINI-RAIL|{booking.get('bookingCode')}|{booking.get('trainCode')}|{ticket_code}",
        "paidAt": datetime.now(timezone.utc),
        "paymentFailureReason": None,
    }


@trains_bp.get("/health")
def health():
    try:
        get_db().command("ping")
        cfg = payment_config()
        return jsonify({"success": True, "message": "Rail API is running", "database": "connected", "mode": "DEMO_DATA", "vnpayConfigured": bool(cfg["enabled"] and cfg["tmn_code"] and cfg["hash_secret"] and cfg["return_url"])})
    except Exception:
        return json_error("Không kết nối được cơ sở dữ liệu.", 503)


@trains_bp.get("/stations")
def stations():
    q = str(request.args.get("q", "")).strip().lower()
    docs = list(get_db().rail_stations.find({"active": {"$ne": False}}).sort([("city", 1), ("code", 1)]))
    if q:
        docs = [d for d in docs if any(q in str(d.get(key, "")).lower() for key in ("code", "name", "city", "region"))]
    return jsonify({"success": True, "items": [public_station(d) for d in docs], "mode": "DEMO_DATA"})


@trains_bp.get("/search")
def search_trains():
    origin = str(request.args.get("origin", "")).upper().strip()
    destination = str(request.args.get("destination", "")).upper().strip()
    travel_date = str(request.args.get("date", "")).strip()
    train_type = str(request.args.get("trainType", "ALL")).upper().strip()
    try:
        passengers = int(request.args.get("passengers", "1"))
    except ValueError:
        return json_error("Số hành khách không hợp lệ.")
    if not origin or not destination:
        return json_error("Vui lòng chọn ga đi và ga đến.")
    if origin == destination:
        return json_error("Ga đi và ga đến phải khác nhau.")
    if train_type not in {"ALL", "STANDARD", "HIGH_SPEED_DEMO"}:
        return json_error("Loại tàu không hợp lệ.")
    try:
        datetime.strptime(travel_date, "%Y-%m-%d")
    except ValueError:
        return json_error("Ngày khởi hành không hợp lệ.")
    if not 1 <= passengers <= 8:
        return json_error("Số hành khách phải từ 1 đến 8.")
    query = {"originCode": origin, "destinationCode": destination, "departureDate": travel_date, "status": "SCHEDULED", "availableSeats": {"$gte": passengers}}
    if train_type != "ALL":
        query["trainType"] = train_type
    db = get_db()
    docs = list(db.rail_trips.find(query).sort([("departureTime", 1), ("basePrice", 1)]))
    stations_by_code = {d.get("code"): d for d in db.rail_stations.find({"code": {"$in": [origin, destination]}})}
    return jsonify({
        "success": True, "mode": "DEMO_DATA",
        "message": "Lịch tàu, giá vé và số chỗ đều là dữ liệu mô phỏng. Tàu cao tốc trong module là dịch vụ giả lập cho đồ án.",
        "query": {"origin": origin, "destination": destination, "date": travel_date, "passengers": passengers, "trainType": train_type},
        "origin": stations_by_code.get(origin, {}).get("city", origin),
        "destination": stations_by_code.get(destination, {}).get("city", destination),
        "items": [public_trip(d) for d in docs],
    })


@trains_bp.get("/trips/<train_code>")
def train_detail(train_code):
    doc = get_db().rail_trips.find_one({"trainCode": train_code, "status": "SCHEDULED"})
    if not doc:
        return json_error("Không tìm thấy chuyến tàu hoặc chuyến không còn mở bán.", 404)
    return jsonify({"success": True, "item": public_trip(doc), "mode": "DEMO_DATA"})


@trains_bp.post("/bookings")
def create_booking():
    data = request.get_json(silent=True) or {}
    train_code = str(data.get("trainCode", "")).strip()
    seat_class = str(data.get("seatClass", "")).strip()
    try:
        count = int(data.get("passengerCount", 0))
    except (TypeError, ValueError):
        return json_error("Số hành khách không hợp lệ.")
    passengers = data.get("passengers")
    if not isinstance(passengers, list) or len(passengers) != count or not 1 <= count <= 8:
        return json_error("Vui lòng nhập đủ thông tin từng hành khách.")
    clean_passengers = []
    for idx, passenger in enumerate(passengers, 1):
        if not isinstance(passenger, dict) or not str(passenger.get("fullName", "")).strip():
            return json_error(f"Vui lòng nhập họ tên hành khách số {idx}.")
        clean_passengers.append({"fullName": str(passenger.get("fullName", "")).strip(), "documentNumber": str(passenger.get("documentNumber", "")).strip()})
    contact_name = str(data.get("contactName", "")).strip()
    contact_email = str(data.get("contactEmail", "")).strip().lower()
    contact_phone = str(data.get("contactPhone", "")).strip()
    if not contact_name or "@" not in contact_email or "." not in contact_email.split("@")[-1] or not contact_phone:
        return json_error("Vui lòng nhập tên, email và số điện thoại liên hệ hợp lệ.")

    db = get_db()
    trip = db.rail_trips.find_one({"trainCode": train_code, "status": "SCHEDULED"})
    if not trip:
        return json_error("Không tìm thấy chuyến tàu.", 404)
    allowed_type = trip.get("trainType", "STANDARD")
    class_config = SEAT_CLASSES.get(seat_class)
    if not class_config or allowed_type not in class_config["types"]:
        return json_error("Loại chỗ không phù hợp với chuyến tàu đã chọn.")
    unit_price = round(int(trip.get("basePrice", 0)) * float(class_config["multiplier"]))
    subtotal = unit_price * count
    try:
        coupon_code, discount_amount = calculate_coupon_discount(data.get("couponCode", ""), subtotal, "train")
    except ValueError as exc:
        return json_error(str(exc), 400)

    updated_trip = db.rail_trips.find_one_and_update(
        {"trainCode": train_code, "status": "SCHEDULED", "availableSeats": {"$gte": count}},
        {"$inc": {"availableSeats": -count}},
        return_document=ReturnDocument.AFTER,
    )
    if not updated_trip:
        return json_error("Chuyến tàu không còn đủ chỗ. Hãy tìm lại chuyến.", 409)

    now = datetime.now(timezone.utc)
    booking_code = "TMR-" + now.astimezone(VN_TZ).strftime("%y%m%d") + "-" + secrets.token_hex(3).upper()
    booking = {
        "_id": booking_code, "bookingCode": booking_code, "trainCode": train_code,
        "trainType": trip.get("trainType", "STANDARD"), "trainTypeLabel": trip.get("trainTypeLabel", "Tàu hỏa (DEMO)"),
        "operator": trip.get("operator", "Đường sắt mô phỏng"), "serviceNumber": trip.get("serviceNumber", ""),
        "originCode": trip.get("originCode", ""), "originName": trip.get("originName", ""),
        "destinationCode": trip.get("destinationCode", ""), "destinationName": trip.get("destinationName", ""),
        "departureDate": trip.get("departureDate", ""), "departureTime": trip.get("departureTime", ""),
        "arrivalDate": trip.get("arrivalDate", ""), "arrivalTime": trip.get("arrivalTime", ""),
        "durationMinutes": int(trip.get("durationMinutes", 0)), "passengerCount": count, "passengers": clean_passengers,
        "seatClass": seat_class, "seatClassLabel": class_config["label"],
        "contactName": contact_name, "contactEmail": contact_email, "contactPhone": contact_phone,
        "unitPrice": unit_price, "subtotal": subtotal, "couponCode": coupon_code,
        "discountAmount": discount_amount, "totalAmount": max(0, subtotal - discount_amount),
        "status": "PENDING_PAYMENT", "paymentStatus": "PENDING", "paymentProvider": "",
        "createdAt": now,
    }
    try:
        db.rail_bookings.insert_one(booking)
    except Exception:
        db.rail_trips.update_one({"trainCode": train_code}, {"$inc": {"availableSeats": count}})
        raise
    return jsonify({"success": True, "mode": "DEMO_DATA", "item": public_booking(booking)}), 201


@trains_bp.post("/bookings/<booking_code>/payments")
def initiate_payment(booking_code):
    data = request.get_json(silent=True) or {}
    method = str(data.get("method", "demo")).lower().strip()
    if method not in {"demo", "vnpay"}:
        return json_error("Phương thức thanh toán không hợp lệ.")
    db = get_db()
    booking = db.rail_bookings.find_one({"bookingCode": booking_code})
    if not booking:
        return json_error("Không tìm thấy booking.", 404)
    if booking.get("paymentStatus") in {"PAID", "PAID_DEMO"}:
        return jsonify({"success": True, "mode": "DEMO_DATA", "item": public_booking(booking)})
    if booking.get("status") != "PENDING_PAYMENT":
        return json_error("Booking này không còn ở trạng thái chờ thanh toán.", 409)

    if method == "demo":
        fields = new_ticket_fields({**booking, "paymentProvider": "DEMO"})
        fields["paymentProvider"] = "DEMO"
        db.rail_bookings.update_one({"bookingCode": booking_code, "paymentStatus": "PENDING"}, {"$set": fields})
        updated = db.rail_bookings.find_one({"bookingCode": booking_code})
        return jsonify({"success": True, "mode": "DEMO_DATA", "message": "Thanh toán mô phỏng thành công; không có tiền thật được chuyển.", "item": public_booking(updated)})

    cfg = payment_config()
    missing = [key for key, value in (("VNPAY_ENABLED=true", "true" if cfg["enabled"] else ""), ("VNPAY_TMN_CODE", cfg["tmn_code"]), ("VNPAY_HASH_SECRET", cfg["hash_secret"]), ("VNPAY_TRAIN_RETURN_URL", cfg["return_url"])) if not value]
    if missing:
        return json_error("VNPay chưa được cấu hình cho module tàu. Thiếu: " + ", ".join(missing), 503)
    if not cfg["payment_url"].startswith("https://") or not cfg["return_url"].startswith("https://"):
        return json_error("URL thanh toán và callback VNPay cần sử dụng HTTPS.", 503)
    now = datetime.now(VN_TZ)
    expires = now + timedelta(minutes=15)
    ip = str(request.headers.get("X-Forwarded-For", request.remote_addr or "127.0.0.1")).split(",")[0].strip()
    if ip in {"::1", "localhost", ""} or len(ip) > 45:
        ip = "127.0.0.1"
    params = {
        "vnp_Version": "2.1.0", "vnp_Command": "pay", "vnp_TmnCode": cfg["tmn_code"],
        "vnp_Amount": str(int(booking.get("totalAmount", 0)) * 100), "vnp_CurrCode": "VND",
        "vnp_TxnRef": booking_code, "vnp_OrderInfo": f"Thanh toan ve tau {booking_code}",
        "vnp_OrderType": "other", "vnp_Locale": "vn", "vnp_ReturnUrl": cfg["return_url"],
        "vnp_IpAddr": ip, "vnp_CreateDate": now.strftime("%Y%m%d%H%M%S"),
        "vnp_ExpireDate": expires.strftime("%Y%m%d%H%M%S"),
    }
    signature = payment_hash(params, cfg["hash_secret"])
    payment_url = f"{cfg['payment_url']}?{query_string(params)}&vnp_SecureHash={signature}"
    db.rail_bookings.update_one({"bookingCode": booking_code, "paymentStatus": "PENDING"}, {"$set": {"paymentProvider": "VNPAY", "paymentInitiatedAt": datetime.now(timezone.utc)}})
    return jsonify({"success": True, "paymentProvider": "VNPAY", "redirectUrl": payment_url, "bookingCode": booking_code})


@trains_bp.get("/payments/vnpay/return")
def vnpay_return():
    cfg = payment_config()
    args = {str(k): str(v) for k, v in request.args.items()}
    supplied = args.pop("vnp_SecureHash", "").lower()
    args.pop("vnp_SecureHashType", None)
    expected = payment_hash(args, cfg["hash_secret"]) if cfg["hash_secret"] else ""
    valid = bool(supplied and expected and hmac.compare_digest(supplied, expected.lower()))
    booking_code = str(request.args.get("vnp_TxnRef", "")).strip()
    db = get_db()
    booking = db.rail_bookings.find_one({"bookingCode": booking_code}) if booking_code else None
    status = "failed"
    if booking and valid:
        successful = request.args.get("vnp_ResponseCode") == "00" and request.args.get("vnp_TransactionStatus") == "00"
        if successful:
            fields = new_ticket_fields({**booking, "paymentProvider": "VNPAY"})
            fields["paymentProvider"] = "VNPAY"
            db.rail_bookings.update_one({"bookingCode": booking_code, "paymentStatus": "PENDING", "status": "PENDING_PAYMENT"}, {"$set": fields})
            status = "success"
        else:
            result = db.rail_bookings.update_one({"bookingCode": booking_code, "paymentStatus": "PENDING", "status": "PENDING_PAYMENT"}, {"$set": {"status": "PAYMENT_FAILED", "paymentStatus": "FAILED", "paymentFailureReason": str(request.args.get("vnp_ResponseCode", "Unknown")), "failedAt": datetime.now(timezone.utc)}})
            if result.modified_count:
                db.rail_trips.update_one({"trainCode": booking.get("trainCode")}, {"$inc": {"availableSeats": int(booking.get("passengerCount", 0))}})
    cfg_front = cfg["frontend_url"] or "http://localhost:5175"
    target = f"{cfg_front}/train/ticket/{quote(booking_code, safe='')}?payment={status}"
    return redirect(target, code=302)


@trains_bp.get("/bookings/<booking_code>")
def get_booking(booking_code):
    doc = get_db().rail_bookings.find_one({"bookingCode": booking_code})
    if not doc:
        return json_error("Không tìm thấy booking.", 404)
    return jsonify({"success": True, "item": public_booking(doc), "mode": "DEMO_DATA"})


@trains_bp.get("/bookings")
def list_bookings():
    email = str(request.args.get("email", "")).strip().lower()
    if not email:
        return json_error("Cần email liên hệ để tra cứu lịch sử vé tàu.")
    docs = list(get_db().rail_bookings.find({"contactEmail": email}).sort("createdAt", -1).limit(50))
    return jsonify({"success": True, "items": [public_booking(d) for d in docs], "mode": "DEMO_DATA"})
