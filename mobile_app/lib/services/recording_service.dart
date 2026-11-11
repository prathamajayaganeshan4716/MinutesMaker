import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'recording_interface.dart';
import 'recording_mobile.dart' if (dart.library.html) 'recording_web.dart';

class RecordingService {
  final RecordingInterface _impl = getRecordingService();

  Future<void> startRecording(MediaStream stream, String meetingId) async {
    return _impl.startRecording(stream, meetingId);
  }

  Future<Map<String, dynamic>?> stopRecording() async {
    return _impl.stopRecording();
  }
}
