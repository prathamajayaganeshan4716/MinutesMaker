import 'package:flutter/foundation.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config.dart';

class HfAiService {
  final String _token;
  final String _whisperModel;
  final String _summaryModel;

  HfAiService({
    String? token,
    String? whisperModel,
    String? summaryModel,
  })  : _token = token ?? AppConfig.hfToken,
        _whisperModel = whisperModel ?? AppConfig.hfWhisperModel,
        _summaryModel = summaryModel ?? AppConfig.hfSummaryModel;

  /// Detects Whisper audio hallucinations (e.g. repeated "E ai", "K ai", "Thank you for watching")
  bool _isHallucination(String text) {
    final t = text.trim().toLowerCase();
    if (t.length < 4) return true;
    if (t.contains('subtitles by') || t.contains('thank you for watching') || t.contains('amara.org')) return true;

    // Check if text is just repeated short syllables like "e ai k ai e ai"
    final cleanWords = t.replaceAll(RegExp(r'[^\w\s]'), '').split(RegExp(r'\s+')).where((w) => w.isNotEmpty).toList();
    if (cleanWords.length >= 3) {
      final unique = cleanWords.toSet();
      if (unique.length <= 2) return true;
    }
    return false;
  }

  /// Transcribes raw audio chunk bytes using Hugging Face Whisper API
  Future<String?> transcribeChunk(Uint8List audioBytes) async {
    if (audioBytes.isEmpty) return null;
    if (_token.isEmpty) {
      print("[HfAiService] Error: Hugging Face token is empty");
      return null;
    }

    final url = Uri.parse('https://router.huggingface.co/hf-inference/models/$_whisperModel');
    
    String contentType = kIsWeb ? 'audio/webm' : 'audio/wav';
    if (audioBytes.length >= 4) {
      if (audioBytes[0] == 0x1A && audioBytes[1] == 0x45 && audioBytes[2] == 0xDF && audioBytes[3] == 0xA3) {
        contentType = 'audio/webm';
      } else if (audioBytes[0] == 0x52 && audioBytes[1] == 0x49 && audioBytes[2] == 0x46 && audioBytes[3] == 0x46) {
        contentType = 'audio/wav';
      }
    }

    try {
      final response = await http.post(
        url,
        headers: {
          'Authorization': 'Bearer $_token',
          'x-wait-for-model': 'true',
          'Content-Type': contentType,
        },
        body: audioBytes,
      ).timeout(const Duration(seconds: 45));

      if (response.statusCode == 200) {
        final decoded = jsonDecode(response.body);
        if (decoded is Map && decoded.containsKey('text')) {
          final text = (decoded['text'] as String?)?.trim();
          if (text != null && text.isNotEmpty) {
            if (_isHallucination(text)) {
              print("[HfAiService] Filtered out Whisper hallucination: $text");
              return null;
            }
            print("[HfAiService] Transcription success: $text");
            return text;
          }
        }
      } else if (response.statusCode == 503) {
        print("[HfAiService] Model waking up. Waiting 10s and retrying once...");
        await Future.delayed(const Duration(seconds: 10));
        final retryResponse = await http.post(
          url,
          headers: {
            'Authorization': 'Bearer $_token',
            'x-wait-for-model': 'true',
            'Content-Type': contentType,
          },
          body: audioBytes,
        ).timeout(const Duration(seconds: 45));
        
        if (retryResponse.statusCode == 200) {
          final decoded = jsonDecode(retryResponse.body);
          if (decoded is Map && decoded.containsKey('text')) {
            final text = (decoded['text'] as String?)?.trim();
            if (text != null && text.isNotEmpty && !_isHallucination(text)) {
              return text;
            }
          }
        }
      } else {
        print("[HfAiService] Transcription error (${response.statusCode}): ${response.body}");
      }
    } catch (e) {
      print("[HfAiService] Transcription exception: $e");
    }
    return null;
  }

  /// Helper to query an instruction/summarization model with a prompt
  Future<String> _queryPrompt(String prompt, {int maxTokens = 150}) async {
    final url = Uri.parse('https://router.huggingface.co/hf-inference/models/$_summaryModel');

    try {
      final response = await http.post(
        url,
        headers: {
          'Authorization': 'Bearer $_token',
          'Content-Type': 'application/json',
          'x-wait-for-model': 'true',
        },
        body: jsonEncode({
          'inputs': prompt,
          'parameters': {'max_new_tokens': maxTokens},
        }),
      ).timeout(const Duration(seconds: 40));

      if (response.statusCode == 200) {
        final decoded = jsonDecode(response.body);
        if (decoded is List && decoded.isNotEmpty && decoded[0] is Map) {
          final map = decoded[0] as Map;
          String text = ((map['summary_text'] ?? map['generated_text']) as String?)?.trim() ?? '';
          
          // Clean prompt echoes if the model repeats instruction text
          text = text
              .replaceAll(RegExp(r'^\.?\s*Summarize the following meeting transcript clearly:\s*', caseSensitive: false), '')
              .replaceAll(RegExp(r'^\.?\s*Extract key decisions made in this meeting:\s*', caseSensitive: false), '')
              .replaceAll(RegExp(r'^\.?\s*Extract action items and responsible persons from this meeting:\s*', caseSensitive: false), '')
              .replaceAll(RegExp(r'^\.?\s*What is the final conclusion of this meeting\??\s*', caseSensitive: false), '')
              .replaceAll(RegExp(r'^\.?\s*What was the final outcome of this Meeting\??\s*', caseSensitive: false), '')
              .trim();

          return text;
        }
      }
    } catch (e) {
      print("[HfAiService] Prompt error: $e");
    }
    return '';
  }

  /// Generates a comprehensive meeting report (summary, decisions, action items, conclusion)
  Future<Map<String, String>> generateSummary(String fullTranscript) async {
    final contentOnly = fullTranscript.replaceAll(RegExp(r'\*\*.*?\:\*\*'), '').trim();

    if (contentOnly.length < 15 || _isHallucination(contentOnly)) {
      return {
        'summary': 'No substantial discussion recorded in this meeting.',
        'decisions': 'None recorded.',
        'actionItems': 'None assigned.',
        'conclusion': 'Meeting concluded without key takeaways.',
      };
    }

    final snippet = fullTranscript.length > 2500 
        ? fullTranscript.substring(fullTranscript.length - 2500) 
        : fullTranscript;

    final summary = await _queryPrompt("Summarize the following meeting transcript clearly:\n\n$snippet");
    final decisions = await _queryPrompt("Extract key decisions made in this meeting:\n\n$snippet");
    final actionItems = await _queryPrompt("Extract action items and responsible persons from this meeting:\n\n$snippet");
    final conclusion = await _queryPrompt("What is the final conclusion of this meeting?\n\n$snippet");

    return {
      'summary': (summary.isNotEmpty && !_isHallucination(summary)) ? summary : 'Summary generation completed.',
      'decisions': (decisions.isNotEmpty && !_isHallucination(decisions)) ? decisions : 'None recorded.',
      'actionItems': (actionItems.isNotEmpty && !_isHallucination(actionItems)) ? actionItems : 'None assigned.',
      'conclusion': (conclusion.isNotEmpty && !_isHallucination(conclusion)) ? conclusion : 'Meeting concluded successfully.',
    };
  }
}
