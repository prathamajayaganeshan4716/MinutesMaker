import 'dart:async';
import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import '../services/recording_service.dart';
import '../services/firebase_service.dart';
import '../services/hf_ai_service.dart';
import '../models/app_models.dart';

class OfflineMeetingScreen extends StatefulWidget {
  final String meetingId;
  final String userName;
  final String title;

  const OfflineMeetingScreen({
    Key? key,
    required this.meetingId,
    required this.userName,
    required this.title,
  }) : super(key: key);

  @override
  State<OfflineMeetingScreen> createState() => _OfflineMeetingScreenState();
}

class _OfflineMeetingScreenState extends State<OfflineMeetingScreen> {
  final RecordingService _recordingService = RecordingService();
  final FirebaseService _firebaseService = FirebaseService();
  final HfAiService _hfAiService = HfAiService();
  
  MediaStream? _localStream;
  
  bool _isMuted = true;
  bool _isUploadingChunk = false;
  String _localTemporaryTranscript = '';

  @override
  void initState() {
    super.initState();
    _firebaseService.updateMeetingStatus(widget.meetingId, 'recording');
  }

  Future<void> _toggleMute() async {
    if (_isMuted) {
      // Unmute -> Start Recording
      setState(() {
        _isMuted = false;
        _localTemporaryTranscript = 'Recording...';
      });
      // Get a local media stream for offline recording
      final mediaConstraints = {'audio': true, 'video': false};
      try {
        final stream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
        _localStream = stream;
        await _recordingService.startRecording(stream, widget.meetingId);
      } catch (e) {
        print("Error getting local stream: $e");
        setState(() {
          _isMuted = true;
          _localTemporaryTranscript = 'Microphone error';
        });
      }
    } else {
      // Mute -> Stop Recording and Transcribe via Hugging Face Cloud
      setState(() {
        _isMuted = true;
        _isUploadingChunk = true;
        _localTemporaryTranscript = 'Transcribing with Hugging Face AI...';
      });
      
      final fileData = await _recordingService.stopRecording();
      
      // Stop and dispose the local stream
      if (_localStream != null) {
        _localStream!.getTracks().forEach((track) {
          track.stop();
        });
        await _localStream!.dispose();
        _localStream = null;
      }

      if (fileData != null && fileData['bytes'] != null) {
        try {
          final chunkText = await _hfAiService.transcribeChunk(fileData['bytes']);
          if (chunkText != null && chunkText.trim().isNotEmpty) {
            await _firebaseService.addTranscriptSegment(widget.meetingId, {
              'meetingId': widget.meetingId,
              'speakerName': widget.userName,
              'text': chunkText.trim(),
              'sequenceNumber': DateTime.now().millisecondsSinceEpoch,
            });
          }
        } catch (e) {
          print("[OfflineMeeting] Cloud AI Transcription Error: $e");
        }
      }
      if (mounted) {
        setState(() {
          _isUploadingChunk = false;
          _localTemporaryTranscript = '';
        });
      }
    }
  }

  Future<void> _endMeeting() async {
    if (!_isMuted) {
      await _toggleMute(); 
    }
    setState(() {
      _isUploadingChunk = true;
      _localTemporaryTranscript = 'Generating minutes with Hugging Face AI...';
    });
    try {
      await _firebaseService.updateMeetingStatus(widget.meetingId, 'processing');
      final segments = await _firebaseService.getTranscriptSegments(widget.meetingId);
      final fullTranscript = segments
          .map((s) => '${s['speakerName'] ?? 'Speaker'}: ${s['text'] ?? ''}')
          .join('\n');

      final summaryData = await _hfAiService.generateSummary(fullTranscript);
      await _firebaseService.completeMeeting(widget.meetingId, summaryData, transcript: fullTranscript);
    } catch (e) {
      print("Error ending meeting: $e");
    }
    if (mounted) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.title),
        backgroundColor: const Color(0xFF38040E),
        foregroundColor: Colors.white,
        actions: [
          ElevatedButton.icon(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red, foregroundColor: Colors.white),
            onPressed: _endMeeting,
            icon: const Icon(Icons.stop),
            label: const Text('End Meeting'),
          )
        ],
      ),
      body: Column(
        children: [
          // Microphone Status Area
          Container(
            padding: const EdgeInsets.all(32),
            alignment: Alignment.center,
            color: _isMuted ? Colors.grey.shade200 : Colors.red.shade100,
            child: Column(
              children: [
                Icon(
                  _isMuted ? Icons.mic_off : Icons.mic,
                  size: 64,
                  color: _isMuted ? Colors.grey : Colors.red,
                ),
                const SizedBox(height: 16),
                Text(
                  _isMuted ? 'Muted' : 'Recording...',
                  style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                    color: _isMuted ? Colors.grey : Colors.red,
                  ),
                ),
                if (_isUploadingChunk)
                  const Padding(
                    padding: EdgeInsets.only(top: 16),
                    child: CircularProgressIndicator(),
                  ),
                const SizedBox(height: 24),
                ElevatedButton(
                  onPressed: _isUploadingChunk ? null : _toggleMute,
                  style: ElevatedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 16),
                  ),
                  child: Text(_isMuted ? 'UNMUTE & SPEAK' : 'MUTE'),
                ),
              ],
            ),
          ),
          
          if (_localTemporaryTranscript.isNotEmpty)
             Padding(
               padding: const EdgeInsets.all(16.0),
               child: Text(_localTemporaryTranscript, style: const TextStyle(color: Colors.grey, fontStyle: FontStyle.italic)),
             ),

          // Finalized Transcript Area
          Expanded(
            child: StreamBuilder<QuerySnapshot>(
              stream: FirebaseFirestore.instance
                  .collection('meetings')
                  .doc(widget.meetingId)
                  .collection('transcript_segments')
                  .orderBy('sequenceNumber')
                  .snapshots(),
              builder: (context, snapshot) {
                if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
                
                final segments = snapshot.data!.docs;
                if (segments.isEmpty) {
                  return const Center(child: Text('No transcript segments yet.'));
                }

                return ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: segments.length,
                  itemBuilder: (context, index) {
                    final data = segments[index].data() as Map<String, dynamic>;
                    final segment = TranscriptSegment.fromMap(data, segments[index].id);
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 12.0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            segment.speakerName,
                            style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.blue),
                          ),
                          const SizedBox(height: 4),
                          Text(segment.text),
                        ],
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
