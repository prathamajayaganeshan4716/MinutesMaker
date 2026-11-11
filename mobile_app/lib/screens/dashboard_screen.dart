import '../config/super_admin.dart';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../services/firebase_service.dart';
import '../utils/pdf_generator.dart';
import 'create_meeting_screen.dart';
import 'meeting_room_screen.dart';
import 'meeting_details_screen.dart';
import 'download_reports_screen.dart';
import 'admin_dashboard_screen.dart';
import '../models/app_models.dart';

class LiveClock extends StatefulWidget {
  final String userName;
  const LiveClock({super.key, required this.userName});

  @override
  State<LiveClock> createState() => _LiveClockState();
}

class _LiveClockState extends State<LiveClock> {
  late Timer _timer;
  DateTime _currentTime = DateTime.now();

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (mounted) {
        setState(() {
          _currentTime = DateTime.now();
        });
      }
    });
  }

  @override
  void dispose() {
    _timer.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final timeStr = DateFormat('hh:mm').format(_currentTime);
    final amPmStr = DateFormat('a').format(_currentTime);
    final dateStr = DateFormat('EEEE, MMMM d, yyyy').format(_currentTime);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 24),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xFF1E2638),
            Color(0xFF131826),
          ],
        ),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08), width: 1.2),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.25),
            blurRadius: 20,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.baseline,
                textBaseline: TextBaseline.alphabetic,
                children: [
                  Text(
                    timeStr,
                    style: const TextStyle(
                      fontSize: 48,
                      fontWeight: FontWeight.w900,
                      letterSpacing: -1.5,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    amPmStr,
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w700,
                      color: Colors.blueAccent.shade100,
                    ),
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: Colors.greenAccent.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.greenAccent.withValues(alpha: 0.4)),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    CircleAvatar(radius: 4, backgroundColor: Colors.greenAccent),
                    SizedBox(width: 6),
                    Text(
                      'Ready to Meet',
                      style: TextStyle(color: Colors.greenAccent, fontSize: 11, fontWeight: FontWeight.bold),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            dateStr,
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w500,
              color: Colors.white.withValues(alpha: 0.6),
            ),
          ),
          const SizedBox(height: 12),
          Text(
            widget.userName.isNotEmpty ? 'Welcome, ${widget.userName}!' : 'Welcome to Minutes Maker',
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: Colors.lightBlueAccent,
            ),
          ),
        ],
      ),
    );
  }
}

class DashboardScreen extends StatefulWidget {
  final bool hideAppBar;
  const DashboardScreen({super.key, this.hideAppBar = false});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  final _firebaseService = FirebaseService();
  AppUser? _currentUserProfile;
  int _selectedNavTab = 0; // 0: Home, 1: Meetings, 2: Reports
  String _searchQuery = '';
  final TextEditingController _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _fetchProfile();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _fetchProfile() async {
    final uid = _firebaseService.currentUser?.uid;
    if (uid != null) {
      final profile = await _firebaseService.getUserProfile(uid);
      if (mounted) {
        setState(() {
          _currentUserProfile = profile;
        });
      }
    }
  }

  Future<void> _startNewMeeting() async {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const CreateMeetingScreen(isScheduleMode: false)),
    );
  }

  Future<void> _scheduleMeeting() async {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const CreateMeetingScreen(isScheduleMode: true)),
    );
  }

  void _showJoinMeetingDialog() {
    final codeController = TextEditingController();
    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1E222D),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          title: const Row(
            children: [
              Icon(Icons.add_box_rounded, color: Color(0xFF0E72ED), size: 24),
              SizedBox(width: 10),
              Text("Join a Meeting", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
            ],
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                "Enter meeting code or ID to join instantly:",
                style: TextStyle(color: Colors.white70, fontSize: 13),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: codeController,
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                decoration: InputDecoration(
                  hintText: "e.g. 84sz0VxJHc",
                  hintStyle: const TextStyle(color: Colors.white30),
                  filled: true,
                  fillColor: const Color(0xFF12151D),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Colors.white12)),
                  enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Colors.white12)),
                  focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFF0E72ED), width: 2)),
                  prefixIcon: const Icon(Icons.key, color: Colors.white54),
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text("Cancel", style: TextStyle(color: Colors.white60)),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF0E72ED),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              onPressed: () async {
                final code = codeController.text.trim();
                if (code.isEmpty) return;

                final meeting = await _firebaseService.getMeetingByCodeOrId(code);
                if (!mounted) return;

                if (meeting != null) {
                  Navigator.pop(context);
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => MeetingRoomScreen(
                        meetingId: meeting.id,
                        userName: _firebaseService.currentUser?.displayName ??
                            _firebaseService.currentUser?.email?.split('@')[0] ??
                            'Member',
                      ),
                    ),
                  );
                } else {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Invalid Meeting Code or Link. Please try again.')),
                  );
                }
              },
              child: const Text("Join Now", style: TextStyle(fontWeight: FontWeight.bold)),
            ),
          ],
        );
      },
    );
  }

  Future<void> _generatePdf(Map<String, dynamic> meeting) async {
    await PdfGenerator.generateMeetingPdf(meeting);
  }

  void _showMembersDialog(Map<String, dynamic> meeting) {
    final participantsRaw = meeting['participants'];
    List<String> members = [];
    if (participantsRaw != null && participantsRaw.toString().isNotEmpty) {
      members = participantsRaw.toString().split(',').map((e) => e.trim()).toList();
    }
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF1E222D),
        title: const Text("Meeting Members", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        content: members.isEmpty
            ? const Text("No members were listed for this meeting.", style: TextStyle(color: Colors.white70))
            : SizedBox(
                width: double.maxFinite,
                child: ListView.builder(
                  shrinkWrap: true,
                  itemCount: members.length,
                  itemBuilder: (context, index) => ListTile(
                    leading: const CircleAvatar(backgroundColor: Color(0xFF0E72ED), child: Icon(Icons.person, color: Colors.white, size: 18)),
                    title: Text(members[index], style: const TextStyle(color: Colors.white)),
                  ),
                ),
              ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text("Close", style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  void _confirmDelete(String docId) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF1E222D),
        title: const Text("Delete Meeting", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        content: const Text("Are you sure you want to delete this meeting history permanently?", style: TextStyle(color: Colors.white70)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text("Cancel", style: TextStyle(color: Colors.white60))),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.redAccent, foregroundColor: Colors.white),
            onPressed: () async {
              try {
                await _firebaseService.deleteMeeting(docId);
                if (!mounted) return;
                Navigator.pop(context);
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Meeting history deleted.')));
              } catch (e) {
                if (!mounted) return;
                Navigator.pop(context);
                ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error deleting: $e')));
              }
            },
            child: const Text("Delete"),
          ),
        ],
      ),
    );
  }

  // --- Zoom Iconic Action Squircle Button with Micro-Animation ---
  Widget _buildZoomActionCard({
    required IconData icon,
    required String label,
    required List<Color> gradientColors,
    required Color glowColor,
    required VoidCallback onTap,
    String? badgeText,
  }) {
    return _HoverScaleButton(
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 88,
            height: 88,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: gradientColors,
              ),
              borderRadius: BorderRadius.circular(24),
              boxShadow: [
                BoxShadow(
                  color: glowColor.withValues(alpha: 0.35),
                  blurRadius: 18,
                  offset: const Offset(0, 8),
                ),
              ],
            ),
            child: Stack(
              alignment: Alignment.center,
              children: [
                Icon(icon, color: Colors.white, size: 42),
                if (badgeText != null)
                  Positioned(
                    top: 14,
                    child: Text(
                      badgeText,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 14,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 10),
          Text(
            label,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: Colors.white,
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }

  Widget _buildUpcomingCard() {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF1A202C),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.2),
            blurRadius: 14,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Row(
                  children: [
                    Icon(Icons.calendar_month_rounded, color: Color(0xFF0E72ED), size: 20),
                    SizedBox(width: 8),
                    Text(
                      "Upcoming Meetings",
                      style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: Colors.white),
                    ),
                  ],
                ),
                TextButton(
                  onPressed: _scheduleMeeting,
                  style: TextButton.styleFrom(foregroundColor: const Color(0xFF0E72ED)),
                  child: const Text("+ Schedule", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                ),
              ],
            ),
          ),
          const Divider(height: 1, color: Colors.white10),
          Expanded(
            child: StreamBuilder<QuerySnapshot>(
              stream: _firebaseService.getScheduledMeetingsStream(),
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator());
                }
                final docs = snapshot.data?.docs.toList() ?? [];

                if (docs.isEmpty) {
                  return Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.event_available, color: Colors.white.withValues(alpha: 0.2), size: 48),
                        const SizedBox(height: 12),
                        Text(
                          'No upcoming meetings scheduled.',
                          style: TextStyle(color: Colors.white.withValues(alpha: 0.5), fontSize: 13),
                        ),
                      ],
                    ),
                  );
                }

                docs.sort((a, b) {
                  final dateA = (a.data() as Map<String, dynamic>)['scheduledAt'] as Timestamp?;
                  final dateB = (b.data() as Map<String, dynamic>)['scheduledAt'] as Timestamp?;
                  if (dateA == null || dateB == null) return 0;
                  return dateA.compareTo(dateB);
                });

                return ListView.separated(
                  padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 12),
                  itemCount: docs.length,
                  separatorBuilder: (context, index) => const SizedBox(height: 8),
                  itemBuilder: (context, index) {
                    final data = docs[index].data() as Map<String, dynamic>;
                    final date = data['scheduledAt'] != null ? (data['scheduledAt'] as Timestamp).toDate() : DateTime.now();
                    final title = data['title'] ?? 'Untitled Meeting';
                    final dept = data['department'] ?? 'General';
                    final isGuest = _currentUserProfile?.isGuest == true;

                    if (_searchQuery.isNotEmpty && !title.toLowerCase().contains(_searchQuery.toLowerCase())) {
                      return const SizedBox.shrink();
                    }

                    return Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: const Color(0xFF131722),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: Colors.white.withValues(alpha: 0.05)),
                      ),
                      child: Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                            decoration: BoxDecoration(
                              color: const Color(0xFF0E72ED).withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Column(
                              children: [
                                Text(
                                  DateFormat('MMM').format(date).toUpperCase(),
                                  style: const TextStyle(color: Color(0xFF0E72ED), fontWeight: FontWeight.bold, fontSize: 10),
                                ),
                                Text(
                                  DateFormat('dd').format(date),
                                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  title,
                                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14),
                                  overflow: TextOverflow.ellipsis,
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  "${DateFormat('hh:mm a').format(date)} • $dept",
                                  style: TextStyle(color: Colors.white.withValues(alpha: 0.5), fontSize: 12),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          Builder(builder: (ctx) {
                            final curUser = _firebaseService.currentUser;
                            final isSuper = isSuperAdminEmail(curUser?.email);
                            final mData = docs[index].data() as Map<String, dynamic>;
                            final hEmail = (mData['hostEmail'] ?? '').toString().trim().toLowerCase();
                            final hUid = (mData['hostUid'] ?? mData['hostId'] ?? '').toString();
                            final myE = (curUser?.email ?? '').trim().toLowerCase();
                            final myU = curUser?.uid ?? '';
                            final canDel = isSuper || (hEmail.isNotEmpty && hEmail == myE) || (hUid.isNotEmpty && hUid == myU);
                            if (canDel) {
                              return IconButton(
                                icon: const Icon(Icons.delete_outline, color: Colors.white38, size: 20),
                                onPressed: () => _confirmDelete(docs[index].id),
                              );
                            }
                            return const SizedBox.shrink();
                          }),
                          ElevatedButton(
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFF0E72ED),
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                            ),
                            onPressed: _showJoinMeetingDialog,
                            child: const Text('Join', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                          ),
                        ],
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHistoryCard() {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF1A202C),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.2),
            blurRadius: 14,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 20, vertical: 16),
            child: Row(
              children: [
                Icon(Icons.history_rounded, color: Colors.amberAccent, size: 20),
                SizedBox(width: 8),
                Text(
                  "Recent Meeting History",
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: Colors.white),
                ),
              ],
            ),
          ),
          const Divider(height: 1, color: Colors.white10),
          Expanded(
            child: StreamBuilder<QuerySnapshot>(
              stream: _firebaseService.getMeetingsStream(),
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (snapshot.hasError) {
                  return Center(child: Text('Error: ${snapshot.error}', style: const TextStyle(color: Colors.red)));
                }

                final meetings = snapshot.data?.docs ?? [];
                final pastMeetings = meetings.where((doc) {
                  final data = doc.data() as Map<String, dynamic>;
                  return data['status'] != 'scheduled';
                }).toList();

                if (pastMeetings.isEmpty) {
                  return Center(
                    child: Text('No meeting history found', style: TextStyle(color: Colors.white.withValues(alpha: 0.5))),
                  );
                }

                return ListView.separated(
                  padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 12),
                  itemCount: pastMeetings.length,
                  separatorBuilder: (context, index) => const SizedBox(height: 8),
                  itemBuilder: (context, index) {
                    final doc = pastMeetings[index];
                    final meeting = doc.data() as Map<String, dynamic>;
                    meeting['id'] = doc.id;
                    final title = meeting['title'] ?? 'Untitled Meeting';
                    final status = meeting['status'] ?? 'completed';

                    if (_searchQuery.isNotEmpty && !title.toLowerCase().contains(_searchQuery.toLowerCase())) {
                      return const SizedBox.shrink();
                    }

                    return InkWell(
                      onTap: () {
                        Navigator.of(context).push(
                          MaterialPageRoute(builder: (_) => MeetingDetailsScreen(meeting: meeting)),
                        );
                      },
                      borderRadius: BorderRadius.circular(12),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                        decoration: BoxDecoration(
                          color: const Color(0xFF131722),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: Colors.white.withValues(alpha: 0.05)),
                        ),
                        child: Row(
                          children: [
                            const CircleAvatar(
                              backgroundColor: Color(0xFF2C3240),
                              radius: 18,
                              child: Icon(Icons.event_note, color: Colors.amberAccent, size: 18),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    title,
                                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13),
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    'Status: $status',
                                    style: TextStyle(color: Colors.white.withValues(alpha: 0.5), fontSize: 11),
                                  ),
                                ],
                              ),
                            ),
                            IconButton(
                              icon: const Icon(Icons.picture_as_pdf, color: Colors.blueAccent, size: 20),
                              tooltip: 'Export PDF',
                              onPressed: () => _generatePdf(meeting),
                            ),
                            IconButton(
                              icon: const Icon(Icons.people_outline, color: Colors.white54, size: 20),
                              tooltip: 'Members',
                              onPressed: () => _showMembersDialog(meeting),
                            ),
                            Builder(builder: (ctx) {
                              final curUser = _firebaseService.currentUser;
                              final isSuper = isSuperAdminEmail(curUser?.email);
                              final hEmail = (meeting['hostEmail'] ?? '').toString().trim().toLowerCase();
                              final hUid = (meeting['hostUid'] ?? meeting['hostId'] ?? '').toString();
                              final myE = (curUser?.email ?? '').trim().toLowerCase();
                              final myU = curUser?.uid ?? '';
                              final canDel = isSuper || (hEmail.isNotEmpty && hEmail == myE) || (hUid.isNotEmpty && hUid == myU);
                              if (canDel) {
                                return IconButton(
                                  icon: const Icon(Icons.delete_outline, color: Colors.redAccent, size: 20),
                                  tooltip: 'Delete',
                                  onPressed: () => _confirmDelete(doc.id),
                                );
                              }
                              return const SizedBox.shrink();
                            }),
                          ],
                        ),
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final user = _firebaseService.currentUser;
    final isSuperAdmin = isSuperAdminEmail(user?.email);
    final isAdmin = isSuperAdmin || (_currentUserProfile?.isAdmin ?? false);
    final userName = user?.displayName ?? user?.email?.split('@')[0] ?? '';

    return Scaffold(
      backgroundColor: const Color(0xFF0F121C),
      body: SafeArea(
        child: Column(
          children: [
            // --- TOP NAVIGATION HEADER (Zoom Desktop Style) ---
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
              decoration: BoxDecoration(
                color: const Color(0xFF171B26),
                border: Border(bottom: BorderSide(color: Colors.white.withValues(alpha: 0.08))),
              ),
              child: Row(
                children: [
                  // Logo
                  Image.asset(
                    'assets/images/connect_horizontal.png',
                    height: 28,
                    errorBuilder: (context, error, stackTrace) => const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.videocam_rounded, color: Color(0xFF0E72ED), size: 24),
                        SizedBox(width: 8),
                        Text('MINUTES MAKER', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15)),
                      ],
                    ),
                  ),
                  const SizedBox(width: 32),

                  // Center Nav Tabs: Home for all; Meetings & Reports for Admin only
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      _buildNavTab(index: 0, label: 'Home', icon: Icons.home_rounded),
                      const SizedBox(width: 8),
                      _buildNavTab(index: 1, label: 'Meetings', icon: Icons.calendar_month_rounded),
                      const SizedBox(width: 8),
                      _buildNavTab(index: 2, label: 'Reports', icon: Icons.description_rounded),
                    ],
                  ),

                  const Spacer(),

                  // Search Bar
                  Container(
                    width: 220,
                    height: 36,
                    margin: const EdgeInsets.only(right: 16),
                    child: TextField(
                      controller: _searchController,
                      style: const TextStyle(color: Colors.white, fontSize: 12),
                      onChanged: (val) => setState(() => _searchQuery = val.trim()),
                      decoration: InputDecoration(
                        hintText: 'Search...',
                        hintStyle: TextStyle(color: Colors.white.withValues(alpha: 0.4), fontSize: 12),
                        prefixIcon: const Icon(Icons.search, color: Colors.white38, size: 16),
                        filled: true,
                        fillColor: const Color(0xFF0F121C),
                        contentPadding: EdgeInsets.zero,
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(20), borderSide: BorderSide.none),
                      ),
                    ),
                  ),

                  // Admin Portal Button if Admin
                  if (isAdmin)
                    Padding(
                      padding: const EdgeInsets.only(right: 12),
                      child: ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF0E72ED),
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        ),
                        icon: const Icon(Icons.admin_panel_settings, size: 16),
                        label: const Text('Admin Portal', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                        onPressed: () {
                          Navigator.of(context).pushReplacement(
                            MaterialPageRoute(builder: (_) => const AdminDashboardScreen()),
                          );
                        },
                      ),
                    ),

                  // User Avatar Menu (Image 3 Zoom Style)
                  PopupMenuButton<String>(
                    offset: const Offset(0, 45),
                    color: const Color(0xFF1E222D),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    onSelected: (val) async {
                      if (val == 'signout') {
                        await _firebaseService.signOut();
                      } else if (val == 'admin') {
                        Navigator.of(context).push(MaterialPageRoute(builder: (_) => const AdminDashboardScreen()));
                      } else if (val == 'reports') {
                        Navigator.of(context).push(MaterialPageRoute(builder: (_) => const DownloadReportsScreen()));
                      }
                    },
                    itemBuilder: (context) => [
                      PopupMenuItem(
                        enabled: false,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(userName.isNotEmpty ? userName : 'Member', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                            Text(user?.email ?? '', style: TextStyle(color: Colors.white.withValues(alpha: 0.6), fontSize: 11)),
                            const Divider(color: Colors.white12),
                          ],
                        ),
                      ),
                      const PopupMenuItem(
                        value: 'available',
                        child: Row(
                          children: [
                            CircleAvatar(radius: 4, backgroundColor: Colors.greenAccent),
                            SizedBox(width: 8),
                            Text('Available', style: TextStyle(color: Colors.white, fontSize: 13)),
                          ],
                        ),
                      ),
                      if (isSuperAdmin)
                        const PopupMenuItem(
                          value: 'admin',
                          child: Row(
                            children: [
                              Icon(Icons.admin_panel_settings, color: Colors.amber, size: 16),
                              SizedBox(width: 8),
                              Text('Admin Portal', style: TextStyle(color: Colors.white, fontSize: 13)),
                            ],
                          ),
                        ),
                      const PopupMenuItem(
                        value: 'reports',
                        child: Row(
                          children: [
                            Icon(Icons.download, color: Colors.blueAccent, size: 16),
                            SizedBox(width: 8),
                            Text('Download Reports', style: TextStyle(color: Colors.white, fontSize: 13)),
                          ],
                        ),
                      ),
                      const PopupMenuDivider(),
                      const PopupMenuItem(
                        value: 'signout',
                        child: Row(
                          children: [
                            Icon(Icons.logout, color: Colors.redAccent, size: 16),
                            SizedBox(width: 8),
                            Text('Sign Out', style: TextStyle(color: Colors.redAccent, fontSize: 13)),
                          ],
                        ),
                      ),
                    ],
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        CircleAvatar(
                          radius: 16,
                          backgroundColor: const Color(0xFF0E72ED),
                          child: Text(
                            userName.isNotEmpty ? userName[0].toUpperCase() : 'U',
                            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14),
                          ),
                        ),
                        const SizedBox(width: 4),
                        const Icon(Icons.arrow_drop_down, color: Colors.white54, size: 18),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            // --- MAIN DASHBOARD CONTENT ---
            Expanded(
              child: _selectedNavTab == 1
                  ? Padding(
                      padding: const EdgeInsets.all(24.0),
                      child: Row(
                        children: [
                          Expanded(child: _buildUpcomingCard()),
                          const SizedBox(width: 24),
                          Expanded(child: _buildHistoryCard()),
                        ],
                      ),
                    )
                  : _selectedNavTab == 2
                      ? const DownloadReportsScreen()
                      : LayoutBuilder(
                          builder: (context, constraints) {
                            final isWide = constraints.maxWidth >= 900;
                            return Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 24),
                              child: isWide
                                  ? Row(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        // Left Side: 4 Iconic Zoom Action Buttons in 2x2 Grid
                                        SizedBox(
                                          width: 380,
                                          child: Column(
                                            children: [
                                              const SizedBox(height: 16),
                                              Row(
                                                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                                                children: [
                                                  _buildZoomActionCard(
                                                    icon: Icons.videocam_rounded,
                                                    label: 'New Meeting',
                                                    gradientColors: [const Color(0xFFFF7A00), const Color(0xFFFF5400)],
                                                    glowColor: const Color(0xFFFF7A00),
                                                    onTap: _startNewMeeting,
                                                  ),
                                                  _buildZoomActionCard(
                                                    icon: Icons.add_box_rounded,
                                                    label: 'Join',
                                                    gradientColors: [const Color(0xFF0E72ED), const Color(0xFF0056D2)],
                                                    glowColor: const Color(0xFF0E72ED),
                                                    onTap: _showJoinMeetingDialog,
                                                  ),
                                                ],
                                              ),
                                              const SizedBox(height: 28),
                                              Row(
                                                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                                                children: [
                                                  _buildZoomActionCard(
                                                    icon: Icons.calendar_today_rounded,
                                                    label: 'Schedule',
                                                    gradientColors: [const Color(0xFF2D8CFF), const Color(0xFF1B6BD8)],
                                                    glowColor: const Color(0xFF2D8CFF),
                                                    onTap: _scheduleMeeting,
                                                    badgeText: DateFormat('d').format(DateTime.now()),
                                                  ),
                                                  _buildZoomActionCard(
                                                    icon: Icons.arrow_upward_rounded,
                                                    label: 'Share Screen',
                                                    gradientColors: [const Color(0xFF00B4D8), const Color(0xFF0077B6)],
                                                    glowColor: const Color(0xFF00B4D8),
                                                    onTap: _showJoinMeetingDialog,
                                                  ),
                                                ],
                                              ),
                                            ],
                                          ),
                                        ),

                                        const SizedBox(width: 32),

                                        // Right Side: Live Clock Widget + Upcoming Meetings
                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment: CrossAxisAlignment.stretch,
                                            children: [
                                              LiveClock(userName: userName),
                                              const SizedBox(height: 20),
                                              Expanded(child: _buildUpcomingCard()),
                                            ],
                                          ),
                                        ),
                                      ],
                                    )
                                  : SingleChildScrollView(
                                      child: Column(
                                        children: [
                                          LiveClock(userName: userName),
                                          const SizedBox(height: 24),
                                          Wrap(
                                            spacing: 24,
                                            runSpacing: 20,
                                            alignment: WrapAlignment.center,
                                            children: [
                                              _buildZoomActionCard(
                                                icon: Icons.videocam_rounded,
                                                label: 'New Meeting',
                                                gradientColors: [const Color(0xFFFF7A00), const Color(0xFFFF5400)],
                                                glowColor: const Color(0xFFFF7A00),
                                                onTap: _startNewMeeting,
                                              ),
                                              _buildZoomActionCard(
                                                icon: Icons.add_box_rounded,
                                                label: 'Join',
                                                gradientColors: [const Color(0xFF0E72ED), const Color(0xFF0056D2)],
                                                glowColor: const Color(0xFF0E72ED),
                                                onTap: _showJoinMeetingDialog,
                                              ),
                                              _buildZoomActionCard(
                                                icon: Icons.calendar_today_rounded,
                                                label: 'Schedule',
                                                gradientColors: [const Color(0xFF2D8CFF), const Color(0xFF1B6BD8)],
                                                glowColor: const Color(0xFF2D8CFF),
                                                onTap: _scheduleMeeting,
                                                badgeText: DateFormat('d').format(DateTime.now()),
                                              ),
                                              _buildZoomActionCard(
                                                icon: Icons.arrow_upward_rounded,
                                                label: 'Share Screen',
                                                gradientColors: [const Color(0xFF00B4D8), const Color(0xFF0077B6)],
                                                glowColor: const Color(0xFF00B4D8),
                                                onTap: _showJoinMeetingDialog,
                                              ),
                                            ],
                                          ),
                                          const SizedBox(height: 24),
                                          SizedBox(height: 380, child: _buildUpcomingCard()),
                                        ],
                                      ),
                                    ),
                            );
                          },
                        ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildNavTab({required int index, required String label, required IconData icon}) {
    final isSelected = _selectedNavTab == index;
    return InkWell(
      onTap: () => setState(() => _selectedNavTab = index),
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected ? const Color(0xFF0E72ED).withValues(alpha: 0.15) : Colors.transparent,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(
          children: [
            Icon(
              icon,
              size: 16,
              color: isSelected ? const Color(0xFF0E72ED) : Colors.white60,
            ),
            const SizedBox(width: 6),
            Text(
              label,
              style: TextStyle(
                color: isSelected ? Colors.white : Colors.white60,
                fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
                fontSize: 13,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// Widget that provides micro-animation scaling on mouse hover
class _HoverScaleButton extends StatefulWidget {
  final Widget child;
  final VoidCallback onTap;

  const _HoverScaleButton({required this.child, required this.onTap});

  @override
  State<_HoverScaleButton> createState() => _HoverScaleButtonState();
}

class _HoverScaleButtonState extends State<_HoverScaleButton> {
  bool _isHovered = false;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      onEnter: (_) => setState(() => _isHovered = true),
      onExit: (_) => setState(() => _isHovered = false),
      cursor: SystemMouseCursors.click,
      child: GestureDetector(
        onTap: widget.onTap,
        child: AnimatedScale(
          scale: _isHovered ? 1.08 : 1.0,
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOutCubic,
          child: widget.child,
        ),
      ),
    );
  }
}
