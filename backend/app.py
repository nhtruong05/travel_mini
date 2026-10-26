import os
from datetime import timedelta

from flask import Flask, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from dotenv import load_dotenv
from pymongo import MongoClient
from pymongo.errors import PyMongoError


load_dotenv()

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# JWT
app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY", "dev-secret-change-me")
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(hours=8)  # hoặc timedelta(days=1)
jwt = JWTManager(app)

# MongoDB
mongo_uri = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
db_name = os.getenv("MONGO_DB_NAME", "travel_mini")

client = MongoClient(mongo_uri, serverSelectionTimeoutMS=3000)
db = client[db_name]
app.config["DB"] = db


# Reject tokens that were revoked via /logout
@jwt.token_in_blocklist_loader
def is_token_revoked(jwt_header, jwt_payload):
    return db.revoked_tokens.find_one({"jti": jwt_payload["jti"]}) is not None


# Register blueprints
from routes.auth import auth_bp  # noqa: E402
from routes.bus import bus_bp  # noqa: E402
from routes.flights import flights_bp  # noqa: E402
from routes.trains import trains_bp  # noqa: E402

app.register_blueprint(auth_bp)
app.register_blueprint(bus_bp)
app.register_blueprint(flights_bp)
app.register_blueprint(trains_bp)


@app.get("/api/health")
def health_check():
    try:
        client.admin.command("ping")
        return jsonify({
            "success": True,
            "message": "Travel Mini API is running",
            "database": db.name,
            "mongodb": "connected"
        }), 200
    except PyMongoError:
        return jsonify({
            "success": False,
            "message": "Cannot connect to MongoDB"
        }), 503


@app.get("/")
def home():
    return jsonify({"message": "Welcome to Travel Mini API"}), 200


if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=int(os.getenv("PORT", "5000")),
        debug=False,
        use_reloader=False
    )