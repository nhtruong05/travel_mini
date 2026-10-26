"""Bus-ticket booking API for Travel Mini v2.

Uses the existing Flask app's `db` variable and its configured JWTManager.
No ticket classes are modelled: each trip has one ticket price; physical seats/berths
are represented only in the `seats` collection.
"""
from __future__ import annotations

import os
import re
import secrets
import unicodedata
import hashlib
import hmac
from urllib.parse import urlencode, quote
from datetime import date, datetime, time, timedelta, timezone
from uuid import uuid4

from bson import ObjectId
from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt, get_jwt_identity, jwt_required
from pymongo import ASCENDING, DESCENDING, ReturnDocument
from pymongo.errors import PyMongoError

bus_bp = Blueprint("bus", __name__, url_prefix="/api/bus")
HOLD_MINUTES = 10
MAX_HELD_SEATS = 8


def get_db():
    # Import at request time to avoid a circular import while app.py registers blueprints.
    from app import db
    return db


def now_utc():
    return datetime.now(timezone.utc)


def utc_datetime(value):
    """Normalize Mongo datetime values (aware or naive) to UTC-aware datetimes."""
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    if not isinstance(value, datetime):
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def norm(value: str) -> str:
    value = unicodedata.normalize("NFD", str(value or ""))
    value = "".join(char for char in value if unicodedata.category(char) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def is_bus_location(doc):
    """Keep suggestions restricted to bus-served locations when legacy data includes other transport modes."""
    transport = str(doc.get("transport") or "").upper()
    if transport and transport != "BUS":
        return False
    return transport == "BUS" or str(doc.get("type") or "").upper() in {"BUS_STATION", "BUS_STOP", "PLACE"}


def json_error(message, status=400, **extra):
    body = {"success": False, "message": message}
    body.update(extra)
    return jsonify(body), status


def iso(value):
    if not isinstance(value, datetime):
        return value
    # MongoClient may be configured with tz_aware=False in the existing project;
    # by convention, naive datetimes in this module/database are UTC.
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def qr_data_url(payload):
    """Return a QR SVG data URL when qrcode is installed; otherwise return None."""
    try:
        import base64
        from io import BytesIO
        import qrcode
        qr = qrcode.QRCode(version=None, box_size=5, border=2)
        qr.add_data(payload)
        qr.make(fit=True)
        image = qr.make_image(fill_color="#102b55", back_color="white")
        output = BytesIO()
        image.save(output, format="PNG")
        encoded = base64.b64encode(output.getvalue()).decode("ascii")
        return f"data:image/png;base64,{encoded}"
    except Exception:
        return None


def public_location(doc):
    if not doc:
        return None
    return {
        "id": str(doc.get("_id", doc.get("code", ""))),
        "code": doc.get("code", str(doc.get("_id", ""))),
        "name": doc.get("name", ""),
        "city": doc.get("city", ""),
        "type": doc.get("type", "PLACE"),
        "aliases": doc.get("aliases", []),
        "linkedLocationCodes": doc.get("linkedLocationCodes", []),
        "nearestStationName": doc.get("nearestStationName"),
        "estimatedDistanceKm": doc.get("estimatedDistanceKm"),
    }


def public_trip(trip, price=None, available_seats=None, match=None):
    doc = dict(trip)
    doc_id = str(doc.pop("_id", doc.get("id", "")))
    result = {
        "id": doc_id,
        "code": doc.get("tripCode", doc_id),
        "providerId": str(doc.get("providerId", "")),
        "provider": doc.get("provider", doc.get("providerName", "Nhà xe")),
        "providerLogoText": doc.get("providerLogoText", "TM"),
        "vehicleId": str(doc.get("vehicleId", "")),
        "vehicleType": doc.get("vehicleType", "Xe khách"),
        "originCode": doc.get("originCode", ""),
        "originName": doc.get("originName", ""),
        "originCity": doc.get("originCity", ""),
        "destinationCode": doc.get("destinationCode", ""),
        "destinationName": doc.get("destinationName", ""),
        "destinationCity": doc.get("destinationCity", ""),
        "departureAt": iso(doc.get("departureAt")),
        "arrivalAt": iso(doc.get("arrivalAt")),
        "departureDate": doc.get("departureDate", ""),
        "durationMinutes": doc.get("durationMinutes", 0),
        "stops": doc.get("stops", 0),
        "status": doc.get("status", "SCHEDULED"),
        "price": int(price if price is not None else doc.get("basePrice", 0)),
        "availableSeats": int(available_seats if available_seats is not None else 0),
        "changePolicy": doc.get("changePolicy", "Liên hệ nhà xe để kiểm tra điều kiện đổi vé."),
        "refundPolicy": doc.get("refundPolicy", "Yêu cầu hoàn vé được xét theo chính sách nhà xe."),
    }
    if match:
        result["destinationMatch"] = match
    return result


def release_expired_seats(db, trip_id=None):
    now = now_utc()
    criteria = {"status": "HELD", "heldUntil": {"$lte": now}}
    if trip_id:
        criteria["tripId"] = trip_id
    expired = list(db.seats.find(criteria, {"_id": 1, "holdId": 1, "tripId": 1}))
    if expired:
        db.seats.update_many(criteria, {"$set": {"status": "AVAILABLE", "holdId": None, "heldUntil": None}})
        hold_ids = list({item.get("holdId") for item in expired if item.get("holdId")})
        if hold_ids:
            db.seat_holds.update_many(
                {"_id": {"$in": hold_ids}, "status": {"$in": ["ACTIVE", "CHECKOUT"]}, "expiresAt": {"$lte": now}},
                {"$set": {"status": "EXPIRED", "updatedAt": now}},
            )
        # Expire unpaid bookings connected to an expired hold.
        if hold_ids:
            db.bookings.update_many(
                {"holdId": {"$in": hold_ids}, "status": "PENDING_PAYMENT"},
                {"$set": {"status": "EXPIRED", "updatedAt": now}},
            )


def resolve_locations(db, query, selected_code=None):
    """Return matching location docs and destination codes they serve.

    A user may search an exact station or a general place. Places can declare
    `linkedLocationCodes` to map the query to nearby stations actually served by buses.
    """
    query = str(query or "").strip()[:120]
    candidates = []
    if selected_code:
        code = str(selected_code).strip()
        doc = db.locations.find_one({"$or": [{"code": code}, {"_id": code}]})
        if doc and is_bus_location(doc):
            candidates.append(doc)
    if query and not candidates:
        # exact code first, then case-insensitive name/city/aliases.
        code_doc = db.locations.find_one({"$or": [{"code": query}, {"_id": query}]})
        if code_doc:
            candidates.append(code_doc)
        else:
            qnorm = norm(query)
            for doc in db.locations.find({}).limit(1000):
                if not is_bus_location(doc):
                    continue
                parts = [doc.get("name", ""), doc.get("city", ""), doc.get("code", "")]
                parts.extend(doc.get("aliases", []) or [])
                if any(qnorm == norm(part) or (len(qnorm) >= 3 and qnorm in norm(part)) for part in parts if part):
                    candidates.append(doc)
            # Prioritize full name/city match over alias substring.
            candidates.sort(key=lambda d: (0 if qnorm in {norm(d.get("name")), norm(d.get("city")), norm(d.get("code"))} else 1, 0 if d.get("type") in ("BUS_STATION", "STATION") else 1))
    target_codes, metadata = [], []
    for doc in candidates:
        code = str(doc.get("code", doc.get("_id", "")))
        linked = doc.get("linkedLocationCodes") or []
        if linked:
            target_codes.extend(str(x) for x in linked)
            match_type = "NEARBY"
        else:
            target_codes.append(code)
            match_type = "EXACT"
        metadata.append({"location": doc, "matchType": match_type})
    return candidates, list(dict.fromkeys(target_codes)), metadata


def fare_for_trip(db, trip):
    price = trip.get("basePrice")
    if price is not None:
        try:
            return max(0, int(price))
        except (ValueError, TypeError):
            pass
    # Backward-compatible fallback for existing data: use the single lowest price.
    fare = db.fares.find_one({"tripId": str(trip.get("_id"))}, sort=[("price", ASCENDING)])
    try:
        return max(0, int((fare or {}).get("price", 0)))
    except (ValueError, TypeError):
        return 0


def trip_available_count(db, trip_id):
    release_expired_seats(db, trip_id)
    return db.seats.count_documents({"tripId": trip_id, "status": "AVAILABLE"})


def identity_value():
    value = get_jwt_identity()
    if isinstance(value, dict):
        return str(value.get("id") or value.get("_id") or value.get("sub") or "")
    return str(value or "")


def find_user_doc(db, identity):
    if not identity:
        return None
    query = [{"_id": identity}, {"email": identity}]
    if ObjectId.is_valid(identity):
        query.insert(0, {"_id": ObjectId(identity)})
    for item in query:
        doc = db.users.find_one(item)
        if doc:
            return doc
    return None


def current_user_context(db):
    identity = identity_value()
    doc = find_user_doc(db, identity)
    user_id = str(doc.get("_id")) if doc else identity
    role = str((doc or {}).get("role") or get_jwt().get("role") or "CUSTOMER").upper()
    return user_id, role, doc


def require_role(*roles):
    db = get_db()
    _user_id, role, _doc = current_user_context(db)
    if role not in {str(x).upper() for x in roles}:
        return json_error("Bạn không có quyền thực hiện chức năng này.", 403)
    return None


def booking_by_code(db, code):
    return db.bookings.find_one({"bookingCode": code})


def issue_tickets(db, booking, now):
    """Idempotently create one ticket per passenger, even after a partial retry."""
    tickets = []
    existing_by_seat = {
        str(ticket.get("seatId")): ticket
        for ticket in db.tickets.find({"bookingId": booking["_id"]})
    }
    for passenger in booking.get("passengers", []):
        seat_id = str(passenger.get("seatId") or "")
        existing = existing_by_seat.get(seat_id)
        if existing:
            tickets.append(existing)
            continue
        ticket = {
            "_id": str(uuid4()),
            "ticketCode": f"TM-{now.strftime('%y%m%d')}-{secrets.token_hex(3).upper()}",
            "bookingId": booking["_id"],
            "bookingCode": booking["bookingCode"],
            "userId": booking["userId"],
            "tripId": booking["tripId"],
            "passenger": passenger,
            "seatId": passenger.get("seatId"),
            "seatNumber": passenger.get("seatNumber"),
            "qrPayload": secrets.token_urlsafe(24),
            "status": "ISSUED",
            "issuedAt": now,
            "createdAt": now,
        }
        db.tickets.insert_one(ticket)
        tickets.append(ticket)
    return tickets


# --------------------------- VNPay integration ---------------------------
VN_TIMEZONE = timezone(timedelta(hours=7))
VNPAY_DEFAULT_URL = "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html"


def vnpay_config():
    """Read VNPay config from environment; never put merchant secrets in source control."""
    return {
        "tmn_code": os.getenv("VNPAY_TMN_CODE", "").strip(),
        "hash_secret": os.getenv("VNPAY_HASH_SECRET", "").strip(),
        "payment_url": os.getenv("VNPAY_PAYMENT_URL", VNPAY_DEFAULT_URL).strip(),
        "return_url": os.getenv(
            "VNPAY_RETURN_URL",
            "http://127.0.0.1:5000/api/bus/payments/vnpay/return",
        ).strip(),
        "frontend_url": os.getenv("VNPAY_FRONTEND_URL", "http://localhost:5175").rstrip("/"),
        "enabled": os.getenv("VNPAY_ENABLED", "false").strip().lower() == "true",
    }


def vnpay_query_string(params):
    # VNPay 2.1.0 signs alphabetically sorted query parameters.
    # urlencode uses UTF-8 and form-style percent encoding for spaces.
    return urlencode(sorted((str(k), str(v)) for k, v in params.items() if v is not None))


def vnpay_hash(params, secret):
    query_string = vnpay_query_string(params)
    return hmac.new(secret.encode("utf-8"), query_string.encode("utf-8"), hashlib.sha512).hexdigest()


def build_vnpay_payment_url(payment, booking, hold, client_ip):
    cfg = vnpay_config()
    missing = [name for name, value in (
        ("VNPAY_TMN_CODE", cfg["tmn_code"]),
        ("VNPAY_HASH_SECRET", cfg["hash_secret"]),
        ("VNPAY_RETURN_URL", cfg["return_url"]),
    ) if not value]
    if not cfg["enabled"] or missing:
        raise RuntimeError(
            "VNPay chưa được cấu hình. Hãy đặt VNPAY_ENABLED=true, "
            "VNPAY_TMN_CODE và VNPAY_HASH_SECRET trong backend/.env."
        )
    if not cfg["payment_url"].startswith("https://"):
        raise RuntimeError("VNPAY_PAYMENT_URL phải sử dụng HTTPS.")

    now_vn = now_utc().astimezone(VN_TIMEZONE)
    hold_expiry = utc_datetime((hold or {}).get("expiresAt"))
    if not hold_expiry or hold_expiry <= now_utc():
        raise RuntimeError("Thời gian giữ chỗ đã hết. Vui lòng chọn chỗ lại.")
    expires_vn = hold_expiry.astimezone(VN_TIMEZONE)
    # VNPay expects VND amount in minor units (VND * 100).
    amount = int(payment.get("amount", 0))
    if amount <= 0:
        raise RuntimeError("Số tiền thanh toán không hợp lệ.")

    ip = str(client_ip or "127.0.0.1").split(",")[0].strip()
    if ip in {"::1", "localhost", ""}:
        ip = "127.0.0.1"
    if len(ip) > 45:
        ip = "127.0.0.1"

    params = {
        "vnp_Version": "2.1.0",
        "vnp_Command": "pay",
        "vnp_TmnCode": cfg["tmn_code"],
        "vnp_Amount": str(amount * 100),
        "vnp_CurrCode": "VND",
        "vnp_TxnRef": payment["transactionCode"],
        "vnp_OrderInfo": f"Thanh toan don dat ve {booking['bookingCode']}",
        "vnp_OrderType": "other",
        "vnp_Locale": "vn",
        "vnp_ReturnUrl": cfg["return_url"],
        "vnp_IpAddr": ip,
        "vnp_CreateDate": now_vn.strftime("%Y%m%d%H%M%S"),
        "vnp_ExpireDate": expires_vn.strftime("%Y%m%d%H%M%S"),
    }
    signature = vnpay_hash(params, cfg["hash_secret"])
    return f"{cfg['payment_url']}?{vnpay_query_string(params)}&vnp_SecureHash={signature}"


def verify_vnpay_query(args):
    cfg = vnpay_config()
    if not cfg["hash_secret"]:
        return False, {}, "VNPay chưa được cấu hình khóa bí mật."
    values = {str(k): str(v) for k, v in args.items()}
    supplied = values.pop("vnp_SecureHash", "").lower()
    values.pop("vnp_SecureHashType", None)
    if not supplied:
        return False, values, "Thiếu chữ ký VNPay."
    expected = vnpay_hash(values, cfg["hash_secret"]).lower()
    return hmac.compare_digest(expected, supplied), values, "Chữ ký không hợp lệ."


def vnpay_frontend_redirect(booking_code=None, payment_status="failed"):
    cfg = vnpay_config()
    base = cfg["frontend_url"] or "http://localhost:5175"
    if booking_code:
        target = f"{base}/bus/bookings/{quote(str(booking_code), safe='')}"
    else:
        target = f"{base}/bus/search"
    return f"{target}?payment={quote(payment_status, safe='')}"


def set_vnpay_response_fields(db, payment, params):
    now = now_utc()
    update = {
        "vnpayResponseCode": params.get("vnp_ResponseCode"),
        "vnpayTransactionStatus": params.get("vnp_TransactionStatus"),
        "vnpayTransactionNo": params.get("vnp_TransactionNo"),
        "vnpayBankCode": params.get("vnp_BankCode"),
        "vnpayCardType": params.get("vnp_CardType"),
        "vnpayPayDate": params.get("vnp_PayDate"),
        "updatedAt": now,
    }
    db.payments.update_one({"_id": payment["_id"]}, {"$set": update})


def mark_vnpay_success_or_refund(db, payment, params):
    """Idempotently settle a signed VNPay success; never issue if seats were lost.

    If VNPay says the customer paid but the seat hold is no longer usable, record the
    payment as successful-but-refund-required and create an administrative refund task.
    """
    now = now_utc()
    booking = db.bookings.find_one({"_id": payment.get("bookingId")})
    if not booking:
        return "ORDER_NOT_FOUND"

    set_vnpay_response_fields(db, payment, params)
    current_payment = db.payments.find_one({"_id": payment["_id"]}) or payment

    if booking.get("status") in {"PAID", "COMPLETED", "TICKET_ISSUED"}:
        db.payments.update_one({"_id": payment["_id"]}, {"$set": {"status": "SUCCEEDED", "paidAt": payment.get("paidAt") or now, "updatedAt": now}})
        return "SUCCEEDED"

    hold = db.seat_holds.find_one({"_id": booking.get("holdId"), "status": "CHECKOUT"})
    hold_expiry = utc_datetime((hold or {}).get("expiresAt"))
    seat_ids = (hold or {}).get("seatIds", [])
    hold_valid = bool(hold and hold_expiry and hold_expiry > now and booking.get("status") == "PENDING_PAYMENT")
    held_seats = list(db.seats.find({
        "_id": {"$in": seat_ids}, "tripId": booking.get("tripId"),
        "holdId": (hold or {}).get("_id"), "status": "HELD",
    })) if hold else []
    already_booked = list(db.seats.find({
        "_id": {"$in": booking.get("seatIds", [])}, "tripId": booking.get("tripId"),
        "bookingCode": booking.get("bookingCode"), "status": "BOOKED",
    }))
    seats_ready = bool(seat_ids) and (len(held_seats) == len(seat_ids) or len(already_booked) == len(booking.get("seatIds", [])))

    if not hold_valid or not seats_ready:
        # Release stale HELD seats as part of the reconciliation flow. A signed VNPay
        # success is still recorded for refund review; never silently discard captured money.
        if not hold_valid:
            release_expired_seats(db, booking.get("tripId"))
        # The payment is genuinely reported as successful by VNPay, but Travel Mini
        # cannot issue a ticket safely. Preserve evidence and create a refund review.
        db.payments.update_one({"_id": payment["_id"]}, {"$set": {
            "status": "SUCCEEDED_REFUND_REQUIRED", "paidAt": now,
            "refundRequired": True, "updatedAt": now,
        }})
        db.bookings.update_one({"_id": booking["_id"], "status": {"$in": ["PENDING_PAYMENT", "EXPIRED"]}}, {"$set": {
            "status": "PAYMENT_REVIEW", "updatedAt": now,
            "paymentReviewReason": "VNPay payment succeeded after seat hold expired or seats became unavailable.",
        }})
        db.refunds.update_one(
            {"paymentId": payment["_id"]},
            {"$setOnInsert": {
                "_id": str(uuid4()), "orderType": "BUS", "bookingId": booking["_id"],
                "bookingCode": booking.get("bookingCode"), "paymentId": payment["_id"],
                "userId": payment.get("userId"), "requestedAmount": payment.get("amount", 0),
                "reason": "VNPay payment succeeded but seats could not be confirmed; refund review required.",
                "status": "PENDING_REVIEW", "createdAt": now,
            }, "$set": {"updatedAt": now}},
            upsert=True,
        )
        return "REFUND_REVIEW"

    # Claim the payment to prevent ordinary duplicate callbacks from issuing duplicate tickets.
    if current_payment.get("status") == "PENDING":
        claimed = db.payments.update_one({"_id": payment["_id"], "status": "PENDING"}, {"$set": {"status": "PROCESSING", "updatedAt": now}})
        if claimed.modified_count != 1:
            current_payment = db.payments.find_one({"_id": payment["_id"]}) or current_payment
            if current_payment.get("status") == "SUCCEEDED" and booking.get("status") == "PAID":
                return "SUCCEEDED"
            if current_payment.get("status") not in {"PROCESSING", "SUCCEEDED"}:
                return "PROCESSING"
    elif current_payment.get("status") not in {"PROCESSING", "SUCCEEDED"}:
        return current_payment.get("status", "FAILED")

    # Re-read to handle a simultaneous return/IPN callback safely.
    existing_booking = db.bookings.find_one({"_id": booking["_id"]}) or booking
    if existing_booking.get("status") in {"PAID", "COMPLETED", "TICKET_ISSUED"}:
        db.payments.update_one({"_id": payment["_id"]}, {"$set": {"status": "SUCCEEDED", "updatedAt": now}})
        return "SUCCEEDED"

    if hold:
        db.seats.update_many(
            {"_id": {"$in": seat_ids}, "tripId": booking.get("tripId"), "holdId": hold["_id"], "status": "HELD"},
            {"$set": {"status": "BOOKED", "holdId": None, "heldUntil": None, "bookingCode": booking["bookingCode"]}},
        )
        db.seat_holds.update_one({"_id": hold["_id"], "status": "CHECKOUT"}, {"$set": {"status": "CONVERTED", "updatedAt": now}})
    db.bookings.update_one({"_id": booking["_id"], "status": "PENDING_PAYMENT"}, {"$set": {"status": "PAID", "paidAt": now, "updatedAt": now}})
    refreshed_booking = db.bookings.find_one({"_id": booking["_id"]}) or booking
    issue_tickets(db, refreshed_booking, now)
    db.payments.update_one({"_id": payment["_id"], "status": {"$in": ["PENDING", "PROCESSING", "SUCCEEDED"]}}, {"$set": {"status": "SUCCEEDED", "paidAt": payment.get("paidAt") or now, "updatedAt": now, "refundRequired": False}})
    return "SUCCEEDED"


def apply_vnpay_result(db, payment, params):
    """Validate amount/status and update local payment records for a signed callback."""
    try:
        received_amount = int(params.get("vnp_Amount", "0"))
    except (TypeError, ValueError):
        received_amount = -1
    expected_amount = int(payment.get("amount", 0)) * 100
    if received_amount != expected_amount:
        return "INVALID_AMOUNT"

    code = str(params.get("vnp_ResponseCode", ""))
    transaction_status = str(params.get("vnp_TransactionStatus", ""))
    if code == "00" and transaction_status == "00":
        return mark_vnpay_success_or_refund(db, payment, params)

    now = now_utc()
    set_vnpay_response_fields(db, payment, params)
    db.payments.update_one({"_id": payment["_id"], "status": {"$in": ["PENDING", "PROCESSING"]}}, {"$set": {
        "status": "FAILED", "updatedAt": now, "failureReason": f"VNPay response {code}/{transaction_status}",
    }})
    return "FAILED"


@bus_bp.get("/health")
def bus_health():
    try:
        db = get_db()
        return jsonify({"success": True, "module": "bus-booking", "database": db.name}), 200
    except Exception:
        return json_error("Không thể khởi tạo module đặt vé xe.", 503)


@bus_bp.get("/locations")
def bus_locations():
    db = get_db()
    query = request.args.get("q", "").strip()[:100]
    limit = min(max(request.args.get("limit", 8, type=int), 1), 20)
    if not query:
        criteria = {"$or": [
            {"transport": "BUS"},
            {"transport": {"$exists": False}, "type": {"$in": ["BUS_STATION", "BUS_STOP", "PLACE"]}},
        ]}
        items = list(db.locations.find(criteria).sort([("city", ASCENDING), ("name", ASCENDING)]).limit(limit))
    else:
        _matches, _codes, metadata = resolve_locations(db, query)
        items = [x["location"] for x in metadata]
        if not items:
            qnorm = norm(query)
            items = []
            for doc in db.locations.find({}).limit(1000):
                if not is_bus_location(doc):
                    continue
                fields = [doc.get("name", ""), doc.get("city", ""), doc.get("code", ""), *(doc.get("aliases", []) or [])]
                if any(qnorm in norm(v) for v in fields if v):
                    items.append(doc)
        # Deduplicate by code/id and keep relevant bus-served locations first.
        seen = set()
        unique = []
        for doc in items:
            if not is_bus_location(doc):
                continue
            key = str(doc.get("code", doc.get("_id")))
            if key not in seen:
                seen.add(key)
                unique.append(doc)
        items = unique[:limit]
    return jsonify({"success": True, "items": [public_location(doc) for doc in items]})


@bus_bp.get("/trips")
def search_bus_trips():
    """Search by destination + travel date; origin is intentionally optional."""
    db = get_db()
    destination = request.args.get("destination", "").strip()
    destination_code = request.args.get("destinationCode", "").strip()
    travel_date = request.args.get("date", "").strip()
    if not destination and not destination_code:
        return json_error("Vui lòng nhập địa điểm muốn đến.", 400)
    try:
        date.fromisoformat(travel_date)
    except ValueError:
        return json_error("Ngày đi không hợp lệ. Dùng định dạng YYYY-MM-DD.", 400)
    vietnam_tz = timezone(timedelta(hours=7))
    if travel_date < datetime.now(vietnam_tz).date().isoformat():
        return json_error("Ngày đi không thể nằm trong quá khứ.", 400)

    _locations, destination_codes, location_meta = resolve_locations(db, destination, destination_code or None)
    origin_code = request.args.get("originCode", "").strip()
    if not destination_codes:
        # allow simple city/station query even before its locations document is curated.
        qnorm = norm(destination)
        destination_codes = []
        for trip in db.trips.find({"transport": "BUS", "departureDate": travel_date}).limit(2000):
            if qnorm and (qnorm in norm(trip.get("destinationName")) or qnorm in norm(trip.get("destinationCity")) or qnorm == norm(trip.get("destinationCode"))):
                destination_codes.append(str(trip.get("destinationCode", "")))
        destination_codes = list(dict.fromkeys(destination_codes))

    criteria = {"transport": "BUS", "departureDate": travel_date, "status": {"$nin": ["CANCELLED", "CLOSED"]}}
    if destination_codes:
        criteria["destinationCode"] = {"$in": destination_codes}
    else:
        return jsonify({"success": True, "items": [], "pagination": {"page": 1, "limit": 10, "total": 0, "pages": 0}, "message": "Chưa có chuyến phù hợp với địa điểm này. Hãy thử chọn bến xe hoặc địa điểm gần đó."})
    if origin_code:
        criteria["originCode"] = origin_code
    provider_filter = request.args.get("provider", "").strip()
    vehicle_filter = request.args.get("vehicleType", "").strip()
    if provider_filter:
        criteria["provider"] = {"$regex": re.escape(provider_filter), "$options": "i"}
    if vehicle_filter:
        criteria["vehicleType"] = vehicle_filter

    try:
        trips = list(db.trips.find(criteria).limit(1000))
        desired_norm = norm(destination)
        enriched = []
        for trip in trips:
            trip_id = str(trip.get("_id"))
            available = trip_available_count(db, trip_id)
            if available <= 0:
                continue
            price = fare_for_trip(db, trip)
            min_price = request.args.get("minPrice", type=int)
            max_price = request.args.get("maxPrice", type=int)
            if min_price is not None and price < min_price:
                continue
            if max_price is not None and price > max_price:
                continue
            try:
                departure_hour = int(trip.get("departureHour"))
            except (TypeError, ValueError):
                departure_at = trip.get("departureAt")
                departure_hour = departure_at.astimezone(timezone(timedelta(hours=7))).hour if isinstance(departure_at, datetime) and departure_at.tzinfo else (departure_at.hour if isinstance(departure_at, datetime) else 0)
            time_band = request.args.get("time", "")
            if time_band == "morning" and not 5 <= departure_hour < 12:
                continue
            if time_band == "afternoon" and not 12 <= departure_hour < 17:
                continue
            if time_band == "evening" and not 17 <= departure_hour < 21:
                continue
            if time_band == "night" and not (departure_hour >= 21 or departure_hour < 5):
                continue
            exact_target = str(trip.get("destinationCode", "")) == str(destination_code)
            text_match = desired_norm in {norm(trip.get("destinationName")), norm(trip.get("destinationCity")), norm(trip.get("destinationCode"))}
            match_type = "EXACT" if exact_target or text_match else "NEARBY"
            meta_item = next((m for m in location_meta if str(m["location"].get("code", m["location"].get("_id"))) in destination_codes), None)
            if meta_item and meta_item["matchType"] == "NEARBY":
                match_type = "NEARBY"
            match = {
                "type": match_type,
                "searchedDestination": destination,
                "actualDropoff": trip.get("destinationName", ""),
                "note": (f"Chuyến trả tại {trip.get('destinationName')}; kiểm tra điểm đón/trả với nhà xe trước khi đặt." if match_type == "NEARBY" else "Chuyến phù hợp với địa điểm đã tìm."),
            }
            enriched.append({"trip": trip, "price": price, "available": available, "match": match})
    except PyMongoError:
        return json_error("Không truy vấn được chuyến xe. Kiểm tra kết nối MongoDB.", 503)

    sort_by = request.args.get("sort", "recommended")
    def departure_timestamp(item):
        value = utc_datetime(item["trip"].get("departureAt"))
        return value.timestamp() if value else 0

    if sort_by == "price":
        enriched.sort(key=lambda item: (item["price"], departure_timestamp(item)))
    elif sort_by == "departure":
        enriched.sort(key=departure_timestamp)
    elif sort_by == "duration":
        enriched.sort(key=lambda item: item["trip"].get("durationMinutes", 999999))
    else:
        # Prefer the requested stop/city, then available seats, then seed/provider score.
        enriched.sort(key=lambda item: (item["match"]["type"] == "EXACT", item["trip"].get("recommendedScore", 0), item["available"]), reverse=True)

    page = max(request.args.get("page", 1, type=int), 1)
    limit = min(max(request.args.get("limit", 10, type=int), 1), 30)
    total = len(enriched)
    selected = enriched[(page - 1) * limit:page * limit]
    return jsonify({
        "success": True,
        "query": {"destination": destination, "destinationCode": destination_code, "date": travel_date},
        "items": [public_trip(item["trip"], item["price"], item["available"], item["match"]) for item in selected],
        "recommendations": {"strategy": "destination_match_then_availability_and_score", "providers": list(dict.fromkeys(x["trip"].get("provider", "") for x in enriched))[:5]},
        "pagination": {"page": page, "limit": limit, "total": total, "pages": (total + limit - 1) // limit},
    })


@bus_bp.get("/trips/<trip_id>")
def bus_trip_detail(trip_id):
    db = get_db()
    trip = db.trips.find_one({"_id": trip_id, "transport": "BUS"})
    if not trip:
        return json_error("Không tìm thấy chuyến xe.", 404)
    available = trip_available_count(db, trip_id)
    return jsonify({"success": True, "trip": public_trip(trip, fare_for_trip(db, trip), available)})


@bus_bp.get("/trips/<trip_id>/seats")
def bus_trip_seats(trip_id):
    db = get_db()
    trip = db.trips.find_one({"_id": trip_id, "transport": "BUS"}, {"_id": 1})
    if not trip:
        return json_error("Không tìm thấy chuyến xe.", 404)
    release_expired_seats(db, trip_id)
    seats = list(db.seats.find({"tripId": trip_id}).sort([("deck", ASCENDING), ("row", ASCENDING), ("column", ASCENDING), ("seatNumber", ASCENDING)]))
    items = []
    for seat in seats:
        items.append({
            "id": str(seat.get("_id")), "tripId": trip_id, "seatNumber": seat.get("seatNumber", ""),
            "seatType": seat.get("seatType", "SEAT"), "status": seat.get("status", "AVAILABLE"),
            "row": seat.get("row", 0), "column": seat.get("column", 0), "deck": seat.get("deck", 1),
            "coach": seat.get("coach", ""),
        })
    return jsonify({"success": True, "items": items, "summary": {"total": len(items), "available": sum(1 for x in items if x["status"] == "AVAILABLE")}})


@bus_bp.post("/seat-holds")
def create_bus_seat_hold():
    db = get_db()
    payload = request.get_json(silent=True) or {}
    trip_id = str(payload.get("tripId", "")).strip()
    seat_ids = payload.get("seatIds")
    session_id = str(payload.get("sessionId", "")).strip()[:100]
    if not trip_id or not isinstance(seat_ids, list) or not seat_ids or not session_id:
        return json_error("Cần có chuyến xe, danh sách ghế và sessionId.", 400)
    seat_ids = [str(s) for s in seat_ids]
    if len(seat_ids) > MAX_HELD_SEATS:
        return json_error(f"Mỗi lượt chỉ giữ tối đa {MAX_HELD_SEATS} chỗ.", 400)
    if len(seat_ids) != len(set(seat_ids)):
        return json_error("Danh sách có ghế bị trùng.", 400)
    trip = db.trips.find_one({"_id": trip_id, "transport": "BUS", "status": {"$nin": ["CANCELLED", "CLOSED"]}})
    if not trip:
        return json_error("Chuyến xe không tồn tại hoặc đã ngừng hoạt động.", 404)
    now = now_utc()
    departure_at = trip.get("departureAt")
    departure_utc = utc_datetime(departure_at)
    if departure_utc and departure_utc <= now:
        return json_error("Chuyến xe đã khởi hành, không thể giữ chỗ.", 409)
    release_expired_seats(db, trip_id)
    hold_id = str(uuid4())
    expires = now + timedelta(minutes=HOLD_MINUTES)
    user_id = None
    try:
        from flask_jwt_extended import verify_jwt_in_request
        verify_jwt_in_request(optional=True)
        current_identity = get_jwt_identity()
        if current_identity is not None:
            resolved_user_id, _resolved_role, _resolved_doc = current_user_context(db)
            user_id = resolved_user_id or (str(current_identity.get("id") or current_identity.get("_id") or current_identity.get("sub")) if isinstance(current_identity, dict) else str(current_identity))
    except Exception:
        user_id = None
    locked = []
    try:
        db.seat_holds.insert_one({"_id": hold_id, "tripId": trip_id, "sessionId": session_id, "userId": user_id,
                                  "seatIds": [], "status": "ACTIVE", "createdAt": now, "expiresAt": expires})
        for seat_id in seat_ids:
            seat = db.seats.find_one_and_update(
                {"_id": seat_id, "tripId": trip_id, "$or": [
                    {"status": "AVAILABLE"},
                    {"status": "HELD", "heldUntil": {"$lte": now}},
                ]},
                {"$set": {"status": "HELD", "holdId": hold_id, "heldUntil": expires}},
                return_document=ReturnDocument.AFTER,
            )
            if not seat:
                raise ValueError(f"Chỗ {seat_id} vừa được người khác giữ hoặc không còn trống.")
            locked.append(seat_id)
        db.seat_holds.update_one({"_id": hold_id}, {"$set": {"seatIds": locked}})
    except ValueError as exc:
        if locked:
            db.seats.update_many({"_id": {"$in": locked}, "holdId": hold_id}, {"$set": {"status": "AVAILABLE", "holdId": None, "heldUntil": None}})
        db.seat_holds.delete_one({"_id": hold_id})
        return json_error(str(exc), 409)
    except PyMongoError:
        if locked:
            db.seats.update_many({"_id": {"$in": locked}, "holdId": hold_id}, {"$set": {"status": "AVAILABLE", "holdId": None, "heldUntil": None}})
        db.seat_holds.delete_one({"_id": hold_id})
        return json_error("Không thể giữ chỗ lúc này. Vui lòng thử lại.", 503)
    return jsonify({"success": True, "hold": {"id": hold_id, "tripId": trip_id, "seatIds": locked,
        "expiresAt": expires.isoformat(), "expiresInSeconds": HOLD_MINUTES * 60}}), 201


@bus_bp.get("/seat-holds/<hold_id>")
def get_bus_seat_hold(hold_id):
    db = get_db()
    hold = db.seat_holds.find_one({"_id": hold_id})
    if not hold:
        return json_error("Không tìm thấy lượt giữ chỗ.", 404)
    if (utc_datetime(hold.get("expiresAt")) or datetime.min.replace(tzinfo=timezone.utc)) <= now_utc() or hold.get("status") not in ("ACTIVE", "CHECKOUT"):
        release_expired_seats(db, hold.get("tripId"))
        return json_error("Thời gian giữ chỗ đã hết hoặc lượt giữ không còn hiệu lực.", 410)
    session_id = request.args.get("sessionId", "").strip()
    identity = ""
    try:
        from flask_jwt_extended import verify_jwt_in_request
        verify_jwt_in_request(optional=True)
        identity = str(get_jwt_identity() or "")
    except Exception:
        pass
    if hold.get("sessionId") != session_id and (not hold.get("userId") or hold.get("userId") != identity):
        return json_error("Bạn không có quyền xem lượt giữ chỗ này.", 403)
    return jsonify({"success": True, "hold": {"id": hold_id, "tripId": hold.get("tripId"), "seatIds": hold.get("seatIds", []),
        "status": hold.get("status"), "expiresAt": iso(hold.get("expiresAt"))}})


@bus_bp.delete("/seat-holds/<hold_id>")
def release_bus_seat_hold(hold_id):
    db = get_db()
    hold = db.seat_holds.find_one({"_id": hold_id})
    if not hold:
        return jsonify({"success": True, "message": "Lượt giữ chỗ đã được giải phóng hoặc hết hạn."})
    session_id = str(request.args.get("sessionId", "")).strip()
    if session_id != hold.get("sessionId"):
        return json_error("Không xác minh được phiên giữ chỗ.", 403)
    db.seats.update_many({"holdId": hold_id, "status": "HELD"}, {"$set": {"status": "AVAILABLE", "holdId": None, "heldUntil": None}})
    db.seat_holds.update_one({"_id": hold_id}, {"$set": {"status": "RELEASED", "updatedAt": now_utc()}})
    db.bookings.update_many({"holdId": hold_id, "status": "PENDING_PAYMENT"}, {"$set": {"status": "CANCELLED", "updatedAt": now_utc()}})
    return jsonify({"success": True, "message": "Đã giải phóng chỗ."})


@bus_bp.post("/bookings")
@jwt_required()
def create_bus_booking():
    db = get_db()
    user_id, _role, _user_doc = current_user_context(db)
    payload = request.get_json(silent=True) or {}
    hold_id = str(payload.get("holdId", "")).strip()
    session_id = str(payload.get("sessionId", "")).strip()[:100]
    passengers = payload.get("passengers")
    promo_code = str(payload.get("promotionCode", "")).strip().upper()
    if not hold_id or not session_id or not isinstance(passengers, list) or not passengers:
        return json_error("Cần có lượt giữ chỗ, sessionId và thông tin hành khách.", 400)
    hold = db.seat_holds.find_one({"_id": hold_id, "status": {"$in": ["ACTIVE", "CHECKOUT"]}})
    if not hold:
        return json_error("Lượt giữ chỗ không tồn tại hoặc đã hết hạn.", 410)
    now = now_utc()
    if (utc_datetime(hold.get("expiresAt")) or datetime.min.replace(tzinfo=timezone.utc)) <= now:
        release_expired_seats(db, hold.get("tripId"))
        return json_error("Thời gian giữ chỗ đã hết. Hãy chọn lại ghế.", 410)
    if hold.get("sessionId") != session_id:
        return json_error("Phiên giữ chỗ không khớp. Hãy tiếp tục trên cùng trình duyệt đã chọn ghế.", 403)
    if hold.get("userId") and hold.get("userId") not in (user_id, identity_value()):
        return json_error("Lượt giữ chỗ thuộc tài khoản khác.", 403)
    if len(passengers) != len(hold.get("seatIds", [])):
        return json_error("Số hành khách phải bằng số chỗ đã giữ.", 400)
    normalized_passengers = []
    seats_by_id = {str(s["_id"]): s for s in db.seats.find({"_id": {"$in": hold["seatIds"]}, "tripId": hold["tripId"], "holdId": hold_id, "status": "HELD"})}
    if len(seats_by_id) != len(hold.get("seatIds", [])):
        return json_error("Một hoặc nhiều chỗ không còn được giữ. Vui lòng chọn lại.", 409)
    for index, passenger in enumerate(passengers):
        if not isinstance(passenger, dict):
            return json_error("Thông tin hành khách không hợp lệ.", 400)
        full_name = str(passenger.get("fullName", "")).strip()[:120]
        phone = str(passenger.get("phone", "")).strip()[:30]
        if len(full_name) < 2 or len(phone) < 8:
            return json_error(f"Vui lòng nhập họ tên và số điện thoại hợp lệ cho hành khách {index + 1}.", 400)
        seat_id = str(passenger.get("seatId") or hold["seatIds"][index])
        if seat_id not in seats_by_id or any(x.get("seatId") == seat_id for x in normalized_passengers):
            return json_error("Ghế gắn với hành khách không khớp lượt giữ chỗ.", 400)
        normalized_passengers.append({"fullName": full_name, "phone": phone, "email": str(passenger.get("email", "")).strip()[:120],
                                      "seatId": seat_id, "seatNumber": seats_by_id[seat_id].get("seatNumber", "")})
    trip = db.trips.find_one({"_id": hold["tripId"], "transport": "BUS"})
    if not trip:
        return json_error("Không tìm thấy chuyến xe.", 404)
    existing = db.bookings.find_one({"holdId": hold_id, "userId": user_id})
    if existing:
        return jsonify({"success": True, "booking": {"id": str(existing["_id"]), "bookingCode": existing["bookingCode"], "status": existing["status"], "finalAmount": existing.get("finalAmount", 0)}}), 200
    unit_price = fare_for_trip(db, trip)
    subtotal = unit_price * len(normalized_passengers)
    discount_amount, promotion_snapshot = 0, None
    if promo_code:
        promo = db.promotions.find_one({"code": promo_code, "status": {"$in": ["ACTIVE", "active", True]}})
        if not promo:
            return json_error("Mã giảm giá không tồn tại hoặc đã ngừng hoạt động.", 400)
        start = promo.get("startAt") or promo.get("start_at")
        end = promo.get("endAt") or promo.get("end_at")
        start_utc, end_utc = utc_datetime(start), utc_datetime(end)
        if (start_utc and start_utc > now) or (end_utc and end_utc < now):
            return json_error("Mã giảm giá chưa có hiệu lực hoặc đã hết hạn.", 400)
        usage_limit = promo.get("usageLimit", promo.get("usage_limit"))
        if usage_limit is not None and int(promo.get("usedCount", 0)) >= int(usage_limit):
            return json_error("Mã giảm giá đã hết lượt sử dụng.", 400)
        minimum = int(promo.get("minimumAmount", promo.get("minimum_amount", 0)) or 0)
        if subtotal < minimum:
            return json_error(f"Đơn hàng cần tối thiểu {minimum:,} đồng để áp mã này.", 400)
        discount_type = str(promo.get("discountType", promo.get("discount_type", "PERCENT"))).upper()
        discount_value = int(promo.get("discountValue", promo.get("discount_value", 0)) or 0)
        if discount_type in ("PERCENT", "PERCENTAGE"):
            discount_amount = subtotal * min(max(discount_value, 0), 100) // 100
            max_discount = promo.get("maxDiscount", promo.get("max_discount"))
            if max_discount is not None:
                discount_amount = min(discount_amount, int(max_discount))
        else:
            discount_amount = min(subtotal, max(0, discount_value))
        promotion_snapshot = {"code": promo_code, "discountType": discount_type, "discountValue": discount_value}
    total = max(0, subtotal - discount_amount)
    booking_code = f"TM-BUS-{now.strftime('%y%m%d')}-{secrets.token_hex(3).upper()}"
    booking = {
        "_id": str(uuid4()), "bookingCode": booking_code, "orderType": "BUS", "userId": user_id,
        "holdId": hold_id, "tripId": str(trip.get("_id")), "providerId": str(trip.get("providerId", "")),
        "provider": trip.get("provider", ""), "tripSnapshot": {"originName": trip.get("originName", ""), "originCity": trip.get("originCity", ""),
        "destinationName": trip.get("destinationName", ""), "destinationCity": trip.get("destinationCity", ""),
        "departureAt": trip.get("departureAt"), "arrivalAt": trip.get("arrivalAt"), "vehicleType": trip.get("vehicleType", "")},
        "passengers": normalized_passengers, "seatIds": hold.get("seatIds", []), "subtotal": subtotal,
        "discountAmount": discount_amount, "finalAmount": total, "promotion": promotion_snapshot,
        "currency": "VND", "status": "PENDING_PAYMENT", "createdAt": now, "updatedAt": now,
        "holdExpiresAt": hold.get("expiresAt"),
    }
    # Atomically claim this hold for checkout to stop duplicate orders from races.
    claim = db.seat_holds.update_one(
        {"_id": hold_id, "status": "ACTIVE", "expiresAt": {"$gt": now}},
        {"$set": {"status": "CHECKOUT", "bookingCode": booking_code, "userId": user_id, "checkoutAt": now}},
    )
    if claim.modified_count != 1:
        existing = db.bookings.find_one({"holdId": hold_id, "userId": user_id})
        if existing:
            return jsonify({"success": True, "booking": {"id": str(existing["_id"]), "bookingCode": existing["bookingCode"], "status": existing["status"], "finalAmount": existing.get("finalAmount", 0)}}), 200
        return json_error("Lượt giữ chỗ đã được dùng hoặc đang được xử lý. Hãy tải lại trạng thái.", 409)
    try:
        db.bookings.insert_one(booking)
    except PyMongoError:
        db.seat_holds.update_one(
            {"_id": hold_id, "status": "CHECKOUT", "bookingCode": booking_code},
            {"$set": {"status": "ACTIVE"}, "$unset": {"bookingCode": "", "userId": "", "checkoutAt": ""}},
        )
        return json_error("Không tạo được đơn đặt vé. Vui lòng thử lại.", 503)
    if promotion_snapshot:
        try:
            db.promotions.update_one({"code": promo_code}, {"$inc": {"usedCount": 1}})
        except PyMongoError:
            # The order exists; usage count can be reconciled by Admin if needed.
            pass
    return jsonify({"success": True, "booking": {"id": booking["_id"], "bookingCode": booking_code, "status": booking["status"],
        "subtotal": subtotal, "discountAmount": discount_amount, "finalAmount": total, "currency": "VND", "holdExpiresAt": iso(booking["holdExpiresAt"])}}), 201


@bus_bp.get("/bookings")
@jwt_required()
def list_my_bus_bookings():
    db = get_db()
    user_id, _role, _doc = current_user_context(db)
    page = max(request.args.get("page", 1, type=int), 1)
    limit = min(max(request.args.get("limit", 10, type=int), 1), 50)
    criteria = {"userId": user_id, "orderType": "BUS"}
    total = db.bookings.count_documents(criteria)
    docs = list(db.bookings.find(criteria).sort("createdAt", DESCENDING).skip((page - 1) * limit).limit(limit))
    items = []
    for doc in docs:
        items.append({"id": str(doc["_id"]), "bookingCode": doc.get("bookingCode"), "status": doc.get("status"),
                      "provider": doc.get("provider"), "trip": {**doc.get("tripSnapshot", {}),
                      "departureAt": iso(doc.get("tripSnapshot", {}).get("departureAt")), "arrivalAt": iso(doc.get("tripSnapshot", {}).get("arrivalAt"))},
                      "passengers": doc.get("passengers", []), "seatIds": doc.get("seatIds", []),
                      "finalAmount": doc.get("finalAmount", 0), "createdAt": iso(doc.get("createdAt"))})
    return jsonify({"success": True, "items": items, "pagination": {"page": page, "limit": limit, "total": total, "pages": (total + limit - 1) // limit}})


@bus_bp.get("/bookings/<booking_code>")
@jwt_required()
def get_my_bus_booking(booking_code):
    db = get_db()
    user_id, role, _doc = current_user_context(db)
    booking = booking_by_code(db, booking_code)
    if not booking:
        return json_error("Không tìm thấy đơn đặt vé.", 404)
    allowed = str(booking.get("userId")) == user_id or role == "ADMIN"
    if role == "PROVIDER":
        user_doc = _doc or {}
        provider_id = str(user_doc.get("providerId") or user_doc.get("provider_id") or identity_value())
        allowed = str(booking.get("providerId", "")) == provider_id
    if not allowed:
        return json_error("Bạn không có quyền xem đơn đặt vé này.", 403)
    tickets = list(db.tickets.find({"bookingId": booking["_id"]}))
    trip_snapshot = dict(booking.get("tripSnapshot", {}))
    for key in ("departureAt", "arrivalAt"):
        trip_snapshot[key] = iso(trip_snapshot.get(key))
    return jsonify({"success": True, "booking": {"id": str(booking["_id"]), "bookingCode": booking["bookingCode"],
        "status": booking.get("status"), "tripId": booking.get("tripId"), "provider": booking.get("provider"),
        "trip": trip_snapshot, "passengers": booking.get("passengers", []), "subtotal": booking.get("subtotal", 0),
        "discountAmount": booking.get("discountAmount", 0), "finalAmount": booking.get("finalAmount", 0),
        "promotion": booking.get("promotion"), "createdAt": iso(booking.get("createdAt")),
        "tickets": [{"ticketCode": t.get("ticketCode"), "seatNumber": t.get("seatNumber"), "passenger": t.get("passenger", {}), "qrPayload": t.get("qrPayload"), "qrDataUrl": qr_data_url(t.get("qrPayload", "")), "status": t.get("status")} for t in tickets]}})


@bus_bp.post("/bookings/<booking_code>/payments")
@jwt_required()
def create_bus_payment(booking_code):
    db = get_db()
    user_id, role, _doc = current_user_context(db)
    booking = booking_by_code(db, booking_code)
    if not booking:
        return json_error("Không tìm thấy đơn đặt vé.", 404)
    if str(booking.get("userId")) != user_id and role != "ADMIN":
        return json_error("Bạn không có quyền thanh toán đơn này.", 403)
    if booking.get("status") != "PENDING_PAYMENT":
        return json_error("Đơn không ở trạng thái chờ thanh toán.", 409)
    if (utc_datetime(booking.get("holdExpiresAt")) or datetime.min.replace(tzinfo=timezone.utc)) <= now_utc():
        release_expired_seats(db, booking.get("tripId"))
        db.bookings.update_one({"_id": booking["_id"], "status": "PENDING_PAYMENT"}, {"$set": {"status": "EXPIRED", "updatedAt": now_utc()}})
        return json_error("Thời gian giữ chỗ đã hết. Đơn không thể thanh toán.", 410)

    payload = request.get_json(silent=True) or {}
    provider = str(payload.get("provider", "VNPAY")).strip().upper()
    if provider not in {"VNPAY", "DEMO"}:
        return json_error("Phương thức thanh toán không được hỗ trợ.", 400)
    if provider == "DEMO" and os.getenv("BUS_DEMO_PAYMENT_ENABLED", "false").lower() != "true":
        return json_error("Thanh toán thử nghiệm đã bị tắt.", 403)

    cfg = vnpay_config()
    if provider == "VNPAY":
        if not cfg["enabled"] or not cfg["tmn_code"] or not cfg["hash_secret"]:
            return json_error(
                "VNPay Sandbox chưa được cấu hình. Hãy thêm VNPAY_ENABLED, VNPAY_TMN_CODE và VNPAY_HASH_SECRET vào backend/.env rồi khởi động lại Flask.",
                503,
            )
        if not cfg["return_url"]:
            return json_error("Thiếu VNPAY_RETURN_URL trong backend/.env.", 503)

    # If the user explicitly switches from a local DEMO attempt to VNPay, cancel only
    # the still-pending DEMO attempt; never cancel another real gateway payment here.
    if provider == "VNPAY":
        db.payments.update_many(
            {"bookingId": booking["_id"], "provider": "DEMO", "status": "PENDING"},
            {"$set": {"status": "CANCELLED", "updatedAt": now_utc()}},
        )

    payment = db.payments.find_one({"bookingId": booking["_id"], "provider": provider, "status": {"$in": ["PENDING", "PROCESSING"]}})
    if payment is None:
        now = now_utc()
        transaction_code = f"TM{now.astimezone(VN_TIMEZONE).strftime('%y%m%d%H%M%S')}{secrets.token_hex(4).upper()}"
        payment = {
            "_id": str(uuid4()), "orderType": "BUS", "orderId": booking["_id"], "bookingId": booking["_id"],
            "bookingCode": booking_code, "userId": user_id, "provider": provider,
            "transactionCode": transaction_code, "amount": booking.get("finalAmount", 0),
            "currency": "VND", "status": "PENDING", "createdAt": now, "paidAt": None,
        }
        db.payments.insert_one(payment)

    payment_url = payment.get("paymentUrl")
    if provider == "VNPAY" and not payment_url:
        hold = db.seat_holds.find_one({"_id": booking.get("holdId"), "status": "CHECKOUT"})
        try:
            payment_url = build_vnpay_payment_url(payment, booking, hold, request.remote_addr)
        except RuntimeError as exc:
            db.payments.update_one({"_id": payment["_id"], "status": "PENDING"}, {"$set": {"status": "FAILED", "failureReason": str(exc), "updatedAt": now_utc()}})
            return json_error(str(exc), 503)
        db.payments.update_one({"_id": payment["_id"]}, {"$set": {"paymentUrl": payment_url, "vnpTxnRef": payment["transactionCode"], "updatedAt": now_utc()}})

    result = {
        "id": payment["_id"], "transactionCode": payment["transactionCode"],
        "amount": payment["amount"], "currency": payment.get("currency", "VND"),
        "status": payment["status"], "provider": payment["provider"],
    }
    if provider == "VNPAY":
        result["paymentUrl"] = payment_url
        result["message"] = "Chuyển hướng đến VNPay để chọn QR hoặc ngân hàng/ứng dụng được hỗ trợ."
        return jsonify({"success": True, "payment": result}), 201
    result["demoEnabled"] = True
    return jsonify({"success": True, "payment": result}), 201


@bus_bp.get("/payments/vnpay/return")
def vnpay_return():
    """Browser return from VNPay. Signature is verified server-side before applying status."""
    from flask import redirect

    valid, params, _message = verify_vnpay_query(request.args)
    if not valid:
        return redirect(vnpay_frontend_redirect(None, "vnpay_invalid_signature"), code=302)
    txn_ref = params.get("vnp_TxnRef", "")
    db = get_db()
    payment = db.payments.find_one({"provider": "VNPAY", "$or": [{"vnpTxnRef": txn_ref}, {"transactionCode": txn_ref}]})
    if not payment:
        return redirect(vnpay_frontend_redirect(None, "vnpay_order_not_found"), code=302)
    try:
        received_amount = int(params.get("vnp_Amount", "0"))
    except (TypeError, ValueError):
        received_amount = -1
    if received_amount != int(payment.get("amount", 0)) * 100:
        return redirect(vnpay_frontend_redirect(payment.get("bookingCode"), "vnpay_invalid_amount"), code=302)

    status = apply_vnpay_result(db, payment, params)
    target_status = {
        "SUCCEEDED": "vnpay_success",
        "REFUND_REVIEW": "vnpay_review_refund",
        "FAILED": "vnpay_failed",
        "INVALID_AMOUNT": "vnpay_invalid_amount",
        "ORDER_NOT_FOUND": "vnpay_order_not_found",
        "PROCESSING": "vnpay_processing",
    }.get(status, "vnpay_processing")
    return redirect(vnpay_frontend_redirect(payment.get("bookingCode"), target_status), code=302)


@bus_bp.get("/payments/vnpay/ipn")
def vnpay_ipn():
    """VNPay server-to-server notification endpoint; configure a public HTTPS URL in VNPay portal."""
    valid, params, _message = verify_vnpay_query(request.args)
    if not valid:
        return jsonify({"RspCode": "97", "Message": "Invalid signature"}), 200
    txn_ref = params.get("vnp_TxnRef", "")
    db = get_db()
    payment = db.payments.find_one({"provider": "VNPAY", "$or": [{"vnpTxnRef": txn_ref}, {"transactionCode": txn_ref}]})
    if not payment:
        return jsonify({"RspCode": "01", "Message": "Order not found"}), 200
    try:
        received_amount = int(params.get("vnp_Amount", "0"))
    except (TypeError, ValueError):
        received_amount = -1
    if received_amount != int(payment.get("amount", 0)) * 100:
        return jsonify({"RspCode": "04", "Message": "Invalid amount"}), 200

    status = apply_vnpay_result(db, payment, params)
    if status in {"SUCCEEDED", "REFUND_REVIEW", "FAILED"}:
        return jsonify({"RspCode": "00", "Message": "Confirm Success"}), 200
    if status == "ORDER_NOT_FOUND":
        return jsonify({"RspCode": "01", "Message": "Order not found"}), 200
    return jsonify({"RspCode": "99", "Message": "Unknown error"}), 200


@bus_bp.post("/payments/demo/<payment_id>/complete")
@jwt_required()
def complete_demo_payment(payment_id):
    """Local-only payment simulator. Must be disabled when a real gateway is integrated."""
    if os.getenv("BUS_DEMO_PAYMENT_ENABLED", "true").lower() != "true":
        return json_error("Thanh toán thử nghiệm đã bị tắt.", 403)
    db = get_db()
    user_id, role, _doc = current_user_context(db)
    payment = db.payments.find_one({"_id": payment_id, "orderType": "BUS"})
    if not payment:
        return json_error("Không tìm thấy giao dịch.", 404)
    if str(payment.get("userId")) != user_id and role != "ADMIN":
        return json_error("Bạn không có quyền xác nhận giao dịch này.", 403)
    payload = request.get_json(silent=True) or {}
    succeeded = bool(payload.get("success", True))
    if payment.get("status") != "PENDING":
        booking = db.bookings.find_one({"_id": payment.get("bookingId")})
        return jsonify({"success": True, "message": "Giao dịch đã được xử lý trước đó.", "status": payment.get("status"), "bookingCode": (booking or {}).get("bookingCode")})
    booking = db.bookings.find_one({"_id": payment.get("bookingId")})
    if not booking:
        return json_error("Đơn đặt vé không tồn tại.", 404)
    now = now_utc()
    if not succeeded:
        db.payments.update_one({"_id": payment_id, "status": "PENDING"}, {"$set": {"status": "FAILED", "updatedAt": now}})
        return jsonify({"success": True, "status": "FAILED", "message": "Thanh toán thử nghiệm thất bại."})
    hold = db.seat_holds.find_one({"_id": booking.get("holdId"), "status": "CHECKOUT"})
    if not hold or (utc_datetime(hold.get("expiresAt")) or datetime.min.replace(tzinfo=timezone.utc)) <= now:
        release_expired_seats(db, booking.get("tripId"))
        db.bookings.update_one({"_id": booking["_id"], "status": "PENDING_PAYMENT"}, {"$set": {"status": "EXPIRED", "updatedAt": now}})
        return json_error("Thời gian giữ chỗ đã hết; giao dịch chưa được xác nhận. Vui lòng liên hệ hỗ trợ nếu tiền đã bị trừ.", 410)
    seat_docs = list(db.seats.find({"_id": {"$in": hold.get("seatIds", [])}, "tripId": booking.get("tripId"), "holdId": hold["_id"], "status": "HELD"}))
    if len(seat_docs) != len(hold.get("seatIds", [])):
        return json_error("Một hoặc nhiều ghế không còn được giữ. Chưa thể phát hành vé.", 409)
    update_payment = db.payments.update_one({"_id": payment_id, "status": "PENDING"}, {"$set": {"status": "SUCCEEDED", "paidAt": now, "updatedAt": now}})
    if update_payment.modified_count != 1:
        return json_error("Giao dịch đã được xử lý đồng thời; hãy tải lại trạng thái đơn.", 409)
    db.seats.update_many({"_id": {"$in": hold.get("seatIds", [])}, "tripId": booking.get("tripId"), "holdId": hold["_id"], "status": "HELD"},
                         {"$set": {"status": "BOOKED", "holdId": None, "heldUntil": None, "bookingCode": booking["bookingCode"]}})
    db.seat_holds.update_one({"_id": hold["_id"]}, {"$set": {"status": "CONVERTED", "updatedAt": now}})
    db.bookings.update_one({"_id": booking["_id"], "status": "PENDING_PAYMENT"}, {"$set": {"status": "PAID", "paidAt": now, "updatedAt": now}})
    issue_tickets(db, booking, now)
    return jsonify({"success": True, "status": "SUCCEEDED", "bookingCode": booking["bookingCode"], "message": "Thanh toán thử nghiệm thành công; vé đã được phát hành."})


@bus_bp.post("/bookings/<booking_code>/cancel")
@jwt_required()
def cancel_or_request_refund(booking_code):
    db = get_db()
    user_id, role, _doc = current_user_context(db)
    booking = booking_by_code(db, booking_code)
    if not booking:
        return json_error("Không tìm thấy đơn đặt vé.", 404)
    if str(booking.get("userId")) != user_id and role != "ADMIN":
        return json_error("Bạn không có quyền hủy đơn này.", 403)
    now = now_utc()
    if booking.get("status") == "PENDING_PAYMENT":
        hold_id = booking.get("holdId")
        db.seats.update_many({"holdId": hold_id, "status": "HELD"}, {"$set": {"status": "AVAILABLE", "holdId": None, "heldUntil": None}})
        db.seat_holds.update_one({"_id": hold_id}, {"$set": {"status": "RELEASED", "updatedAt": now}})
        db.bookings.update_one({"_id": booking["_id"]}, {"$set": {"status": "CANCELLED", "cancelledAt": now, "updatedAt": now}})
        return jsonify({"success": True, "status": "CANCELLED", "message": "Đã hủy đơn chưa thanh toán và giải phóng chỗ."})
    if booking.get("status") not in ("PAID", "TICKET_ISSUED", "CANCELLATION_REQUESTED"):
        return json_error("Đơn hiện không thể yêu cầu hủy.", 409)
    existing = db.refunds.find_one({"bookingId": booking["_id"], "status": {"$in": ["PENDING_REVIEW", "APPROVED_PENDING_GATEWAY", "PROCESSING"]}})
    if existing:
        refund = existing
    else:
        paid_payment = db.payments.find_one({"bookingId": booking["_id"], "status": "SUCCEEDED"})
        refund = {"_id": str(uuid4()), "orderType": "BUS", "bookingId": booking["_id"], "bookingCode": booking_code,
                  "paymentId": paid_payment.get("_id") if paid_payment else None, "userId": user_id, "requestedAmount": booking.get("finalAmount", 0),
                  "reason": str((request.get_json(silent=True) or {}).get("reason", "Khách yêu cầu hủy vé"))[:500],
                  "status": "PENDING_REVIEW", "createdAt": now, "processedAt": None}
        db.refunds.insert_one(refund)
        db.bookings.update_one({"_id": booking["_id"]}, {"$set": {"status": "CANCELLATION_REQUESTED", "updatedAt": now}})
    return jsonify({"success": True, "status": refund.get("status"), "refundId": refund["_id"],
                    "message": "Yêu cầu đã được ghi nhận; số tiền hoàn cần được xét theo chính sách nhà xe."}), 201


@bus_bp.get("/refunds")
@jwt_required()
def my_bus_refunds():
    db = get_db()
    user_id, role, _doc = current_user_context(db)
    criteria = {} if role == "ADMIN" else {"userId": user_id}
    items = list(db.refunds.find({**criteria, "orderType": "BUS"}).sort("createdAt", DESCENDING).limit(100))
    return jsonify({"success": True, "items": [{"id": str(x["_id"]), "bookingCode": x.get("bookingCode"), "requestedAmount": x.get("requestedAmount", 0),
        "reason": x.get("reason", ""), "status": x.get("status"), "createdAt": iso(x.get("createdAt")), "processedAt": iso(x.get("processedAt"))} for x in items]})


@bus_bp.post("/reviews")
@jwt_required()
def create_bus_review():
    db = get_db()
    user_id, _role, _doc = current_user_context(db)
    payload = request.get_json(silent=True) or {}
    booking_code = str(payload.get("bookingCode", "")).strip()
    rating = payload.get("rating")
    comment = str(payload.get("comment", "")).strip()[:1500]
    if not booking_code or not isinstance(rating, int) or rating < 1 or rating > 5:
        return json_error("Cần có mã đơn và điểm đánh giá từ 1 đến 5.", 400)
    booking = booking_by_code(db, booking_code)
    if not booking or str(booking.get("userId")) != user_id:
        return json_error("Không tìm thấy đơn đặt vé của tài khoản này.", 404)
    if booking.get("status") not in ("PAID", "COMPLETED"):
        return json_error("Chỉ có thể đánh giá đơn đã thanh toán.", 409)
    trip = db.trips.find_one({"_id": booking.get("tripId")}) or {}
    arrival_utc = utc_datetime(trip.get("arrivalAt"))
    if arrival_utc and arrival_utc > now_utc():
        return json_error("Chỉ có thể đánh giá sau khi chuyến đi hoàn thành.", 409)
    if db.reviews.find_one({"userId": user_id, "tripId": booking.get("tripId"), "bookingId": booking["_id"]}):
        return json_error("Đơn này đã được đánh giá.", 409)
    now = now_utc()
    review = {"_id": str(uuid4()), "userId": user_id, "bookingId": booking["_id"], "bookingCode": booking_code,
              "tripId": booking.get("tripId"), "providerId": booking.get("providerId"), "rating": rating,
              "comment": comment, "status": "PENDING_REVIEW", "createdAt": now}
    db.reviews.insert_one(review)
    return jsonify({"success": True, "reviewId": review["_id"], "status": review["status"], "message": "Đã gửi đánh giá, chờ kiểm duyệt."}), 201


@bus_bp.get("/verify-ticket/<qr_token>")
@jwt_required()
def verify_bus_ticket(qr_token):
    """Provider/admin lookup endpoint for validating a ticket QR payload."""
    denied = require_role("ADMIN", "PROVIDER")
    if denied:
        return denied
    db = get_db()
    ticket = db.tickets.find_one({"qrPayload": qr_token, "status": "ISSUED"})
    if not ticket:
        return json_error("Vé không tồn tại, đã hủy hoặc mã QR không hợp lệ.", 404)
    booking = db.bookings.find_one({"_id": ticket.get("bookingId")}) or {}
    _user_id, role, user_doc = current_user_context(db)
    if role == "PROVIDER":
        provider_id = str((user_doc or {}).get("providerId") or (user_doc or {}).get("provider_id") or identity_value())
        if str(booking.get("providerId", "")) != provider_id:
            return json_error("Nhà xe không có quyền xác minh vé của đơn vị khác.", 403)
    trip = db.trips.find_one({"_id": ticket.get("tripId")}) or {}
    return jsonify({"success": True, "valid": booking.get("status") in ("PAID", "COMPLETED"),
        "ticket": {"ticketCode": ticket.get("ticketCode"), "status": ticket.get("status"),
                   "passengerName": ticket.get("passenger", {}).get("fullName"), "seatNumber": ticket.get("seatNumber"),
                   "bookingCode": ticket.get("bookingCode"), "bookingStatus": booking.get("status"),
                   "providerId": booking.get("providerId"), "trip": {"originName": trip.get("originName"),
                   "destinationName": trip.get("destinationName"), "departureAt": iso(trip.get("departureAt"))}}})


@bus_bp.get("/admin/bookings")
@jwt_required()
def admin_bus_bookings():
    denied = require_role("ADMIN", "PROVIDER")
    if denied:
        return denied
    db = get_db()
    _user_id, role, _doc = current_user_context(db)
    page = max(request.args.get("page", 1, type=int), 1)
    limit = min(max(request.args.get("limit", 20, type=int), 1), 100)
    criteria = {"orderType": "BUS"}
    if role == "PROVIDER":
        user_doc = _doc or {}
        identity = str(user_doc.get("providerId") or user_doc.get("provider_id") or identity_value())
        criteria["providerId"] = identity
    total = db.bookings.count_documents(criteria)
    docs = list(db.bookings.find(criteria).sort("createdAt", DESCENDING).skip((page - 1) * limit).limit(limit))
    items = [{"bookingCode": x.get("bookingCode"), "status": x.get("status"), "provider": x.get("provider"),
              "trip": {"originName": x.get("tripSnapshot", {}).get("originName"), "destinationName": x.get("tripSnapshot", {}).get("destinationName"),
                       "departureAt": iso(x.get("tripSnapshot", {}).get("departureAt"))},
              "passengers": x.get("passengers", []), "finalAmount": x.get("finalAmount", 0), "createdAt": iso(x.get("createdAt"))} for x in docs]
    return jsonify({"success": True, "items": items, "pagination": {"page": page, "limit": limit, "total": total, "pages": (total + limit - 1) // limit}})


@bus_bp.post("/admin/refunds/<refund_id>/decision")
@jwt_required()
def admin_refund_decision(refund_id):
    denied = require_role("ADMIN")
    if denied:
        return denied
    db = get_db()
    payload = request.get_json(silent=True) or {}
    decision = str(payload.get("decision", "")).upper()
    note = str(payload.get("note", "")).strip()[:500]
    if decision not in ("APPROVE", "REJECT"):
        return json_error("decision phải là APPROVE hoặc REJECT.", 400)
    refund = db.refunds.find_one({"_id": refund_id, "orderType": "BUS"})
    if not refund:
        return json_error("Không tìm thấy yêu cầu hoàn tiền.", 404)
    if refund.get("status") != "PENDING_REVIEW":
        return json_error("Yêu cầu hoàn tiền đã được xử lý.", 409)
    status = "APPROVED_PENDING_GATEWAY" if decision == "APPROVE" else "REJECTED"
    now = now_utc()
    db.refunds.update_one({"_id": refund_id, "status": "PENDING_REVIEW"}, {"$set": {"status": status, "adminNote": note, "processedAt": now}})
    if decision == "APPROVE":
        db.bookings.update_one({"_id": refund.get("bookingId")}, {"$set": {"status": "CANCELLED_REFUND_PENDING", "updatedAt": now}})
        # Seat re-release happens only after business approval, not when customer first asks.
        booking = db.bookings.find_one({"_id": refund.get("bookingId")})
        if booking:
            db.seats.update_many({"bookingCode": booking.get("bookingCode"), "status": "BOOKED"}, {"$set": {"status": "AVAILABLE", "bookingCode": None}})
            db.tickets.update_many({"bookingId": booking["_id"]}, {"$set": {"status": "CANCELLED", "cancelledAt": now}})
    else:
        db.bookings.update_one({"_id": refund.get("bookingId"), "status": "CANCELLATION_REQUESTED"}, {"$set": {"status": "PAID", "updatedAt": now}})
    return jsonify({"success": True, "status": status, "message": "Đã ghi nhận quyết định. Hoàn tiền thực tế cần xử lý qua cổng thanh toán."})
