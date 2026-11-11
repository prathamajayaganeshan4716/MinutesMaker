import firebase_admin
from firebase_admin import credentials
from firebase_admin import firestore

# Use the existing credentials file
cred = credentials.Certificate('firebase-adminsdk.json')

# Ensure we only initialize once
if not firebase_admin._apps:
    firebase_admin.initialize_app(cred)

db = firestore.client()

uid = "YgBZkq6fHwgDgpd3pYl2YbTRuUq1"
doc_ref = db.collection('users').document(uid)

# Set the role to admin (merge=True ensures we don't overwrite other fields like email if they exist)
doc_ref.set({'role': 'admin'}, merge=True)

print(f"Successfully elevated {uid} to 'admin'!")
