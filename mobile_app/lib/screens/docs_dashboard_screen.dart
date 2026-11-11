import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../services/firebase_service.dart';
import 'meeting_details_screen.dart';

class DocsDashboardScreen extends StatelessWidget {
  const DocsDashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final firebaseService = FirebaseService();

    return Scaffold(
      backgroundColor: Colors.grey.shade50,
      appBar: AppBar(
        title: const Text('Documentation Dashboard', style: TextStyle(fontWeight: FontWeight.w600)),
        backgroundColor: const Color(0xFF640D14),
        foregroundColor: Colors.white,
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () async {
              await FirebaseAuth.instance.signOut();
            },
          ),
        ],
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.all(24),
            decoration: const BoxDecoration(
              color: Color(0xFF640D14),
              borderRadius: BorderRadius.only(
                bottomLeft: Radius.circular(24),
                bottomRight: Radius.circular(24),
              ),
            ),
            child: const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  "Documentation Review",
                  style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Colors.white),
                ),
                SizedBox(height: 8),
                Text(
                  "Review AI generated transcripts, decisions, and generate official PDFs.",
                  style: TextStyle(color: Colors.white70),
                ),
              ],
            ),
          ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Card(
                elevation: 2,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                child: Column(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: Colors.grey.shade100,
                        borderRadius: const BorderRadius.vertical(top: Radius.circular(12)),
                      ),
                      child: Row(
                        children: [
                          Icon(Icons.edit_document, color: const Color(0xFF800E13)),
                          const SizedBox(width: 8),
                          const Text("Ready for Review", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                        ],
                      ),
                    ),
                    const Divider(height: 1),
                    Expanded(
                      child: StreamBuilder<QuerySnapshot>(
                        stream: firebaseService.getMeetingsStream(),
                        builder: (context, snapshot) {
                          if (snapshot.connectionState == ConnectionState.waiting) {
                            return const Center(child: CircularProgressIndicator());
                          }
                          if (snapshot.hasError) {
                            return Center(child: Text('Error: ${snapshot.error}'));
                          }
                          
                          final meetings = snapshot.data?.docs ?? [];
                          
                          if (meetings.isEmpty) {
                            return const Center(
                              child: Text('No meetings to review.', style: TextStyle(color: Colors.grey)),
                            );
                          }

                          return ListView.separated(
                            itemCount: meetings.length,
                            separatorBuilder: (context, index) => const Divider(height: 1),
                            itemBuilder: (context, index) {
                              final doc = meetings[index];
                              final meeting = doc.data() as Map<String, dynamic>;
                              final status = meeting['status'] ?? 'unknown';
                              final title = meeting['title'] ?? 'Untitled Meeting';
                              
                              return ListTile(
                                leading: CircleAvatar(
                                  backgroundColor: const Color(0xFF800E13).withOpacity(0.1),
                                  child: const Icon(Icons.picture_as_pdf, color: Color(0xFF640D14)),
                                ),
                                title: Text(title, style: const TextStyle(fontWeight: FontWeight.w500)),
                                subtitle: Text('Status: $status'),
                                trailing: const Icon(Icons.chevron_right, color: Colors.grey),
                                onTap: () {
                                  Navigator.of(context).push(
                                    MaterialPageRoute(
                                      builder: (_) => MeetingDetailsScreen(meeting: meeting),
                                    ),
                                  );
                                },
                              );
                            },
                          );
                        },
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
