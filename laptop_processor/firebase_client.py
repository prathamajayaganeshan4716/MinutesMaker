import firebase_admin
from firebase_admin import credentials, firestore
import os

class FirebaseClient:
    def __init__(self, cred_path="firebase-adminsdk.json"):
        if not firebase_admin._apps:
            # Check relative to current file or working directory
            resolved_path = cred_path
            if not os.path.exists(resolved_path):
                file_dir_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), cred_path)
                if os.path.exists(file_dir_path):
                    resolved_path = file_dir_path
                else:
                    # check root directory for any firebase-adminsdk json file
                    root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
                    candidates = [os.path.join(root_dir, f) for f in os.listdir(root_dir) if "firebase-adminsdk" in f and f.endswith(".json")]
                    if candidates:
                        resolved_path = candidates[0]

            if not os.path.exists(resolved_path):
                print(f"Warning: {cred_path} not found. Firebase will not be initialized.")
                self.db = None
                return
            cred = credentials.Certificate(resolved_path)
            firebase_admin.initialize_app(cred)
            
        if firebase_admin._apps:
            self.db = firestore.client()

    def update_meeting_status(self, meeting_id, data):
        if not self.db:
            return
            
        meeting_ref = self.db.collection("meetings").document(meeting_id)
        meeting_ref.set(data, merge=True)
        metadata = {k: v for k, v in data.items() if k in ("status", "startedAt", "endedAt")}
        if metadata:
            self.db.collection("meeting_rooms").document(meeting_id).set(metadata, merge=True)
        
    def mark_meeting_ended(self, meeting_id):
        if not self.db:
            return
        ref = self.db.collection("meetings").document(meeting_id)

        @firestore.transactional
        def mark(transaction):
            data = ref.get(transaction=transaction).to_dict() or {}
            if not data.get("endedAt"):
                transaction.update(ref, {"status": "processing", "endedAt": firestore.SERVER_TIMESTAMP})
        mark(self.db.transaction())

    def get_meeting(self, meeting_id):
        if not self.db:
            return {}
        doc = self.db.collection("meetings").document(meeting_id).get()
        if doc.exists:
            return doc.to_dict()
        return {}

    def add_transcript_segment(self, meeting_id, segment_data):
        if not self.db:
            return
        
        # Add server timestamp
        segment_data['createdAt'] = firestore.SERVER_TIMESTAMP
        
        # Add to the transcript_segments subcollection
        segments_ref = self.db.collection("meetings").document(meeting_id).collection("transcript_segments")
        
        # If a segmentId is provided, use it for idempotency, otherwise let Firestore auto-generate
        segment_id = segment_data.pop('segmentId', None)
        if segment_id:
            segments_ref.document(segment_id).set(segment_data)
        else:
            segments_ref.add(segment_data)

    def get_transcript_segments(self, meeting_id):
        if not self.db:
            return []
        
        segments_ref = self.db.collection("meetings").document(meeting_id).collection("transcript_segments")
        # Order by sequenceNumber or createdAt
        try:
            docs = segments_ref.order_by("sequenceNumber").stream()
            segments = []
            for doc in docs:
                data = doc.to_dict()
                data['segmentId'] = doc.id
                segments.append(data)
            return segments
        except Exception as e:
            print(f"Error fetching segments: {e}")
            return []
