import os
import uuid
import math
from datetime import datetime
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from pymongo import MongoClient, ASCENDING, GEOSPHERE
from bson import ObjectId

import torch
from PIL import Image

import clip
from sentence_transformers import SentenceTransformer, util
import whisper

try:
    from deep_translator import GoogleTranslator
    HAS_TRANSLATOR = True
except Exception:
    HAS_TRANSLATOR = False

import requests


# ============================================================
# SETTINGS
# ============================================================

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
MONGO_DB = os.getenv("MONGO_DB", "community_problem_mapper")
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")

OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1:8b")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434/api/generate")

DUPLICATE_DISTANCE_METERS = 100
DUPLICATE_IMAGE_SIM_THRESHOLD = 0.80

# prevent same user from submitting same complaint again (same master)
SAME_USER_DUPLICATE_BLOCK = True

GOV_PHONE = "9999999999"


# ============================================================
# CATEGORY LOCK
# ============================================================

CATEGORY_DISPLAY = {
    "garbage on road": "Garbage on road",
    "waterlogging on road": "Waterlogging on road",
    "street light failure": "Streetlight failure",
    "potholes on road": "Potholes / damaged road",
    "broken footpath": "Broken footpath",
}

SUPPORTED_CATEGORIES = list(CATEGORY_DISPLAY.keys())

CLIP_PROMPTS = [
    "garbage on road",
    "waterlogging on road",
    "street light failure",
    "potholes on road",
    "broken footpath",
    "clear road",
]

FACT_MAP = {
    "waterlogging on road": "The road surface is covered with stagnant water.",
    "garbage on road": "Garbage is accumulated on the road surface.",
    "street light failure": "A street light at the location is not functioning properly.",
    "potholes on road": "The road surface shows visible damage in the form of potholes.",
    "broken footpath": "The footpath at the location is visibly damaged.",
}

IMPACT_MAP = {
    "waterlogging on road": [
        "difficulty for vehicles",
        "slow movement on road",
        "inconvenience to commuters",
        "difficulty for pedestrians",
    ],
    "garbage on road": [
        "obstruction on road",
        "unhygienic conditions",
        "bad smell",
        "difficulty for pedestrians",
    ],
    "street light failure": [
        "poor visibility",
        "unsafe conditions at night",
        "difficulty for pedestrians",
        "difficulty for vehicles at night",
    ],
    "potholes on road": [
        "vehicle damage",
        "slow traffic movement",
        "risk of accidents",
        "inconvenience to commuters",
    ],
    "broken footpath": [
        "difficulty for pedestrians",
        "pedestrians forced onto road",
        "unsafe walking conditions",
    ],
}


# ============================================================
# APP INIT
# ============================================================

app = FastAPI(title="Community Problem Mapper (Single File)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


# ============================================================
# DB INIT
# ============================================================

client = MongoClient(MONGO_URI)
db = client[MONGO_DB]

users_col = db["users"]
complaints_col = db["complaints"]
reports_col = db["reports"]
notifications_col = db["notifications"]


def ensure_indexes():
    users_col.create_index([("phone", ASCENDING)], unique=True)
    complaints_col.create_index([("location", GEOSPHERE)])
    reports_col.create_index([("master_complaint_id", ASCENDING)])
    reports_col.create_index([("phone", ASCENDING)])
    notifications_col.create_index([("phone", ASCENDING)])


@app.on_event("startup")
def startup():
    ensure_indexes()


# ============================================================
# AI MODELS INIT
# ============================================================

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

clip_model, clip_preprocess = clip.load("ViT-B/32", device=DEVICE)
clip_text_tokens = clip.tokenize(CLIP_PROMPTS).to(DEVICE)

sbert_model = SentenceTransformer("all-MiniLM-L6-v2")

# Accuracy over speed
whisper_model = whisper.load_model("small")


# ============================================================
# HELPERS
# ============================================================

def make_geojson_point(lat: float, lon: float) -> dict:
    return {"type": "Point", "coordinates": [float(lon), float(lat)]}


def safe_remove_file(url_path: Optional[str]):
    """
    url_path expected like: /uploads/xxxx.jpg
    """
    try:
        if not url_path:
            return
        if not url_path.startswith("/uploads/"):
            return
        fname = url_path.replace("/uploads/", "").strip()
        abs_path = os.path.join(UPLOAD_DIR, fname)
        if os.path.exists(abs_path):
            os.remove(abs_path)
    except Exception:
        pass


def save_upload_file(file: UploadFile, force_ext: Optional[str] = None) -> str:
    ext = os.path.splitext(file.filename)[1].lower()
    if force_ext:
        ext = force_ext
    if ext not in [".jpg", ".jpeg", ".png", ".webp", ".webm", ".wav", ".mp3", ".m4a", ".ogg"]:
        ext = ".bin"
    filename = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(UPLOAD_DIR, filename)

    with open(path, "wb") as f:
        f.write(file.file.read())

    return filename


def translate_to_english(text: str) -> str:
    if not text or not text.strip():
        return ""

    if not HAS_TRANSLATOR:
        return text

    try:
        return GoogleTranslator(source="auto", target="en").translate(text)
    except Exception:
        return text


def clip_detect_category(image_path: str) -> tuple[str, float]:
    img = clip_preprocess(Image.open(image_path)).unsqueeze(0).to(DEVICE)

    with torch.no_grad():
        image_features = clip_model.encode_image(img)
        text_features = clip_model.encode_text(clip_text_tokens)

        image_features = image_features / image_features.norm(dim=-1, keepdim=True)
        text_features = text_features / text_features.norm(dim=-1, keepdim=True)

        logits = (image_features @ text_features.T)
        probs = logits.softmax(dim=-1)

    top_index = int(probs.argmax().item())
    detected = CLIP_PROMPTS[top_index]
    conf = float(probs[0][top_index].item())
    return detected, conf


def clip_image_embedding(image_path: str) -> List[float]:
    img = clip_preprocess(Image.open(image_path)).unsqueeze(0).to(DEVICE)
    with torch.no_grad():
        feat = clip_model.encode_image(img)
        feat = feat / feat.norm(dim=-1, keepdim=True)
    return feat[0].cpu().tolist()


def cosine_sim(a: List[float], b: List[float]) -> float:
    import numpy as np
    va = np.array(a, dtype=float)
    vb = np.array(b, dtype=float)
    denom = (np.linalg.norm(va) * np.linalg.norm(vb)) + 1e-9
    return float(np.dot(va, vb) / denom)


def interpret_impact(detected_category: str, user_text: str) -> Dict[str, Any]:
    cat = (detected_category or "").strip().lower()
    fact_sentence = FACT_MAP.get(cat, "A road-related issue is observed at the location.")

    if not user_text or not user_text.strip():
        return {
            "fact_sentence": fact_sentence,
            "best_impact": "inconvenience to commuters",
        }

    candidates = IMPACT_MAP.get(cat, ["inconvenience to commuters"])

    user_emb = sbert_model.encode(user_text, convert_to_tensor=True)
    cand_emb = sbert_model.encode(candidates, convert_to_tensor=True)

    scores = util.cos_sim(user_emb, cand_emb)[0]
    best_idx = int(scores.argmax().item())
    best_impact = candidates[best_idx]

    return {
        "fact_sentence": fact_sentence,
        "best_impact": best_impact,
    }


def build_email_prompt(category: str, locality: str, fact_sentence: str, best_impact: str, citizen_name: str, phone: str) -> str:
    date_str = datetime.now().strftime("%d-%m-%Y")
    return f"""
You are writing a formal civic complaint email in India.

STRICT RULES:
- 8 to 12 lines maximum
- Must NOT mention AI, ML, similarity, confidence, model, automation
- Must sound like a real citizen writing formally
- Must include: To, Subject, Date, body, closing
- Mention that photo is attached as evidence
- Closing MUST include citizen name + phone

Inputs:
Category: {category}
Locality: {locality}
Verified condition: {fact_sentence}
Impact faced: {best_impact}
Citizen Name: {citizen_name}
Citizen Phone: {phone}
Date: {date_str}

Now write the final email.
""".strip()


def fallback_email(category: str, locality: str, fact_sentence: str, best_impact: str, citizen_name: str, phone: str) -> str:
    date_str = datetime.now().strftime("%d-%m-%Y")
    return f"""To:
The Concerned Municipal Authority

Subject:
Request for immediate action regarding {category} in {locality}

Date:
{date_str}

Respected Sir/Madam,
I would like to report an issue in {locality}. {fact_sentence} This is causing {best_impact}. Kindly arrange inspection and necessary corrective action at the earliest. A photo is attached for reference.

Thank you,
{citizen_name}
Phone: {phone}
"""


def generate_email(category: str, locality: str, fact_sentence: str, best_impact: str, citizen_name: str, phone: str) -> str:
    prompt = build_email_prompt(category, locality, fact_sentence, best_impact, citizen_name, phone)
    try:
        r = requests.post(
            OLLAMA_URL,
            json={"model": OLLAMA_MODEL, "prompt": prompt, "stream": False},
            timeout=45,
        )
        r.raise_for_status()
        data = r.json()
        text = (data.get("response") or "").strip()
        return text if text else fallback_email(category, locality, fact_sentence, best_impact, citizen_name, phone)
    except Exception:
        return fallback_email(category, locality, fact_sentence, best_impact, citizen_name, phone)


def compute_priority(duplicate_count: int, reporter_age: Optional[int]) -> str:
    """
    duplicate_count meaning NOW:
    - number of EXTRA duplicate reports beyond the first (0 for first complaint)
    """
    base = "Low"
    if duplicate_count >= 4:
        base = "High"
    elif duplicate_count >= 1:
        base = "Medium"

    if reporter_age is not None and reporter_age >= 60:
        if base == "Low":
            return "Medium"
        if base == "Medium":
            return "High"
    return base


def find_duplicate_master(category: str, lat: float, lon: float, new_img_emb: List[float]) -> Optional[dict]:
    query = {
        "status": "unresolved",
        "category": category,
        "location": {
            "$near": {
                "$geometry": make_geojson_point(lat, lon),
                "$maxDistance": DUPLICATE_DISTANCE_METERS
            }
        }
    }

    for c in complaints_col.find(query):
        master_emb = c.get("clip_embedding")
        if not master_emb:
            continue
        sim = cosine_sim(new_img_emb, master_emb)
        if sim >= DUPLICATE_IMAGE_SIM_THRESHOLD:
            return c
    return None


async def read_body_any(request: Request) -> Dict[str, Any]:
    ct = request.headers.get("content-type", "")
    if "application/json" in ct:
        try:
            return await request.json()
        except Exception:
            return {}
    if "multipart/form-data" in ct or "application/x-www-form-urlencoded" in ct:
        form = await request.form()
        return dict(form)
    return {}


def validate_phone_10(phone: str) -> str:
    p = str(phone or "").strip()
    if len(p) != 10 or not p.isdigit():
        raise HTTPException(status_code=400, detail="Valid 10-digit phone required")
    return p


def now_utc():
    return datetime.utcnow()


def push_event(master_id: ObjectId, action: str, meta: Optional[dict] = None):
    evt = {
        "ts": now_utc(),
        "action": action,
        "meta": meta or {}
    }
    complaints_col.update_one({"_id": master_id}, {"$push": {"events": evt}})


# ============================================================
# AUTH
# ============================================================

@app.post("/auth/login")
async def login(request: Request):
    payload = await read_body_any(request)
    phone = validate_phone_10(payload.get("phone"))

    if phone == GOV_PHONE:
        return {
            "phone": phone,
            "role": "government",
            "name": "Government",
            "age": None,
        }

    user = users_col.find_one({"phone": phone})
    if not user:
        return {"needs_register": True}

    return {
        "phone": user["phone"],
        "role": "citizen",
        "name": user.get("name", ""),
        "age": user.get("age"),
    }


@app.post("/auth/register")
async def register(request: Request):
    payload = await read_body_any(request)

    phone = validate_phone_10(payload.get("phone"))
    name = str(payload.get("name") or "").strip()
    age = payload.get("age")

    if phone == GOV_PHONE:
        raise HTTPException(status_code=400, detail="Government number cannot be registered")

    if not name:
        raise HTTPException(status_code=400, detail="name required")

    try:
        age_int = int(age)
    except Exception:
        raise HTTPException(status_code=400, detail="valid age required")

    existing = users_col.find_one({"phone": phone})
    if existing:
        return {"message": "already_registered", "phone": phone, "role": "citizen"}

    users_col.insert_one({
        "phone": phone,
        "name": name,
        "age": age_int,
        "role": "citizen"
    })

    return {"message": "registered", "phone": phone, "role": "citizen"}


# ============================================================
# DEV RESET
# ============================================================

@app.post("/dev/clear_all")
def clear_all():
    users_col.delete_many({})
    complaints_col.delete_many({})
    reports_col.delete_many({})
    notifications_col.delete_many({})
    # do not wipe uploads automatically (optional)
    return {"message": "cleared"}


# ============================================================
# GEO (Reverse Geocode)
# ============================================================

@app.get("/geo/reverse")
def geo_reverse(lat: float, lon: float):
    """
    Reverse geocode using OpenStreetMap Nominatim.
    Returns a locality string for auto-fill.
    """
    try:
        url = "https://nominatim.openstreetmap.org/reverse"
        params = {
            "format": "jsonv2",
            "lat": str(lat),
            "lon": str(lon),
            "zoom": "18",
            "addressdetails": "1",
        }
        headers = {
            "User-Agent": "community-problem-mapper-demo/1.0"
        }
        r = requests.get(url, params=params, headers=headers, timeout=10)
        r.raise_for_status()
        data = r.json()

        addr = data.get("address") or {}
        # try best locality string
        parts = []
        for k in ["neighbourhood", "suburb", "city_district", "town", "city", "county", "state"]:
            v = addr.get(k)
            if v and v not in parts:
                parts.append(v)

        locality = ", ".join(parts[:2]) if parts else (data.get("display_name") or "")
        locality = locality.strip()
        return {"locality": locality}
    except Exception:
        return {"locality": ""}


# ============================================================
# AI ROUTES
# ============================================================

@app.post("/ai/transcribe")
async def transcribe_audio(audio: UploadFile = File(...)):
    ext = os.path.splitext(audio.filename)[1].lower()
    if ext not in [".webm", ".wav", ".mp3", ".m4a", ".ogg"]:
        ext = ".webm"

    tmp_name = f"{uuid.uuid4().hex}{ext}"
    tmp_path = os.path.join(UPLOAD_DIR, tmp_name)

    with open(tmp_path, "wb") as f:
        f.write(await audio.read())

    try:
        # Restrict languages: English, Hindi, Kannada
        # Use deterministic decode
        result = whisper_model.transcribe(
            tmp_path,
            task="transcribe",
            temperature=0,
        )

        text = (result.get("text") or "").strip()
        lang = (result.get("language") or "").strip().lower()

        # hard filter languages
        allowed = {"en", "hi", "kn"}
        if lang not in allowed:
            # try forcing english as fallback (keeps demo stable)
            result2 = whisper_model.transcribe(
                tmp_path,
                task="transcribe",
                language="en",
                temperature=0,
            )
            text2 = (result2.get("text") or "").strip()
            if text2:
                return {"text": text2, "language": "en"}
            return {"text": text, "language": "en"}

        return {"text": text, "language": lang}
    finally:
        try:
            os.remove(tmp_path)
        except Exception:
            pass


# ============================================================
# CITIZEN ROUTES
# ============================================================

@app.post("/citizen/submit")
async def submit_complaint(
    phone: str = Form(...),
    lat: float = Form(...),
    lon: float = Form(...),
    locality: str = Form(...),
    text: Optional[str] = Form(None),
    input_mode: Optional[str] = Form("text"),  # text | voice
    audio: Optional[UploadFile] = File(None),
    image: UploadFile = File(...),
):
    phone = validate_phone_10(phone)

    if phone == GOV_PHONE:
        raise HTTPException(status_code=403, detail="Government cannot submit citizen complaint")

    user = users_col.find_one({"phone": phone})
    if not user:
        raise HTTPException(status_code=400, detail="Please login/register first")

    if not locality or not locality.strip():
        # keep system stable even if frontend failed to autofill
        locality = "Unknown locality"

    # save image
    img_filename = save_upload_file(image)
    image_url = f"/uploads/{img_filename}"
    image_path = os.path.join(UPLOAD_DIR, img_filename)

    # save audio if present (demo)
    audio_url = None
    if audio is not None:
        a_ext = os.path.splitext(audio.filename)[1].lower()
        if a_ext not in [".webm", ".wav", ".mp3", ".m4a", ".ogg"]:
            a_ext = ".webm"
        audio_filename = save_upload_file(audio, force_ext=a_ext)
        audio_url = f"/uploads/{audio_filename}"

    raw_text = text or ""
    normalized_text = translate_to_english(raw_text)

    detected_category, _ = clip_detect_category(image_path)

    if detected_category == "clear road":
        raise HTTPException(status_code=400, detail="No supported road problem detected in image.")

    if detected_category not in SUPPORTED_CATEGORIES:
        raise HTTPException(status_code=400, detail="Unsupported category detected.")

    understanding = interpret_impact(detected_category, normalized_text)
    fact_sentence = understanding["fact_sentence"]
    best_impact = understanding["best_impact"]

    new_img_emb = clip_image_embedding(image_path)
    dup_master = find_duplicate_master(detected_category, lat, lon, new_img_emb)

    now = now_utc()

    # if duplicate master found, block same user duplicate
    if dup_master and SAME_USER_DUPLICATE_BLOCK:
        existing = reports_col.find_one({
            "master_complaint_id": dup_master["_id"],
            "phone": phone,
            "status": {"$in": ["active"]},
        })
        if existing:
            raise HTTPException(
                status_code=400,
                detail="You have already reported this issue. Please check My Complaints."
            )

    if dup_master:
        master_id = dup_master["_id"]

        report_doc = {
            "master_complaint_id": master_id,
            "phone": phone,
            "text": raw_text,
            "normalized_text": normalized_text,
            "input_mode": input_mode or "text",
            "audio_url": audio_url,
            "category": detected_category,
            "locality": locality,
            "location": make_geojson_point(lat, lon),
            "image_url": image_url,
            "clip_embedding": new_img_emb,
            "created_at": now,
            "status": "active",
        }
        rep_res = reports_col.insert_one(report_doc)

        # duplicate_count counts EXTRA reports, so increment by +1
        new_dup_count = int(dup_master.get("duplicate_count", 0)) + 1
        priority = compute_priority(new_dup_count, user.get("age"))

        complaints_col.update_one(
            {"_id": master_id},
            {"$set": {"duplicate_count": new_dup_count, "priority": priority, "updated_at": now}}
        )
        push_event(master_id, "duplicate_added", {"report_id": str(rep_res.inserted_id), "phone": phone})

        return {
            "message": "Thanks! Your report was added to an existing issue.",
            "duplicate": True,
            "master_complaint_id": str(master_id),
            "report_id": str(rep_res.inserted_id),
            "category": CATEGORY_DISPLAY[detected_category],
            "priority": priority,
            "image_url": image_url,
        }

    # new master
    priority = compute_priority(0, user.get("age"))

    email_text = generate_email(
        category=CATEGORY_DISPLAY[detected_category],
        locality=locality,
        fact_sentence=fact_sentence,
        best_impact=best_impact,
        citizen_name=user.get("name", "Citizen"),
        phone=phone,
    )

    master_doc = {
        "category": detected_category,
        "status": "unresolved",
        "priority": priority,
        "duplicate_count": 0,
        "locality": locality,
        "location": make_geojson_point(lat, lon),
        "created_at": now,
        "updated_at": now,
        "email_draft": email_text,
        "image_url": image_url,
        "clip_embedding": new_img_emb,
        "events": [{"ts": now, "action": "created", "meta": {"phone": phone}}],
    }
    master_res = complaints_col.insert_one(master_doc)

    report_doc = {
        "master_complaint_id": master_res.inserted_id,
        "phone": phone,
        "text": raw_text,
        "normalized_text": normalized_text,
        "input_mode": input_mode or "text",
        "audio_url": audio_url,
        "category": detected_category,
        "locality": locality,
        "location": make_geojson_point(lat, lon),
        "image_url": image_url,
        "clip_embedding": new_img_emb,
        "created_at": now,
        "status": "active",
    }
    rep_res = reports_col.insert_one(report_doc)

    return {
        "message": "Complaint submitted successfully.",
        "duplicate": False,
        "master_complaint_id": str(master_res.inserted_id),
        "report_id": str(rep_res.inserted_id),
        "category": CATEGORY_DISPLAY[detected_category],
        "priority": priority,
        "image_url": image_url,
        "email_draft": email_text,
    }


@app.get("/citizen/my-complaints")
def my_complaints(phone: str):
    phone = validate_phone_10(phone)
    cursor = reports_col.find({"phone": phone}).sort("created_at", -1)

    out = []
    for r in cursor:
        master = complaints_col.find_one({"_id": r["master_complaint_id"]})
        master_status = master.get("status") if master else "unknown"

        out.append({
            "report_id": str(r["_id"]),
            "master_complaint_id": str(r["master_complaint_id"]),
            "category": CATEGORY_DISPLAY.get(r.get("category", ""), r.get("category")),
            "locality": r.get("locality"),
            "master_status": master_status,
            "report_status": r.get("status", "active"),
            "priority": master.get("priority") if master else "Low",
            "duplicate_count": master.get("duplicate_count", 0) if master else 0,
            "created_at": r.get("created_at"),
            "updated_at": master.get("updated_at") if master else None,
            "image_url": r.get("image_url"),
        })
    return out


@app.post("/citizen/cancel")
def cancel_report(payload: dict):
    phone = validate_phone_10(payload.get("phone"))
    report_id = payload.get("report_id")

    if not report_id:
        raise HTTPException(status_code=400, detail="report_id required")

    r = reports_col.find_one({"_id": ObjectId(report_id)})
    if not r:
        raise HTTPException(status_code=404, detail="Report not found")

    if r.get("phone") != phone:
        raise HTTPException(status_code=403, detail="Not allowed")

    if r.get("status") == "cancelled":
        return {"message": "Already cancelled"}

    master_id = r["master_complaint_id"]
    master = complaints_col.find_one({"_id": master_id})

    # if government already acted, citizen should not cancel
    if master and master.get("status") in ["fixed", "rejected"]:
        raise HTTPException(status_code=400, detail="Cannot cancel after government action")

    # cancel report
    reports_col.update_one({"_id": ObjectId(report_id)}, {"$set": {"status": "cancelled"}})
    push_event(master_id, "report_cancelled", {"report_id": report_id, "phone": phone})

    # find remaining ACTIVE reports
    active_reports = list(
        reports_col.find({"master_complaint_id": master_id, "status": "active"}).sort("created_at", -1)
    )

    # if no active reports left -> complaint should vanish for government
    if len(active_reports) == 0:
        master_doc = complaints_col.find_one({"_id": master_id})
        if master_doc:
            safe_remove_file(master_doc.get("image_url"))
        complaints_col.delete_one({"_id": master_id})
        return {"message": "Cancelled successfully"}

    # recompute duplicate_count + priority (active_count - 1)
    new_dup = max(0, len(active_reports) - 1)

    # choose a new representative report (latest active)
    new_master_rep = active_reports[0]

    rep_user = users_col.find_one({"phone": new_master_rep.get("phone")}) or {}
    rep_name = rep_user.get("name", "Citizen")
    rep_age = rep_user.get("age")

    priority = compute_priority(new_dup, rep_age)

    detected_category = master.get("category") if master else new_master_rep.get("category")
    locality = (new_master_rep.get("locality") or (master.get("locality") if master else "") or "Unknown locality").strip()

    rep_text_norm = (new_master_rep.get("normalized_text") or "").strip()
    understanding = interpret_impact(detected_category, rep_text_norm)
    fact_sentence = understanding["fact_sentence"]
    best_impact = understanding["best_impact"]

    email_text = generate_email(
        category=CATEGORY_DISPLAY.get(detected_category, detected_category),
        locality=locality,
        fact_sentence=fact_sentence,
        best_impact=best_impact,
        citizen_name=rep_name,
        phone=new_master_rep.get("phone", ""),
    )

    complaints_col.update_one(
        {"_id": master_id},
        {
            "$set": {
                "duplicate_count": new_dup,
                "priority": priority,
                "updated_at": now_utc(),
                "locality": locality,
                "image_url": new_master_rep.get("image_url"),
                "clip_embedding": new_master_rep.get("clip_embedding"),
                "email_draft": email_text,
            }
        }
    )

    return {"message": "Cancelled successfully"}


@app.post("/citizen/delete")
def citizen_delete(payload: dict):
    phone = validate_phone_10(payload.get("phone"))
    report_id = payload.get("report_id")

    if not report_id:
        raise HTTPException(status_code=400, detail="report_id required")

    r = reports_col.find_one({"_id": ObjectId(report_id)})
    if not r:
        raise HTTPException(status_code=404, detail="Report not found")

    if r.get("phone") != phone:
        raise HTTPException(status_code=403, detail="Not allowed")

    if r.get("status") != "cancelled":
        raise HTTPException(status_code=400, detail="You must cancel before deleting")

    master_id = r["master_complaint_id"]

    # delete report image/audio files
    safe_remove_file(r.get("image_url"))
    safe_remove_file(r.get("audio_url"))

    reports_col.delete_one({"_id": ObjectId(report_id)})

    # if no active reports left, delete master too
    active_left = reports_col.count_documents({"master_complaint_id": master_id, "status": "active"})
    if active_left == 0:
        master = complaints_col.find_one({"_id": master_id})
        if master:
            safe_remove_file(master.get("image_url"))
        complaints_col.delete_one({"_id": master_id})
        # delete any leftover report images/audio
        for rr in reports_col.find({"master_complaint_id": master_id}):
            safe_remove_file(rr.get("image_url"))
            safe_remove_file(rr.get("audio_url"))
        reports_col.delete_many({"master_complaint_id": master_id})

    return {"message": "Deleted successfully"}


# ============================================================
# GOV ROUTES
# ============================================================

@app.get("/gov/analytics")
def gov_analytics():
    total = complaints_col.count_documents({})
    unresolved = complaints_col.count_documents({"status": "unresolved"})
    fixed = complaints_col.count_documents({"status": "fixed"})
    rejected = complaints_col.count_documents({"status": "rejected"})

    report_total = reports_col.count_documents({})
    report_active = reports_col.count_documents({"status": "active"})
    report_cancelled = reports_col.count_documents({"status": "cancelled"})

    breakdown = {}
    for k in SUPPORTED_CATEGORIES:
        breakdown[CATEGORY_DISPLAY[k]] = complaints_col.count_documents({"category": k})

    return {
        "total": total,
        "unresolved": unresolved,
        "fixed": fixed,
        "rejected": rejected,
        "reports": {
            "total": report_total,
            "active": report_active,
            "cancelled": report_cancelled,
        },
        "category_breakdown": breakdown,
    }


@app.get("/gov/inbox_full")
def gov_inbox_full():
    out = []
    cursor = complaints_col.find({}).sort("created_at", -1)

    for c in cursor:
        loc = c.get("location", {})
        coords = loc.get("coordinates", [None, None])

        master_id = c["_id"]

        # ONLY ACTIVE reports should be visible to government
        reps_active = []
        for r in reports_col.find({"master_complaint_id": master_id, "status": "active"}).sort("created_at", -1):
            reps_active.append({
                "id": str(r["_id"]),
                "phone": r.get("phone"),
                "status": r.get("status", "active"),
                "text": r.get("text") or "",
                "input_mode": r.get("input_mode") or "text",
                "audio_url": r.get("audio_url"),
                "image_url": r.get("image_url"),
                "created_at": r.get("created_at"),
            })

        # If no ACTIVE reports exist => government should not see this complaint at all
        if len(reps_active) == 0:
            continue

        latest_active = reps_active[0] if reps_active else None

        out.append({
            "id": str(master_id),
            "category": CATEGORY_DISPLAY.get(c.get("category", ""), c.get("category")),
            "status": c.get("status"),
            "priority": c.get("priority", "Low"),

            # duplicates = active reports - 1 (master already shown above)
            "duplicate_count": max(0, len(reps_active) - 1),

            "locality": c.get("locality"),
            "lat": coords[1],
            "lon": coords[0],
            "created_at": c.get("created_at"),
            "updated_at": c.get("updated_at"),
            "email_draft": c.get("email_draft", ""),
            "image_url": c.get("image_url"),

            # show ONLY duplicates (exclude master report)
            "reports": reps_active[1:] if len(reps_active) > 1 else [],

            # deeper insights should show ALL active citizen inputs
            "insights_reports": reps_active,

            "citizen_preview": {
                "text": latest_active.get("text") if latest_active else "",
                "input_mode": latest_active.get("input_mode") if latest_active else "text",
                "audio_url": latest_active.get("audio_url") if latest_active else None,
            }
        })

    return out


@app.patch("/gov/complaint/{complaint_id}/status")
def gov_set_status(complaint_id: str, payload: dict):
    status = payload.get("status")
    if status not in ["fixed", "rejected", "unresolved"]:
        raise HTTPException(status_code=400, detail="Invalid status")

    c = complaints_col.find_one({"_id": ObjectId(complaint_id)})
    if not c:
        raise HTTPException(status_code=404, detail="Complaint not found")

    current = c.get("status", "unresolved")

    # lock transitions: once fixed/rejected, cannot change
    if current in ["fixed", "rejected"] and status != current:
        raise HTTPException(status_code=400, detail="Status already finalized")

    complaints_col.update_one(
        {"_id": ObjectId(complaint_id)},
        {"$set": {"status": status, "updated_at": now_utc()}}
    )
    push_event(ObjectId(complaint_id), "status_changed", {"from": current, "to": status})

    return {"message": "updated", "status": status}


@app.delete("/gov/complaint/{complaint_id}")
def gov_delete_complaint(complaint_id: str):
    c = complaints_col.find_one({"_id": ObjectId(complaint_id)})
    if not c:
        raise HTTPException(status_code=404, detail="Complaint not found")

    # delete master files
    safe_remove_file(c.get("image_url"))

    # delete all reports files
    for r in reports_col.find({"master_complaint_id": ObjectId(complaint_id)}):
        safe_remove_file(r.get("image_url"))
        safe_remove_file(r.get("audio_url"))

    reports_col.delete_many({"master_complaint_id": ObjectId(complaint_id)})
    complaints_col.delete_one({"_id": ObjectId(complaint_id)})

    return {"message": "deleted"}


# ============================================================
# ROOT
# ============================================================

@app.get("/")
def root():
    return {"status": "ok", "service": "community-problem-mapper"}
