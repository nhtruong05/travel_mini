
import os

from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from pymongo import MongoClient
from pymongo.errors import PyMongoError

load_dotenv()

app = Flask(__name__)
CORS(app)

# Cấu hình MongoDB
mongo_uri = os.getenv(
    "MONGO_URI",
    "mongodb://localhost:27017/"
)
db_name = os.getenv("MONGO_DB_NAME", "travel_mini")

client = MongoClient(
    mongo_uri,
    serverSelectionTimeoutMS=3000
)

db = client[db_name]


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
    return jsonify({
        "message": "Welcome to Travel Mini API"
    }), 200


if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=int(os.getenv("PORT", "5000")),
        debug=False,
        use_reloader=False
    )