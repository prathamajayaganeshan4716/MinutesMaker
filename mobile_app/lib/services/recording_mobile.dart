import 'dart:io';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:path_provider/path_provider.dart';
import 'recording_interface.dart';

class RecordingServiceImpl implements RecordingInterface {
  MediaRecorder? _mediaRecorder;
  String? _recordingPath;
  String? _meetingId;

  @override
  Future<void> startRecording(MediaStream stream, String meetingId) async {
    _meetingId = meetingId;
    final dir = await getApplicationDocumentsDirectory();
    _recordingPath = '${dir.path}/$meetingId.mp4';
    
    _mediaRecorder = MediaRecorder();
    await _mediaRecorder?.start(
      _recordingPath!,
      videoTrack: stream.getVideoTracks().firstOrNull,
      audioChannel: RecorderAudioChannel.INPUT,
    );
    print("Recording started (Mobile): $_recordingPath");
  }

  @override
  Future<Map<String, dynamic>?> stopRecording() async {
    if (_mediaRecorder == null || _recordingPath == null) return null;
    
    await _mediaRecorder?.stop();
    final file = File(_recordingPath!);
    
    if (await file.exists()) {
      print("Recording saved to: $_recordingPath");
      return {
        'bytes': await file.readAsBytes(),
        'filename': '$_meetingId.mp4',
      };
    }
    return null;
  }
}

RecordingInterface getRecordingService() => RecordingServiceImpl();
