import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:http/http.dart' as http;
import 'recording_interface.dart';

class RecordingServiceImpl implements RecordingInterface {
  MediaRecorder? _mediaRecorder;
  String? _meetingId;

  @override
  Future<void> startRecording(MediaStream stream, String meetingId) async {
    _meetingId = meetingId;
    _mediaRecorder = MediaRecorder();
    _mediaRecorder?.startWeb(stream);
    print("Recording started (Web)");
  }

  @override
  Future<Map<String, dynamic>?> stopRecording() async {
    if (_mediaRecorder == null) return null;
    
    // On web, stop() returns the blob URL
    final blobUrl = await _mediaRecorder?.stop();
    
    if (blobUrl != null) {
      print("Recording blob url: $blobUrl");
      // Fetch the blob to get bytes
      final response = await http.get(Uri.parse(blobUrl));
      
      return {
        'bytes': response.bodyBytes,
        'filename': '$_meetingId.webm',
      };
    }
    return null;
  }
}

RecordingInterface getRecordingService() => RecordingServiceImpl();
