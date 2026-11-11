import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../services/firebase_service.dart';
import '../utils/pdf_generator.dart';

class DownloadReportsScreen extends StatelessWidget {
  const DownloadReportsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final firebaseService = FirebaseService();

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: const Text('Download Reports', style: TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: Colors.white,
        elevation: 0,
        foregroundColor: Colors.black87,
      ),
      body: StreamBuilder<QuerySnapshot>(
        stream: firebaseService.getMeetingsStream(), // Fetch all meetings
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(child: Text('Error: ${snapshot.error}'));
          }

          final meetings = snapshot.data?.docs ?? [];
          // Filter to only include meetings that have a transcript (or completed status)
          // For now, we'll show all meetings that aren't purely 'scheduled' so they can download past ones.
          final pastMeetings = meetings.where((doc) {
            final data = doc.data() as Map<String, dynamic>;
            return data['status'] != 'scheduled';
          }).toList();

          if (pastMeetings.isEmpty) {
            return const Center(
              child: Text('No reports available for download.', style: TextStyle(color: Colors.grey, fontSize: 16)),
            );
          }

          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: pastMeetings.length,
            itemBuilder: (context, index) {
              final doc = pastMeetings[index];
              final meeting = doc.data() as Map<String, dynamic>;
              
              return Card(
                elevation: 0,
                color: const Color(0xFF640D14).withOpacity(0.05),
                margin: const EdgeInsets.only(bottom: 12),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                  side: BorderSide(color: Colors.grey.shade300),
                ),
                child: ListTile(
                  leading: const Icon(Icons.picture_as_pdf, color: Color(0xFF800E13)),
                  title: Text(meeting['title'] ?? 'Untitled Meeting', style: const TextStyle(fontWeight: FontWeight.w600)),
                  subtitle: Text('Status: ${meeting['status'] ?? 'unknown'}'),
                  trailing: ElevatedButton.icon(
                    onPressed: () {
                      PdfGenerator.generateMeetingPdf(meeting);
                    },
                    icon: const Icon(Icons.download, size: 18),
                    label: const Text('Download'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF640D14),
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}
