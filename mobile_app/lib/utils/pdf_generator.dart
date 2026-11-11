import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:intl/intl.dart';
import 'package:flutter/services.dart' show rootBundle;

import 'dart:typed_data';

import 'board_minutes.dart';
import 'matrix_document.dart';

import 'package:cloud_firestore/cloud_firestore.dart';

class PdfGenerator {
  static Future<void> generateMeetingPdf(Map<String, dynamic> meeting) async {
    final title = reportText(meeting['title']);
    final date = reportIst(meeting['scheduledAt']);
    final started = reportIst(meeting['startedAt']);
    final ended = reportIst(meeting['endedAt']);
    final dateStr = date == null
        ? 'Calendar date not available'
        : DateFormat('EEEE, MMMM d, yyyy').format(date);
    final timeCommenced = started == null
        ? 'Not available'
        : '${DateFormat('h:mm a').format(started)} IST';
    final timeAdjourned =
        ended == null || (started != null && ended.isBefore(started))
        ? 'Not available'
        : '${DateFormat('h:mm a').format(ended)} IST';
    final presidingOfficerFullText = reportText(meeting['hostName']);
    BoardAttendance attendance = const BoardAttendance(null);
    if (meeting['id'] != null) {
      try {
        final snapshot = await FirebaseFirestore.instance
            .collection('meetings')
            .doc(meeting['id'])
            .collection('attendance')
            .get();
        // An empty legacy collection is unknown, not evidence of zero attendees.
        if (meeting['attendanceTracked'] == true) {
          attendance = BoardAttendance.fromRecords(
            snapshot.docs.map((d) => d.data()).toList(),
          );
        }
      } catch (_) {
        /* Show unavailable when attendance cannot be read. */
      }
    }
    pw.ImageProvider? logoImage;
    try {
      final ByteData bytes = await rootBundle.load(
        'assets/images/matrix_header.jpg',
      );
      logoImage = pw.MemoryImage(bytes.buffer.asUint8List());
    } catch (e) {
      print("Could not load logo: $e");
    }

    // Fetch transcript segments if meeting ID is present
    List<Map<String, dynamic>> segments = [];
    String fullTranscriptText = meeting['transcript'] ?? '';

    if (meeting['id'] != null) {
      try {
        final querySnapshot = await FirebaseFirestore.instance
            .collection('meetings')
            .doc(meeting['id'])
            .collection('transcript_segments')
            .orderBy('sequenceNumber')
            .get();
        segments = querySnapshot.docs.map((e) => e.data()).toList();

        if (segments.isNotEmpty) {
          fullTranscriptText = segments
              .map((s) => "**${s['speakerName']}:** ${s['text']}")
              .join('\n');
        }
      } catch (e) {
        print('Error fetching segments for PDF: $e');
      }
    }

    final transcriptText = fullTranscriptText;
    final pdf = buildMatrixDocument(
      meeting: meeting,
      title: title,
      dateStr: dateStr,
      timeCommenced: timeCommenced,
      timeAdjourned: timeAdjourned,
      presidingOfficerFullText: presidingOfficerFullText,
      attendance: attendance,
      transcriptText: transcriptText,
      logoImage: logoImage,
    );

    await Printing.layoutPdf(
      onLayout: (PdfPageFormat format) async => pdf.save(),
      name: '${title}_Minutes.pdf',
    );
  }
}
