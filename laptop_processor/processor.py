import os
import subprocess
from faster_whisper import WhisperModel


# Assuming ffmpeg is installed and available in the system PATH.
# If you run into issues, ensure ffmpeg is added to your environment variables.

import requests
import json
from abc import ABC, abstractmethod

class SummarizationService(ABC):
    @abstractmethod
    def generate_report(self, full_transcript: str) -> dict:
        pass

class HuggingFaceAPISummarizationService(SummarizationService):
    def __init__(self, token: str):
        self.token = token
        # Using a highly capable instruction model for structured extraction
        self.api_url = "https://api-inference.huggingface.co/models/google/flan-t5-large"
        self.headers = {"Authorization": f"Bearer {self.token}"}

    def _query(self, prompt: str) -> str:
        if not self.token:
            return "HF_TOKEN not provided."
        try:
            payload = {"inputs": prompt, "parameters": {"max_new_tokens": 150}}
            response = requests.post(self.api_url, headers=self.headers, json=payload, timeout=30)
            if response.status_code == 200:
                result = response.json()
                if isinstance(result, list) and len(result) > 0:
                    return result[0].get("generated_text", "").strip()
            return f"Error: {response.status_code} - {response.text}"
        except Exception as e:
            return f"Exception: {str(e)}"

    def generate_report(self, full_transcript: str) -> dict:
        if not full_transcript.strip():
            return {
                "summary": "No transcript available.",
                "decisions": "None",
                "actionItems": "None",
                "conclusion": "Meeting ended without transcription."
            }

        # Truncate transcript if too long for the API limits
        transcript_snippet = full_transcript[-2000:] if len(full_transcript) > 2000 else full_transcript
        
        summary = self._query(f"Summarize the following meeting transcript:\n\n{transcript_snippet}")
        decisions = self._query(f"Extract the key decisions made in this meeting:\n\n{transcript_snippet}")
        action_items = self._query(f"Extract the action items and responsible persons from this meeting:\n\n{transcript_snippet}")
        conclusion = self._query(f"What is the final conclusion of this meeting?\n\n{transcript_snippet}")

        return {
            "summary": summary,
            "decisions": decisions,
            "actionItems": action_items,
            "conclusion": conclusion
        }

class AIProcessor:
    def __init__(self, hf_token=None):
        self._init_whisper()
        self.summarizer: SummarizationService = HuggingFaceAPISummarizationService(hf_token)
        
    def _init_whisper(self):
        print("Loading Whisper model from scratch...")
        try:
            self.whisper_model = WhisperModel("base", device="cpu", compute_type="int8")
        except Exception as e:
            print(f"Failed with int8, falling back to float32: {e}")
            self.whisper_model = WhisperModel("base", device="cpu", compute_type="float32")

    def _convert_to_wav(self, input_path, output_path):
        ffmpeg_path = "ffmpeg"
        command = [
            ffmpeg_path, "-y", "-i", input_path,
            "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le",
            output_path
        ]
        subprocess.run(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
    def transcribe_chunk(self, audio_path):
        if not os.path.exists(audio_path):
            print(f"Error: File not found {audio_path}")
            return ""

        print(f"Converting and transcribing {audio_path}...")
        wav_path = audio_path + ".wav"
        self._convert_to_wav(audio_path, wav_path)

        try:
            segments, info = self.whisper_model.transcribe(wav_path, beam_size=5, task="translate", vad_filter=True)
            transcript = " ".join([segment.text for segment in segments]).strip()
            print(f"Chunk transcription complete: {transcript}")
            return transcript
        except Exception as e:
            print(f"Transcription failed: {e}")
            return ""
        finally:
            if os.path.exists(wav_path):
                os.remove(wav_path)
        
    def generate_summary(self, full_transcript: str):
        report_dict = self.summarizer.generate_report(full_transcript)
        return report_dict.get("summary"), report_dict.get("decisions"), report_dict.get("actionItems"), report_dict.get("conclusion")
