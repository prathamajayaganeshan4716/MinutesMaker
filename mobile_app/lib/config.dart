import 'package:flutter/foundation.dart';

class AppConfig {
  // Hugging Face Cloud Inference Configuration
  static String get hfToken {
    return const String.fromEnvironment('HF_TOKEN', defaultValue: '');
  }
  
  // High-accuracy and fast serverless Whisper model
  static const String hfWhisperModel = 'openai/whisper-large-v3-turbo';
  
  // Free & active high-performance summarization model
  static const String hfSummaryModel = 'facebook/bart-large-cnn';

  // Legacy fallback if running local processor
  static const String laptopIpAddress = '192.168.1.39';
  static String get baseUrl {
    if (kIsWeb) {
      return 'http://127.0.0.1:8001'; 
    }
    return 'http://$laptopIpAddress:8001';
  }
}
