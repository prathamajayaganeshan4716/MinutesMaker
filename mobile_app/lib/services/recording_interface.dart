import 'package:flutter_webrtc/flutter_webrtc.dart';

abstract class RecordingInterface {
  Future<void> startRecording(MediaStream stream, String meetingId);
  
  /// Returns a Map with 'bytes' (List<int>) and 'filename' (String)
  Future<Map<String, dynamic>?> stopRecording();
}
