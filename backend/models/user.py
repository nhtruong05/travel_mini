
from datetime import datetime, timezone
from werkzeug.security import generate_password_hash, check_password_hash


def create_user_document(name, email, password):
    now = datetime.now(timezone.utc)

    return {
        "name": name.strip(),
        "email": email.strip().lower(),
        "password_hash": generate_password_hash(password),
        "role": "CUSTOMER",
        "created_at": now,
        "updated_at": now,
    }


def verify_password(user, password):
    return check_password_hash(user["password_hash"], password)