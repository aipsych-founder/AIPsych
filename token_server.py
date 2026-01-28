# token_server.py
import os
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from fastapi.responses import JSONResponse
import livekit

load_dotenv()

LIVEKIT_URL = os.environ.get("LIVEKIT_URL", "http://localhost:7880")
API_KEY = os.environ.get("LIVEKIT_API_KEY")
API_SECRET = os.environ.get("LIVEKIT_API_SECRET")
DEFAULT_ROOM = os.environ.get("ROOM_NAME", "test-room")

app = FastAPI(title="AI Psych - Token Server")

# DEV: allow all origins so React dev server can call /token.
# In production restrict this to your frontend origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TokenRequest(BaseModel):
    identity: str
    room: str = DEFAULT_ROOM

def make_token(identity: str, room: str):
    """
    Create LiveKit access token. Adapt to your livekit python SDK version.
    """
    try:
        grant = livekit.VideoGrant(room_join=True, room=room)
        access = livekit.AccessToken(API_KEY, API_SECRET, grant=grant, identity=identity)
        return access.to_jwt(), None
    except Exception as e:
        return None, str(e)

@app.post("/token")
def create_token(req: TokenRequest):
    if not API_KEY or not API_SECRET:
        return JSONResponse(status_code=500, content={"error": "LIVEKIT_API_KEY/SECRET not set on server."})
    token, err = make_token(req.identity, req.room)
    if token:
        return {"token": token, "url": LIVEKIT_URL}
    else:
        return JSONResponse(status_code=500, content={"error": "token_generation_failed", "details": err})
