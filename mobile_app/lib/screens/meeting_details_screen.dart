import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../utils/pdf_generator.dart';
import '../models/app_models.dart';

class MeetingDetailsScreen extends StatelessWidget {
  final Map<String, dynamic> meeting;

  const MeetingDetailsScreen({super.key, required this.meeting});

  Future<void> _generatePdf(BuildContext context) async {
    await PdfGenerator.generateMeetingPdf(meeting);
  }

  Widget _buildSection(String title, String? content) {
    if (content == null || content.isEmpty || content == 'N/A' || content == 'None') return const SizedBox.shrink();
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 8),
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: Colors.grey.shade300),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18, color: Color(0xFF640D14))),
            const Divider(),
            const SizedBox(height: 8),
            Text(content, style: const TextStyle(fontSize: 14, height: 1.5)),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final meetingId = meeting['id'] as String?;
    
    return Scaffold(
      appBar: AppBar(
        title: const Text('Meeting Details'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(meeting['title'] ?? 'Untitled Meeting', style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
            const SizedBox(height: 4),
            Text('Status: ${meeting['status']}', style: const TextStyle(color: Colors.grey)),
            const SizedBox(height: 24),
            
            if (meeting['summary'] != null) _buildSection('Summary', meeting['summary']),
            if (meeting['decisions'] != null) _buildSection('Decisions', meeting['decisions']),
            if (meeting['actionItems'] != null) _buildSection('Action Items', meeting['actionItems']),
            if (meeting['conclusion'] != null) _buildSection('Conclusion', meeting['conclusion']),
            
            const SizedBox(height: 16),
            const Text('Transcript', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18, color: Color(0xFF640D14))),
            const Divider(),
            
            if (meetingId != null)
              StreamBuilder<QuerySnapshot>(
                stream: FirebaseFirestore.instance
                    .collection('meetings')
                    .doc(meetingId)
                    .collection('transcript_segments')
                    .orderBy('sequenceNumber')
                    .snapshots(),
                builder: (context, snapshot) {
                  if (snapshot.connectionState == ConnectionState.waiting) {
                    return const Center(child: CircularProgressIndicator());
                  }
                  
                  final docs = snapshot.data?.docs ?? [];
                  if (docs.isEmpty) {
                    return const Padding(
                      padding: EdgeInsets.all(16.0),
                      child: Text('No transcript available.', style: TextStyle(fontStyle: FontStyle.italic, color: Colors.grey)),
                    );
                  }
                  
                  return ListView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: docs.length,
                    itemBuilder: (context, index) {
                      final segData = docs[index].data() as Map<String, dynamic>;
                      final segment = TranscriptSegment.fromMap(segData, docs[index].id);
                      
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 12.0),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(segment.speakerName, style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.blue)),
                            const SizedBox(height: 4),
                            Text(segment.text, style: const TextStyle(height: 1.5)),
                          ],
                        ),
                      );
                    },
                  );
                },
              )
            else 
              _buildSection('Raw Transcript Fallback', meeting['transcript']),
              
            const SizedBox(height: 80), // Padding for FAB
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _generatePdf(context),
        icon: const Icon(Icons.picture_as_pdf),
        label: const Text('Download PDF'),
        backgroundColor: const Color(0xFF640D14),
        foregroundColor: Colors.white,
      ),
    );
  }
}
