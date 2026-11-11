# Minutes Maker

An end-to-end meeting recording, transcription, and minutes generation platform.

---

## System Architecture

Minutes Maker is organized as a modular repository:

```
Minutes_maker/
├── mobile_app/              # Flutter mobile client (Android / iOS / Web)
│   ├── lib/                 # Core Flutter application source
│   ├── android/             # Native Android configuration
│   ├── ios/                 # Native iOS configuration
│   └── pubspec.yaml         # Flutter dependencies
│
├── web_dashboard/           # Next.js web dashboard
│   ├── src/                 # Application routes and UI components
│   ├── package.json         # Node dependencies and scripts
│   └── next.config.mjs      # Next.js configuration
│
├── laptop_processor/        # Python audio processing & transcription engine
│   ├── main.py              # Processing queue listener
│   ├── processor.py         # Transcription & summarization pipeline
│   ├── firebase_client.py   # Firestore database integration
│   ├── make_admin.py        # Utility to configure admin privileges
│   ├── requirements.txt     # Python dependencies
│   └── .env                 # API keys and environment variables
│
├── .gitignore               # Unified repository gitignore
└── README.md                # Project documentation (this file)
```

---

## Component Setup & Running Guides

### 1. Mobile App (`mobile_app`)
A cross-platform Flutter application used to record meetings and manage recordings.

**Prerequisites:**
- Flutter SDK (3.x+)
- Android Studio / Xcode (for device emulators or physical device builds)

**Getting Started:**
```bash
cd mobile_app
flutter pub get
flutter run
```

---

### 2. Web Dashboard (`web_dashboard`)
A Next.js dashboard providing a clean interface for viewing meeting transcripts, summaries, action items, and administrative controls.

**Prerequisites:**
- Node.js (18+ recommended)
- npm or yarn

**Getting Started:**
```bash
cd web_dashboard
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

### 3. Audio & Transcription Processor (`laptop_processor`)
A Python service that monitors Firestore for new meeting recordings, downloads the audio, transcribes it with timestamps using Faster-Whisper, and uploads formatted transcript segments and minutes back to Firestore.

**Prerequisites:**
- Python 3.10+
- FFmpeg (installed and added to system PATH)

**Getting Started:**
```bash
cd laptop_processor

# Create and activate a virtual environment (optional but recommended)
python -m venv venv
.\venv\Scripts\Activate.ps1    # On Windows PowerShell

# Install dependencies
pip install -r requirements.txt

# Configure environment (.env)
# Ensure HF_TOKEN or other required API keys are configured in .env

# Run the processor
python main.py
```

---

## Firebase Configuration

- **Firestore Collections:**
  - `meetings`: Stores meeting metadata, statuses (`processing`, `completed`), and summary documents.
  - `meetings/{meetingId}/transcript_segments`: Granular timestamped transcript chunks.
  - `users`: User profiles and role-based permissions (`role: 'admin'`).

- **Service Account Credentials:**
  - Placed in `laptop_processor/firebase-adminsdk.json` for server-side administrative access.
  - Keep service account keys secure and never commit them to public repositories.
