import os
from fastapi import FastAPI, UploadFile, File, BackgroundTasks, Depends, Header, HTTPException
from firebase_admin import auth as firebase_auth
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from firebase_client import FirebaseClient
from processor import AIProcessor
from dotenv import load_dotenv

load_dotenv()
hf_token = os.getenv("HF_TOKEN")

print("Initializing Firebase...")
firebase = FirebaseClient()

print("Initializing AI Processor...")
ai = AIProcessor(hf_token=hf_token)

os.makedirs("downloads", exist_ok=True)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

import asyncio
from concurrent.futures import ThreadPoolExecutor

executor = ThreadPoolExecutor(max_workers=4)
active_chunks = {}

def process_chunk_sync(meeting_id: str, user_name: str, local_audio_path: str, chunk_id: str, sequence: int):
    print(f"Processing chunk for meeting {meeting_id} from {user_name}...")
    try:
        chunk_text = ai.transcribe_chunk(local_audio_path)
        if chunk_text:
            import time
            segment_data = {
                "meetingId": meeting_id,
                "speakerName": user_name,
                "text": chunk_text,
                "sequenceNumber": sequence if sequence > 0 else int(time.time() * 1000),
                "segmentId": chunk_id
            }
            firebase.add_transcript_segment(meeting_id, segment_data)
        try:
            os.remove(local_audio_path)
        except Exception:
            pass
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Error processing chunk: {e}")

async def process_chunk_async(meeting_id: str, user_name: str, local_audio_path: str, chunk_id: str, sequence: int):
    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(executor, process_chunk_sync, meeting_id, user_name, local_audio_path, chunk_id, sequence)
    finally:
        active_chunks[meeting_id] -= 1

def current_account(authorization: str = Header(default="")):
    try:
        if not authorization.startswith("Bearer "):
            raise ValueError("missing token")
        claims = firebase_auth.verify_id_token(authorization[7:], check_revoked=True)
        profile = firebase.db.collection("users").document(claims["uid"]).get().to_dict() or {}
        mode = firebase.db.collection("app_config").document("access").get().to_dict() or {}
        if not profile.get("isActive") or (mode.get("testMode") and claims["uid"] not in mode.get("allowedTestUids", [])):
            raise ValueError("inactive")
        return {**claims, "profile": profile}
    except Exception:
        raise HTTPException(status_code=403, detail="Account unavailable")

def authorize_meeting(meeting_id, actor, manage=False):
    m = firebase.db.collection("meeting_rooms").document(meeting_id).get().to_dict() or {}
    p = actor["profile"]; role = p.get("role")
    allowed = role in ("admin", "super_admin") or (role == "team_lead" and m.get("scope") == "board") or (role in ("team_lead", "member") and m.get("scope") == "team" and p.get("teamId") and p.get("teamId") == m.get("teamId"))
    if not m or not allowed or (manage and role != "super_admin" and m.get("hostUid") != actor["uid"]):
        raise HTTPException(status_code=403, detail="Meeting access denied")
    return m

@app.post("/upload_chunk/{meeting_id}")
async def upload_chunk(meeting_id: str, user_name: str, sequence: int = 0, file: UploadFile = File(...), actor=Depends(current_account)):
    authorize_meeting(meeting_id, actor)
    user_name = actor["profile"].get("name", "Speaker")
    chunk_id = os.urandom(4).hex()
    local_audio_path = f"downloads/{os.urandom(16).hex()}.mp4"
    
    with open(local_audio_path, "wb") as buffer:
        content = await file.read()
        buffer.write(content)
        
    print(f"Received audio chunk from {user_name} for meeting {meeting_id}.")
    
    if meeting_id not in active_chunks:
        active_chunks[meeting_id] = 0
    active_chunks[meeting_id] += 1
    
    asyncio.create_task(process_chunk_async(meeting_id, user_name, local_audio_path, chunk_id, sequence))
    return {"message": "Chunk uploaded and processing started."}

import datetime

def generate_summary_sync(meeting_id: str, full_transcript: str):
    try:
        summary, decisions, action_items, conclusion = ai.generate_summary(full_transcript)
        update_data = {
            "status": "completed",
            "summary": summary,
            "decisions": decisions,
            "actionItems": action_items,
            "conclusion": conclusion
        }
        firebase.update_meeting_status(meeting_id, update_data)
    except Exception as e:
        firebase.update_meeting_status(meeting_id, {"status": "error", "error": str(e)})

async def end_meeting_async(meeting_id: str):
    while active_chunks.get(meeting_id, 0) > 0:
        await asyncio.sleep(1)
        
    segments = firebase.get_transcript_segments(meeting_id)
    # Reconstruct full transcript for the summarization AI
    full_transcript = "\n".join([f"{s.get('speakerName', 'Unknown')}: {s.get('text', '')}" for s in segments])
    
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(executor, generate_summary_sync, meeting_id, full_transcript)

@app.post("/end_meeting/{meeting_id}")
async def end_meeting(meeting_id: str, actor=Depends(current_account)):
    authorize_meeting(meeting_id, actor, manage=True)
    firebase.mark_meeting_ended(meeting_id)
    asyncio.create_task(end_meeting_async(meeting_id))
    return {"message": "Meeting ended, summary generation started."}

if __name__ == "__main__":
    print("Starting FastAPI server on 0.0.0.0:8001")
    uvicorn.run(app, host="0.0.0.0", port=8001)

