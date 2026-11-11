import '../config/super_admin.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:intl/intl.dart';
import '../services/firebase_service.dart';
import '../models/app_models.dart';
import 'meeting_room_screen.dart';

class CreateMeetingScreen extends StatefulWidget {
  final bool isScheduleMode;

  const CreateMeetingScreen({
    super.key,
    this.isScheduleMode = false,
  });

  @override
  State<CreateMeetingScreen> createState() => _CreateMeetingScreenState();
}

class _CreateMeetingScreenState extends State<CreateMeetingScreen> {
  final _formKey = GlobalKey<FormState>();
  final _titleController = TextEditingController();
  final _agendaController = TextEditingController();
  final _presidingOfficerController = TextEditingController();
  String _presidingOfficerDesignation = '';
  
  late String _meetingType;
  DateTime _scheduledDateTime = DateTime.now().add(const Duration(hours: 1));

  // Way 1: Selected Departments
  final Set<String> _selectedDepartments = {};

  // Way 2: Selected Individual Board Members
  final Set<String> _selectedMemberUids = {};

  // Way 3: External Participants (Name + Email)
  final List<Map<String, String>> _externalParticipants = [];
  final _extNameController = TextEditingController();
  final _extEmailController = TextEditingController();

  final _firebaseService = FirebaseService();
  bool _isCreating = false;

  @override
  void initState() {
    super.initState();
    _meetingType = widget.isScheduleMode ? 'scheduled' : 'instant';
  }

  @override
  void dispose() {
    _titleController.dispose();
    _agendaController.dispose();
    _presidingOfficerController.dispose();
    _extNameController.dispose();
    _extEmailController.dispose();
    super.dispose();
  }

  void _addExternalParticipant() {
    final name = _extNameController.text.trim();
    final email = _extEmailController.text.trim();
    if (name.isEmpty || email.isEmpty) return;

    setState(() {
      _externalParticipants.add({'name': name, 'email': email});
      _extNameController.clear();
      _extEmailController.clear();
    });
  }

  Future<void> _pickScheduledDateTime() async {
    final date = await showDatePicker(
      context: context,
      initialDate: _scheduledDateTime,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (date == null) return;

    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_scheduledDateTime),
    );
    if (time == null) return;

    setState(() {
      _scheduledDateTime = DateTime(date.year, date.month, date.day, time.hour, time.minute);
    });
  }

  Future<void> _submitMeeting() async {
    final user = _firebaseService.currentUser;
    if (!_formKey.currentState!.validate()) return;
    setState(() => _isCreating = true);

    final title = _titleController.text.trim();
    final agenda = _agendaController.text.trim();
    final hostName = user?.displayName ?? user?.email?.split('@')[0] ?? 'Host';

    final result = await _firebaseService.createMeetingDetailed(
      title: title,
      agenda: agenda,
      meetingType: _meetingType,
      scheduledAt: _meetingType == 'scheduled' ? _scheduledDateTime : null,
      hostName: hostName,
      hostEmail: user?.email ?? '',
      hostUid: user?.uid ?? '',
      selectedDepartments: _selectedDepartments.toList(),
      invitedMemberUids: _selectedMemberUids.toList(),
      externalParticipants: _externalParticipants,
      presidingOfficer: _presidingOfficerController.text.trim().isNotEmpty
          ? _presidingOfficerController.text.trim()
          : hostName,
      presidingOfficerDesignation: _presidingOfficerDesignation,
    );

    if (mounted) {
      setState(() => _isCreating = false);
      if (result != null) {
        _showSuccessDialog(result['meetingId']!, result['meetingCode']!, title, hostName);
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Failed to create meeting. Please try again.')),
        );
      }
    }
  }

  void _showSuccessDialog(String meetingId, String meetingCode, String title, String hostName) {
    String origin = 'https://minutes-maker-peach.vercel.app';
    if (kIsWeb) {
      try {
        final o = Uri.base.origin;
        if (o.isNotEmpty && !o.contains('localhost')) {
          origin = o;
        }
      } catch (_) {}
    }
    final meetingLink = '$origin/#/join?code=$meetingCode';
    final isScheduled = _meetingType == 'scheduled';

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Row(
          children: [
            const Icon(Icons.check_circle, color: Colors.green, size: 28),
            const SizedBox(width: 8),
            Text(isScheduled ? 'Meeting Scheduled!' : 'Meeting Created!', style: const TextStyle(fontWeight: FontWeight.bold)),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Title: $title', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
            if (isScheduled) ...[
              const SizedBox(height: 6),
              Text(
                'Date: ${DateFormat('EEEE, MMM d, yyyy • hh:mm a').format(_scheduledDateTime)}',
                style: const TextStyle(color: Color(0xFF640D14), fontWeight: FontWeight.w500),
              ),
            ],
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: Colors.grey.shade100, borderRadius: BorderRadius.circular(8)),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('Code: $meetingCode', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: Color(0xFF640D14))),
                      IconButton(
                        icon: const Icon(Icons.copy, size: 20),
                        tooltip: 'Copy Code',
                        onPressed: () {
                          Clipboard.setData(ClipboardData(text: meetingCode));
                          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Meeting Code copied to clipboard!')));
                        },
                      ),
                    ],
                  ),
                  const Divider(),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(child: Text('Link: $meetingLink', style: const TextStyle(fontSize: 12), overflow: TextOverflow.ellipsis)),
                      IconButton(
                        icon: const Icon(Icons.link, size: 20),
                        tooltip: 'Copy Link',
                        onPressed: () {
                          Clipboard.setData(ClipboardData(text: meetingLink));
                          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Meeting Link copied to clipboard!')));
                        },
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.pop(ctx);
              Navigator.pop(context);
            },
            child: const Text('Back to Dashboard'),
          ),
          if (!isScheduled)
            ElevatedButton.icon(
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF640D14), foregroundColor: Colors.white),
              onPressed: () {
                Navigator.pop(ctx);
                Navigator.of(context).pushReplacement(
                  MaterialPageRoute(builder: (_) => MeetingRoomScreen(meetingId: meetingId, userName: hostName)),
                );
              },
              icon: const Icon(Icons.video_call),
              label: const Text('Start Meeting Now'),
            ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    const maroonColor = Color(0xFF640D14);
    final isScheduled = widget.isScheduleMode;

    return Scaffold(
      appBar: AppBar(
        title: Text(
          isScheduled ? 'Schedule a Meeting' : 'Create Instant Meeting',
          style: const TextStyle(fontWeight: FontWeight.bold),
        ),
        backgroundColor: Colors.white,
        foregroundColor: Colors.black87,
        elevation: 1,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24.0),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Show Date/Time Picker prominently at top when in Schedule Mode
              if (isScheduled) ...[
                Container(
                  margin: const EdgeInsets.only(bottom: 24),
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: maroonColor.withOpacity(0.06),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: maroonColor.withOpacity(0.2)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Row(
                        children: [
                          Icon(Icons.calendar_month, color: maroonColor, size: 22),
                          SizedBox(width: 8),
                          Text('Scheduled Date & Time', style: TextStyle(fontWeight: FontWeight.bold, color: maroonColor, fontSize: 16)),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              DateFormat('EEEE, MMMM d, yyyy  •  hh:mm a').format(_scheduledDateTime),
                              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15, color: Colors.black87),
                            ),
                          ),
                          OutlinedButton.icon(
                            onPressed: _pickScheduledDateTime,
                            icon: const Icon(Icons.edit_calendar, size: 18),
                            label: const Text('Change'),
                            style: OutlinedButton.styleFrom(
                              foregroundColor: maroonColor,
                              side: const BorderSide(color: maroonColor),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],

              // 1. Required Details
              const Text('1. Meeting Details', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: maroonColor)),
              const SizedBox(height: 12),
              TextFormField(
                controller: _titleController,
                decoration: const InputDecoration(
                  labelText: 'Meeting Title *',
                  hintText: 'e.g. Executive Board Strategy Review',
                  border: OutlineInputBorder(),
                ),
                validator: (val) => val == null || val.trim().isEmpty ? 'Required' : null,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _agendaController,
                maxLines: 3,
                decoration: const InputDecoration(
                  labelText: 'Meeting Agenda *',
                  hintText: '1. Financial Report\n2. Q3 Roadmap\n3. External Partnerships',
                  border: OutlineInputBorder(),
                ),
                validator: (val) => val == null || val.trim().isEmpty ? 'Required' : null,
              ),
              const SizedBox(height: 16),

              // Presiding Officer Input with Autocomplete from Board Members Directory
              StreamBuilder<QuerySnapshot>(
                stream: _firebaseService.getBoardMembersStream(),
                builder: (context, snapshot) {
                  final docs = snapshot.data?.docs ?? [];
                  final boardMembers = docs
                      .map((d) => BoardMember.fromMap(d.data() as Map<String, dynamic>, d.id))
                      .toList();

                  return Autocomplete<BoardMember>(
                    displayStringForOption: (BoardMember m) => m.name,
                    optionsBuilder: (TextEditingValue textEditingValue) {
                      if (textEditingValue.text.isEmpty) {
                        return boardMembers;
                      }
                      final query = textEditingValue.text.toLowerCase();
                      return boardMembers.where((m) =>
                        m.name.toLowerCase().contains(query) ||
                        m.position.toLowerCase().contains(query) ||
                        m.department.toLowerCase().contains(query)
                      );
                    },
                    onSelected: (BoardMember selection) {
                      _presidingOfficerController.text = selection.name;
                      setState(() {
                        _presidingOfficerDesignation = selection.position;
                      });
                    },
                    fieldViewBuilder: (context, fieldTextEditingController, fieldFocusNode, onFieldSubmitted) {
                      if (_presidingOfficerController.text.isNotEmpty && fieldTextEditingController.text.isEmpty) {
                        fieldTextEditingController.text = _presidingOfficerController.text;
                      }

                      fieldTextEditingController.addListener(() {
                        _presidingOfficerController.text = fieldTextEditingController.text;
                        final match = boardMembers.where(
                          (m) => m.name.toLowerCase().trim() == fieldTextEditingController.text.toLowerCase().trim()
                        ).firstOrNull;
                        if (match != null && match.position.isNotEmpty) {
                          if (_presidingOfficerDesignation != match.position) {
                            setState(() {
                              _presidingOfficerDesignation = match.position;
                            });
                          }
                        }
                      });

                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          TextFormField(
                            controller: fieldTextEditingController,
                            focusNode: fieldFocusNode,
                            decoration: InputDecoration(
                              labelText: 'Presiding Officer *',
                              hintText: 'e.g. Mr. Sam Michael',
                              border: const OutlineInputBorder(),
                              prefixIcon: const Icon(Icons.person_pin, color: maroonColor),
                              suffixIcon: _presidingOfficerDesignation.isNotEmpty
                                  ? const Icon(Icons.verified, color: Colors.green)
                                  : null,
                            ),
                            validator: (val) => val == null || val.trim().isEmpty ? 'Presiding Officer is required' : null,
                          ),
                          if (_presidingOfficerDesignation.isNotEmpty) ...[
                            const SizedBox(height: 6),
                            Row(
                              children: [
                                const Icon(Icons.badge, size: 16, color: maroonColor),
                                const SizedBox(width: 6),
                                Expanded(
                                  child: Text(
                                    'Designation: $_presidingOfficerDesignation (will be added to PDF)',
                                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: maroonColor),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ],
                      );
                    },
                    optionsViewBuilder: (context, onSelected, options) {
                      return Align(
                        alignment: Alignment.topLeft,
                        child: Material(
                          elevation: 4,
                          borderRadius: BorderRadius.circular(8),
                          child: ConstrainedBox(
                            constraints: const BoxConstraints(maxHeight: 220, maxWidth: 450),
                            child: ListView.separated(
                              padding: const EdgeInsets.symmetric(vertical: 4),
                              shrinkWrap: true,
                              itemCount: options.length,
                              separatorBuilder: (_, __) => const Divider(height: 1),
                              itemBuilder: (BuildContext context, int index) {
                                final BoardMember option = options.elementAt(index);
                                return ListTile(
                                  dense: true,
                                  leading: CircleAvatar(
                                    radius: 14,
                                    backgroundColor: option.isHead ? maroonColor : Colors.grey.shade300,
                                    child: Icon(
                                      option.isHead ? Icons.star : Icons.person,
                                      size: 14,
                                      color: option.isHead ? Colors.white : Colors.black54,
                                    ),
                                  ),
                                  title: Text(option.name, style: const TextStyle(fontWeight: FontWeight.bold)),
                                  subtitle: Text(
                                    option.position.isNotEmpty ? '${option.position} • ${option.department}' : option.department,
                                    style: const TextStyle(fontSize: 12),
                                  ),
                                  trailing: option.isHead
                                      ? Container(
                                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                          decoration: BoxDecoration(color: maroonColor, borderRadius: BorderRadius.circular(4)),
                                          child: const Text('HEAD', style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold)),
                                        )
                                      : null,
                                  onTap: () => onSelected(option),
                                );
                              },
                            ),
                          ),
                        ),
                      );
                    },
                  );
                },
              ),

              const SizedBox(height: 28),
              // 2. Three-Way Participant Selection
              const Text('2. Select Participants', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: maroonColor)),
              const SizedBox(height: 12),

              DefaultTabController(
                length: 3,
                child: Column(
                  children: [
                    Container(
                      color: Colors.grey.shade100,
                      child: const TabBar(
                        labelColor: maroonColor,
                        unselectedLabelColor: Colors.black54,
                        indicatorColor: maroonColor,
                        tabs: [
                          Tab(text: 'By Department'),
                          Tab(text: 'Board Members'),
                          Tab(text: 'External Guests'),
                        ],
                      ),
                    ),
                    SizedBox(
                      height: 240,
                      child: TabBarView(
                        children: [
                          // Way 1: Select Department
                          StreamBuilder<QuerySnapshot>(
                            stream: _firebaseService.getDepartmentsStream(),
                            builder: (context, deptSnap) {
                              List<String> depts = [];
                              if (deptSnap.hasData && deptSnap.data!.docs.isNotEmpty) {
                                depts = deptSnap.data!.docs
                                    .map((d) => (d.data() as Map<String, dynamic>)['name']?.toString() ?? '')
                                    .where((s) => s.isNotEmpty)
                                    .toList();
                              }
                              if (depts.isEmpty) {
                                return const Center(
                                  child: Padding(
                                    padding: EdgeInsets.all(16.0),
                                    child: Text('No departments created yet.', style: TextStyle(color: Colors.grey)),
                                  ),
                                );
                              }

                              return ListView(
                                children: depts.map((dept) {
                                  final isSelected = _selectedDepartments.contains(dept);
                                  return CheckboxListTile(
                                    title: Text('$dept Department'),
                                    value: isSelected,
                                    onChanged: (val) {
                                      setState(() {
                                        if (val == true) {
                                          _selectedDepartments.add(dept);
                                        } else {
                                          _selectedDepartments.remove(dept);
                                        }
                                      });
                                    },
                                  );
                                }).toList(),
                              );
                            },
                          ),

                          // Way 2: Select Individual Board Members
                          StreamBuilder<QuerySnapshot>(
                            stream: _firebaseService.getBoardMembersStream(),
                            builder: (context, snapshot) {
                              if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
                              final docs = snapshot.data!.docs;
                              if (docs.isEmpty) {
                                return const Center(child: Text('No board members registered yet.'));
                              }
                              return ListView.builder(
                                itemCount: docs.length,
                                itemBuilder: (ctx, idx) {
                                  final m = BoardMember.fromMap(docs[idx].data() as Map<String, dynamic>, docs[idx].id);
                                  final isSelected = _selectedMemberUids.contains(m.id);
                                  return CheckboxListTile(
                                    title: Text(m.name),
                                    subtitle: Text('${m.department} • ${m.email}'),
                                    value: isSelected,
                                    onChanged: (val) {
                                      setState(() {
                                        if (val == true) {
                                          _selectedMemberUids.add(m.id);
                                        } else {
                                          _selectedMemberUids.remove(m.id);
                                        }
                                      });
                                    },
                                  );
                                },
                              );
                            },
                          ),

                          // Way 3: External Participants (Name + Email)
                          Padding(
                            padding: const EdgeInsets.all(12.0),
                            child: Column(
                              children: [
                                Row(
                                  children: [
                                    Expanded(
                                      child: TextField(
                                        controller: _extNameController,
                                        decoration: const InputDecoration(labelText: 'Name', isDense: true, border: OutlineInputBorder()),
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    Expanded(
                                      child: TextField(
                                        controller: _extEmailController,
                                        decoration: const InputDecoration(labelText: 'Email', isDense: true, border: OutlineInputBorder()),
                                      ),
                                    ),
                                    IconButton(
                                      icon: const Icon(Icons.add_circle, color: maroonColor, size: 32),
                                      onPressed: _addExternalParticipant,
                                    )
                                  ],
                                ),
                                const SizedBox(height: 8),
                                Expanded(
                                  child: _externalParticipants.isEmpty
                                      ? const Center(child: Text('No external participants added.', style: TextStyle(color: Colors.grey)))
                                      : ListView.builder(
                                          itemCount: _externalParticipants.length,
                                          itemBuilder: (ctx, idx) {
                                            final ext = _externalParticipants[idx];
                                            return ListTile(
                                              dense: true,
                                              leading: const Icon(Icons.person_outline),
                                              title: Text(ext['name'] ?? ''),
                                              subtitle: Text(ext['email'] ?? ''),
                                              trailing: IconButton(
                                                icon: const Icon(Icons.close, size: 18, color: Colors.red),
                                                onPressed: () => setState(() => _externalParticipants.removeAt(idx)),
                                              ),
                                            );
                                          },
                                        ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 32),
              SizedBox(
                height: 52,
                child: ElevatedButton.icon(
                  onPressed: _isCreating ? null : _submitMeeting,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: maroonColor,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  icon: _isCreating
                      ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                      : Icon(isScheduled ? Icons.calendar_month : Icons.video_call, size: 24),
                  label: Text(
                    _isCreating
                        ? (isScheduled ? 'Scheduling Meeting...' : 'Creating Meeting...')
                        : (isScheduled ? 'Schedule Meeting' : 'Create & Generate Meeting Code'),
                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
