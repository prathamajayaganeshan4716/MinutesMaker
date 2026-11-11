import 'dart:async';
import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../services/firebase_service.dart';
import '../models/app_models.dart';
import 'meeting_room_screen.dart';

class ExternalJoinScreen extends StatefulWidget {
  final String? initialCode;

  const ExternalJoinScreen({super.key, this.initialCode});

  @override
  State<ExternalJoinScreen> createState() => _ExternalJoinScreenState();
}

class _ExternalJoinScreenState extends State<ExternalJoinScreen> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _codeController;
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _firebaseService = FirebaseService();

  bool _isSearching = false;
  bool _isInLobby = false;
  MeetingModel? _targetMeeting;
  String? _lobbyDocId;
  StreamSubscription<DocumentSnapshot>? _lobbySubscription;

  @override
  void initState() {
    super.initState();
    _codeController = TextEditingController(text: widget.initialCode ?? '');
  }

  @override
  void dispose() {
    _codeController.dispose();
    _nameController.dispose();
    _emailController.dispose();
    _lobbySubscription?.cancel();
    super.dispose();
  }

  Future<void> _joinLobby() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _isSearching = true);

    final code = _codeController.text.trim();
    final name = _nameController.text.trim();
    final email = _emailController.text.trim();

    final meeting = await _firebaseService.getMeetingByCodeOrId(code);
    if (!mounted) return;

    if (meeting == null) {
      setState(() => _isSearching = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Invalid Meeting Code or Link. Please check and try again.')),
      );
      return;
    }

    _targetMeeting = meeting;
    final lobbyId = await _firebaseService.requestEntryToLobby(meeting.id, name, email);

    if (lobbyId != null) {
      setState(() {
        _isSearching = false;
        _isInLobby = true;
        _lobbyDocId = lobbyId;
      });

      // Listen for host admission decision
      _lobbySubscription = _firebaseService.streamLobbyStatus(meeting.id, lobbyId).listen((doc) {
        if (!doc.exists || doc.data() == null) return;
        final data = doc.data() as Map<String, dynamic>;
        final status = data['status'] ?? 'pending';

        if (status == 'admitted') {
          _lobbySubscription?.cancel();
          if (mounted) {
            Navigator.of(context).pushReplacement(
              MaterialPageRoute(
                builder: (_) => MeetingRoomScreen(
                  meetingId: meeting.id,
                  userName: name,
                ),
              ),
            );
          }
        } else if (status == 'denied') {
          _lobbySubscription?.cancel();
          if (mounted) {
            setState(() {
              _isInLobby = false;
              _lobbyDocId = null;
            });
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('The host has declined your request to join.')),
            );
          }
        }
      });
    } else {
      setState(() => _isSearching = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Failed to request entry to meeting.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    const maroonColor = Color(0xFF640D14);

    return Scaffold(
      backgroundColor: const Color(0xFFFAF7F2),
      appBar: AppBar(
        title: Image.asset(
          'assets/images/connect_horizontal.png',
          height: 28,
          errorBuilder: (context, error, stackTrace) => const Text('MINUTES MAKER', style: TextStyle(fontWeight: FontWeight.bold, color: Color(0xFF0F3B66))),
        ),
        backgroundColor: Colors.white,
        elevation: 0,
      ),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24.0),
          child: Container(
            constraints: const BoxConstraints(maxWidth: 450),
            child: Card(
              elevation: 4,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              child: Padding(
                padding: const EdgeInsets.all(24.0),
                child: _isInLobby ? _buildLobbyWaitingUI(maroonColor) : _buildJoinFormUI(maroonColor),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildJoinFormUI(Color maroonColor) {
    return Form(
      key: _formKey,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'Join Meeting as External Guest',
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Colors.black87),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 6),
          const Text(
            'Enter the meeting code and your contact details to request entry.',
            style: TextStyle(fontSize: 13, color: Colors.grey),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 24),
          TextFormField(
            controller: _codeController,
            decoration: const InputDecoration(
              labelText: 'Meeting Code or Link',
              hintText: 'e.g. cnt-8942-k91',
              prefixIcon: Icon(Icons.key),
              border: OutlineInputBorder(),
            ),
            validator: (v) => v == null || v.trim().isEmpty ? 'Required' : null,
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _nameController,
            decoration: const InputDecoration(
              labelText: 'Your Full Name',
              hintText: 'e.g. Sarah Jenkins',
              prefixIcon: Icon(Icons.person),
              border: OutlineInputBorder(),
            ),
            validator: (v) => v == null || v.trim().isEmpty ? 'Required' : null,
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _emailController,
            keyboardType: TextInputType.emailAddress,
            decoration: const InputDecoration(
              labelText: 'Your Email Address',
              hintText: 'e.g. sarah@partner.com',
              prefixIcon: Icon(Icons.email),
              border: OutlineInputBorder(),
            ),
            validator: (v) => v == null || v.trim().isEmpty ? 'Required' : null,
          ),
          const SizedBox(height: 24),
          SizedBox(
            height: 48,
            child: ElevatedButton.icon(
              onPressed: _isSearching ? null : _joinLobby,
              style: ElevatedButton.styleFrom(
                backgroundColor: maroonColor,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
              icon: _isSearching
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                  : const Icon(Icons.login),
              label: Text(_isSearching ? 'Connecting...' : 'Request Entry', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLobbyWaitingUI(Color maroonColor) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const SizedBox(height: 12),
        const SizedBox(
          width: 54,
          height: 54,
          child: CircularProgressIndicator(strokeWidth: 3, color: Color(0xFF640D14)),
        ),
        const SizedBox(height: 24),
        const Text(
          'Waiting for Host Admission',
          style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Colors.black87),
        ),
        const SizedBox(height: 8),
        Text(
          'You are in the waiting room for "${_targetMeeting?.title ?? 'Meeting'}".\nThe host will admit you shortly.',
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 14, color: Colors.black54),
        ),
        const SizedBox(height: 20),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: Colors.grey.shade100, borderRadius: BorderRadius.circular(8)),
          child: Column(
            children: [
              Row(children: [const Icon(Icons.person_outline, size: 18), const SizedBox(width: 6), Text('Host: ${_targetMeeting?.hostName ?? 'Admin'}')]),
              if (_targetMeeting?.agenda.isNotEmpty == true) ...[
                const SizedBox(height: 6),
                Row(children: [const Icon(Icons.notes, size: 18), const SizedBox(width: 6), Expanded(child: Text('Agenda: ${_targetMeeting!.agenda}', maxLines: 2, overflow: TextOverflow.ellipsis))]),
              ]
            ],
          ),
        ),
        const SizedBox(height: 24),
        OutlinedButton(
          onPressed: () {
            _lobbySubscription?.cancel();
            setState(() {
              _isInLobby = false;
              _lobbyDocId = null;
            });
          },
          child: const Text('Cancel Request'),
        )
      ],
    );
  }
}
