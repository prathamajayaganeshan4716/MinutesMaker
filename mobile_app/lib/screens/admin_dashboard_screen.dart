import '../config/super_admin.dart';
import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../services/firebase_service.dart';
import '../models/app_models.dart';
import '../utils/pdf_generator.dart';
import 'dashboard_screen.dart';

class AdminDashboardScreen extends StatefulWidget {
  final bool hideAppBar;
  const AdminDashboardScreen({super.key, this.hideAppBar = false});

  @override
  State<AdminDashboardScreen> createState() => _AdminDashboardScreenState();
}

class _AdminDashboardScreenState extends State<AdminDashboardScreen> with SingleTickerProviderStateMixin {
  final FirebaseService _firebaseService = FirebaseService();
  late TabController _tabController;
  int _boardSubTab = 0; // 0: Board Members Directory (with Teams & Heads), 1: Teams & Departments
  List<String> _cachedDepts = [];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _loadDepartments();
  }

  void _loadDepartments() async {
    final list = await _firebaseService.getDepartmentsList();
    if (mounted) {
      setState(() {
        _cachedDepts = list;
      });
    }
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  // --- Dialogs ---

  void _showAddDepartmentDialog() {
    final deptCtrl = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Row(
          children: const [
            Icon(Icons.corporate_fare, color: Color(0xFF640D14)),
            SizedBox(width: 8),
            Text('Add Team / Department', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Enter the name of the new department or team:', style: TextStyle(fontSize: 13, color: Colors.black54)),
            const SizedBox(height: 12),
            TextField(
              controller: deptCtrl,
              autofocus: true,
              decoration: const InputDecoration(
                labelText: 'Team / Department Name',
                hintText: 'e.g. AI & Innovation, Design Team',
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF640D14), foregroundColor: Colors.white),
            onPressed: () async {
              final name = deptCtrl.text.trim();
              if (name.isNotEmpty) {
                await _firebaseService.addDepartment(name);
                if (mounted) {
                  Navigator.pop(ctx);
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Team "$name" added successfully!')),
                  );
                }
              }
            },
            child: const Text('Add Team'),
          ),
        ],
      ),
    );
  }

  void _confirmDeleteDepartment(String docId, String deptName) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text('Delete Team / Department', style: TextStyle(fontWeight: FontWeight.bold, color: Colors.red)),
        content: Text('Are you sure you want to delete the "$deptName" department? Existing members can be reassigned.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red, foregroundColor: Colors.white),
            onPressed: () async {
              await _firebaseService.deleteDepartment(docId);
              if (mounted) {
                Navigator.pop(ctx);
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('Department "$deptName" deleted.')),
                );
              }
            },
            child: const Text('Delete'),
          ),
        ],
      ),
    );
  }

  Future<void> _showAddEditBoardMemberDialog({BoardMember? member, String? initialDept, List<String>? availableDepts}) async {
    final nameCtrl = TextEditingController(text: member?.name ?? '');
    final emailCtrl = TextEditingController(text: member?.email ?? '');
    final rollCtrl = TextEditingController(text: member?.rollNumber ?? '');
    final positionCtrl = TextEditingController(text: member?.position ?? '');
    bool isHead = member?.isHead ?? false;
    
    List<String> depts = [];
    if (availableDepts != null && availableDepts.isNotEmpty) {
      depts = List<String>.from(availableDepts);
    } else if (_cachedDepts.isNotEmpty) {
      depts = List<String>.from(_cachedDepts);
    } else {
      depts = await _firebaseService.getDepartmentsList();
    }
    if (depts.isEmpty) {
      depts = List<String>.from(FirebaseService.defaultDepartmentsList);
    }
    if (member != null && member.department.isNotEmpty && !depts.contains(member.department)) {
      depts.insert(0, member.department);
    }
    if (initialDept != null && initialDept.isNotEmpty && !depts.contains(initialDept)) {
      depts.insert(0, initialDept);
    }
    depts = depts.toSet().toList();

    String selectedDept = member?.department ?? initialDept ?? (depts.isNotEmpty ? depts.first : 'General');
    if (!depts.contains(selectedDept)) {
      selectedDept = depts.first;
    }

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          title: Row(
            children: [
              Icon(member == null ? Icons.person_add : Icons.edit, color: const Color(0xFF640D14)),
              const SizedBox(width: 8),
              Text(member == null ? 'Add Board Member' : 'Edit Board Member', style: const TextStyle(fontWeight: FontWeight.bold)),
            ],
          ),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: nameCtrl,
                  decoration: const InputDecoration(labelText: 'Full Name *', hintText: 'e.g. Mr. Sam Michael', border: OutlineInputBorder()),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: positionCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Position / Designation *',
                    hintText: 'e.g. CEO - Matrix Student Association, Lead, Secretary',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: emailCtrl,
                  decoration: const InputDecoration(labelText: 'Email Address *', hintText: 'e.g. sam@matrix.org', border: OutlineInputBorder()),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: rollCtrl,
                  decoration: const InputDecoration(labelText: 'Roll Number / Member ID', hintText: 'e.g. CS2026-042', border: OutlineInputBorder()),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  value: depts.contains(selectedDept) ? selectedDept : (depts.isNotEmpty ? depts.first : null),
                  decoration: const InputDecoration(labelText: 'Team / Department *', border: OutlineInputBorder()),
                  items: depts.map((dept) => DropdownMenuItem(value: dept, child: Text(dept))).toList(),
                  onChanged: (val) {
                    if (val != null) setDialogState(() => selectedDept = val);
                  },
                ),
                const SizedBox(height: 12),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Designate as Team Head', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                  subtitle: const Text('Mark this member as the lead/head of this team', style: TextStyle(fontSize: 12, color: Colors.grey)),
                  value: isHead,
                  activeColor: const Color(0xFF640D14),
                  onChanged: (val) {
                    setDialogState(() => isHead = val);
                  },
                ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF640D14), foregroundColor: Colors.white),
              onPressed: () async {
                final name = nameCtrl.text.trim();
                final email = emailCtrl.text.trim();
                final roll = rollCtrl.text.trim();
                final position = positionCtrl.text.trim();
                if (name.isEmpty || email.isEmpty) {
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Name and Email are required!')));
                  return;
                }

                final Map<String, dynamic> data = {
                  'name': name,
                  'email': email,
                  'rollNumber': roll,
                  'department': selectedDept,
                  'position': position,
                  'isHead': isHead,
                };

                if (member == null) {
                  await _firebaseService.addBoardMember(data);
                } else {
                  await _firebaseService.updateBoardMember(member.id, data);
                }

                if (mounted) {
                  Navigator.pop(ctx);
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text(member == null ? 'Member added successfully!' : 'Member details updated!')),
                  );
                }
              },
              child: Text(member == null ? 'Add Member' : 'Save Changes'),
            ),
          ],
        ),
      ),
    );
  }

  void _showAddAdminDialog() {
    final emailCtrl = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Row(
          children: const [
            Icon(Icons.shield, color: Color(0xFF640D14)),
            SizedBox(width: 8),
            Text('Add Admin Access', style: TextStyle(fontWeight: FontWeight.bold)),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Enter the email address of the user to grant full Admin permissions.', style: TextStyle(fontSize: 13, color: Colors.black54)),
            const SizedBox(height: 12),
            TextField(
              controller: emailCtrl,
              autofocus: true,
              decoration: const InputDecoration(labelText: 'Admin Email', hintText: 'admin@minutesmaker.org', border: OutlineInputBorder()),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF640D14), foregroundColor: Colors.white),
            onPressed: () async {
              final email = emailCtrl.text.trim();
              if (email.isNotEmpty) {
                await _firebaseService.promoteUserToAdmin(email);
                if (mounted) {
                  Navigator.pop(ctx);
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Admin access granted to $email')),
                  );
                }
              }
            },
            child: const Text('Grant Admin'),
          ),
        ],
      ),
    );
  }

  void _confirmDemoteAdmin(String docId, String email) {
    if (isSuperAdminEmail(email)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Primary Super Admin cannot be removed.')),
      );
      return;
    }

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text('Remove Admin Access', style: TextStyle(fontWeight: FontWeight.bold, color: Colors.red)),
        content: Text('Are you sure you want to revoke admin privileges for $email?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red, foregroundColor: Colors.white),
            onPressed: () async {
              try {
                await _firebaseService.demoteAdminToMember(docId, email);
                if (mounted) {
                  Navigator.pop(ctx);
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Admin access revoked for $email')),
                  );
                }
              } catch (e) {
                if (mounted) {
                  Navigator.pop(ctx);
                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
                }
              }
            },
            child: const Text('Revoke'),
          ),
        ],
      ),
    );
  }

  Widget _buildFloatingActionButton(Color maroonColor) {
    final isCurrentSuperAdmin = isSuperAdminEmail(_firebaseService.currentUser?.email);
    if (!isCurrentSuperAdmin) return const SizedBox.shrink();
    return AnimatedBuilder(
      animation: _tabController,
      builder: (context, _) {
        if (_tabController.index == 0) {
          if (_boardSubTab == 1) {
            return FloatingActionButton.extended(
              onPressed: _showAddDepartmentDialog,
              backgroundColor: maroonColor,
              icon: const Icon(Icons.add_business, color: Colors.white),
              label: const Text('Add Team / Department', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
            );
          } else {
            return FloatingActionButton.extended(
              onPressed: () => _showAddEditBoardMemberDialog(availableDepts: _cachedDepts),
              backgroundColor: maroonColor,
              icon: const Icon(Icons.person_add, color: Colors.white),
              label: const Text('Add Board Member', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
            );
          }
        } else if (_tabController.index == 1) {
          return FloatingActionButton.extended(
            onPressed: _showAddAdminDialog,
            backgroundColor: maroonColor,
            icon: const Icon(Icons.security, color: Colors.white),
            label: const Text('Add Admin', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
          );
        }
        return const SizedBox.shrink();
      },
    );
  }

  // --- UNIFIED TAB: Board Members Directory & Teams ---

  Widget _buildUnifiedBoardAndTeamsTab(Color maroonColor) {
    return Column(
      children: [
        Container(
          color: Colors.white,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child: Container(
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(
              color: const Color(0xFFF3F4F6),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: Colors.grey.shade300),
            ),
            child: Row(
              children: [
                _buildSubTabItem(0, 'Board Members Directory', Icons.groups, maroonColor),
                const SizedBox(width: 6),
                _buildSubTabItem(1, 'Teams & Departments', Icons.corporate_fare, maroonColor),
              ],
            ),
          ),
        ),
        Expanded(
          child: IndexedStack(
            index: _boardSubTab,
            children: [
              _buildBoardMembersTab(maroonColor),
              _buildTeamsTab(maroonColor),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildSubTabItem(int index, String title, IconData icon, Color activeColor) {
    final isSelected = _boardSubTab == index;
    return Expanded(
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: () {
            setState(() {
              _boardSubTab = index;
            });
          },
          borderRadius: BorderRadius.circular(8),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 150),
            padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 8),
            decoration: BoxDecoration(
              color: isSelected ? activeColor : Colors.transparent,
              borderRadius: BorderRadius.circular(8),
              boxShadow: isSelected
                  ? [
                      BoxShadow(
                        color: activeColor.withValues(alpha: 0.25),
                        blurRadius: 4,
                        offset: const Offset(0, 2),
                      ),
                    ]
                  : null,
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  icon,
                  size: 16,
                  color: isSelected ? Colors.white : Colors.black87,
                ),
                const SizedBox(width: 6),
                Flexible(
                  child: Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
                      color: isSelected ? Colors.white : Colors.black87,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    const maroonColor = Color(0xFF640D14);

    final innerTabBar = TabBar(
      controller: _tabController,
      labelColor: maroonColor,
      unselectedLabelColor: Colors.black54,
      indicatorColor: maroonColor,
      isScrollable: true,
      tabs: const [
        Tab(icon: Icon(Icons.groups), text: 'Board Members & Teams'),
        Tab(icon: Icon(Icons.admin_panel_settings), text: 'Admins'),
        Tab(icon: Icon(Icons.article), text: 'Meeting Records'),
      ],
    );

    final tabBarView = TabBarView(
      controller: _tabController,
      children: [
        _buildUnifiedBoardAndTeamsTab(maroonColor),
        _buildAdminsTab(maroonColor),
        _buildMeetingRecordsTab(maroonColor),
      ],
    );

    if (widget.hideAppBar) {
      return Scaffold(
        backgroundColor: const Color(0xFFF9F9FB),
        body: Column(
          children: [
            innerTabBar,
            Expanded(child: tabBarView),
          ],
        ),
        floatingActionButton: _buildFloatingActionButton(maroonColor),
      );
    }

    return Scaffold(
      backgroundColor: const Color(0xFFF9F9FB),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 1,
        title: Row(
          children: [
            Image.asset(
              'assets/images/connect_horizontal.png',
              height: 28,
              errorBuilder: (context, error, stackTrace) => const Text('MINUTES MAKER', style: TextStyle(fontWeight: FontWeight.bold, color: Color(0xFF0F3B66))),
            ),
            const SizedBox(width: 10),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(color: maroonColor.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(6)),
              child: const Text('Admin Portal', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: maroonColor)),
            )
          ],
        ),
        actions: [
          // Button to switch seamlessly to Meeting Dashboard
          ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF0F3B66),
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
            icon: const Icon(Icons.dashboard, size: 16),
            label: const Text('Meeting Hub', style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
            onPressed: () {
              Navigator.of(context).pushReplacement(
                MaterialPageRoute(builder: (_) => const DashboardScreen()),
              );
            },
          ),
          const SizedBox(width: 8),
          IconButton(
            icon: const Icon(Icons.logout, color: maroonColor),
            tooltip: 'Sign Out',
            onPressed: () async => await _firebaseService.signOut(),
          ),
          const SizedBox(width: 8),
        ],
        bottom: innerTabBar,
      ),
      body: tabBarView,
      floatingActionButton: _buildFloatingActionButton(maroonColor),
    );
  }

  // --- TAB 1: Teams & Departments Management ---

  Widget _buildTeamsTab(Color maroonColor) {
    return StreamBuilder<QuerySnapshot>(
      stream: _firebaseService.getDepartmentsStream(),
      builder: (context, deptSnapshot) {
        if (deptSnapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }

        final deptDocs = deptSnapshot.data?.docs ?? [];
        List<String> depts = deptDocs.map((d) => (d.data() as Map<String, dynamic>)['name']?.toString() ?? '').where((s) => s.isNotEmpty).toList();
        if (depts.isNotEmpty) _cachedDepts = depts;

        return StreamBuilder<QuerySnapshot>(
          stream: _firebaseService.getBoardMembersStream(),
          builder: (context, memberSnapshot) {
            final memberDocs = memberSnapshot.data?.docs ?? [];
            final members = memberDocs.map((d) => BoardMember.fromMap(d.data() as Map<String, dynamic>, d.id)).toList();

            return ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(colors: [Color(0xFF0F3B66), Color(0xFF1E3A8A)]),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.schema_rounded, color: Colors.white, size: 36),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Teams & Organizational Units', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                            Text('${depts.length} teams configured • ${members.length} total members', style: const TextStyle(color: Colors.white70, fontSize: 13)),
                          ],
                        ),
                      ),
                      ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(backgroundColor: Colors.white, foregroundColor: const Color(0xFF0F3B66)),
                        icon: const Icon(Icons.add, size: 18),
                        label: const Text('Add Team', style: TextStyle(fontWeight: FontWeight.bold)),
                        onPressed: _showAddDepartmentDialog,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                if (deptDocs.isEmpty)
                  Center(
                    child: Padding(
                      padding: const EdgeInsets.all(32.0),
                      child: Column(
                        children: [
                          Icon(Icons.business, size: 64, color: Colors.grey.shade400),
                          const SizedBox(height: 16),
                          const Text('No teams or departments found.', style: TextStyle(fontSize: 16, color: Colors.black54)),
                          const SizedBox(height: 8),
                          TextButton.icon(
                            onPressed: _showAddDepartmentDialog,
                            icon: const Icon(Icons.add),
                            label: const Text('Create your first team'),
                            style: TextButton.styleFrom(foregroundColor: const Color(0xFF0F3B66)),
                          )
                        ],
                      ),
                    ),
                  )
                else
                  ...deptDocs.map((doc) {
                    final data = doc.data() as Map<String, dynamic>;
                    final deptName = data['name'] ?? 'Untitled';
                    final deptMembers = members.where((m) => m.department == deptName).toList();

                    return Card(
                      margin: const EdgeInsets.only(bottom: 12),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      child: ListTile(
                        leading: CircleAvatar(
                          backgroundColor: maroonColor.withOpacity(0.1),
                          child: Text('${deptMembers.length}', style: TextStyle(fontWeight: FontWeight.bold, color: maroonColor)),
                        ),
                        title: Text(deptName, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                        subtitle: Text('${deptMembers.length} Members in this team'),
                        trailing: isSuperAdminEmail(_firebaseService.currentUser?.email)
                            ? Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  IconButton(
                                    icon: const Icon(Icons.person_add_alt_1, color: Color(0xFF0F3B66)),
                                    tooltip: 'Add member to this team',
                                    onPressed: () => _showAddEditBoardMemberDialog(initialDept: deptName, availableDepts: depts),
                                  ),
                                  IconButton(
                                    icon: const Icon(Icons.delete_outline, color: Colors.red),
                                    tooltip: 'Delete team',
                                    onPressed: () => _confirmDeleteDepartment(doc.id, deptName),
                                  ),
                                ],
                              )
                            : null,
                      ),
                    );
                  }).toList(),
              ],
            );
          },
        );
      },
    );
  }

  // --- TAB 2: Board Members Directory (with Teams & Heads) ---

  Widget _buildBoardMembersTab(Color maroonColor) {
    return StreamBuilder<QuerySnapshot>(
      stream: _firebaseService.getDepartmentsStream(),
      builder: (context, deptSnapshot) {
        final deptDocs = deptSnapshot.data?.docs ?? [];
        List<String> depts = deptDocs
            .map((d) => (d.data() as Map<String, dynamic>)['name']?.toString() ?? '')
            .where((s) => s.isNotEmpty)
            .toList();
        if (depts.isNotEmpty) _cachedDepts = depts;

        return StreamBuilder<QuerySnapshot>(
          stream: _firebaseService.getBoardMembersStream(),
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }

            final docs = snapshot.data?.docs ?? [];
            final members = docs
                .map((d) => BoardMember.fromMap(d.data() as Map<String, dynamic>, d.id))
                .toList();

            // Group by Team / Department
            final Map<String, List<BoardMember>> grouped = {};
            for (var dept in depts) {
              grouped[dept] = [];
            }
            for (var m in members) {
              final deptKey = depts.contains(m.department)
                  ? m.department
                  : (depts.isNotEmpty ? depts.first : 'Unassigned');
              if (!grouped.containsKey(deptKey)) grouped[deptKey] = [];
              grouped[deptKey]!.add(m);
            }

            final totalHeads = members.where((m) => m.isHead).length;

            return ListView(
              padding: const EdgeInsets.all(16),
              children: [
                // Top Info Header Card
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [Color(0xFF640D14), Color(0xFF250902)],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(16),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.12),
                        blurRadius: 10,
                        offset: const Offset(0, 4),
                      )
                    ],
                  ),
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.15),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(Icons.groups, color: Colors.white, size: 32),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Board Members Directory',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 20,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              'Total Board Strength: ${members.length} Members • $totalHeads Team Heads Appointed',
                              style: const TextStyle(color: Colors.white70, fontSize: 13),
                            ),
                          ],
                        ),
                      ),
                      ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.white,
                          foregroundColor: maroonColor,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        ),
                        icon: const Icon(Icons.person_add, size: 18),
                        label: const Text('Add Member', style: TextStyle(fontWeight: FontWeight.bold)),
                        onPressed: () => _showAddEditBoardMemberDialog(availableDepts: depts),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 20),

                if (grouped.isEmpty && members.isEmpty)
                  Center(
                    child: Padding(
                      padding: const EdgeInsets.all(32.0),
                      child: Column(
                        children: [
                          Icon(Icons.people_outline, size: 64, color: Colors.grey.shade400),
                          const SizedBox(height: 16),
                          const Text('No teams or members configured yet.', style: TextStyle(fontSize: 16, color: Colors.black54)),
                        ],
                      ),
                    ),
                  )
                else
                  ...grouped.entries.map((entry) {
                    final deptName = entry.key;
                    final teamMembers = entry.value;

                    // Clean formatted title (e.g. avoid 'Technical Team Team')
                    final displayTeamName = deptName.toLowerCase().endsWith('team') ? deptName : '$deptName Team';

                    // Identify the Team Head
                    final headMember = teamMembers.where((m) => m.isHead).firstOrNull;
                    final otherMembers = teamMembers.where((m) => !m.isHead).toList();

                    return Card(
                      margin: const EdgeInsets.only(bottom: 16),
                      elevation: 2,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                        side: BorderSide(color: Colors.grey.shade200),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.all(16.0),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            // Team Header Bar
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Row(
                                  children: [
                                    Container(
                                      padding: const EdgeInsets.all(8),
                                      decoration: BoxDecoration(
                                        color: maroonColor.withValues(alpha: 0.08),
                                        borderRadius: BorderRadius.circular(8),
                                      ),
                                      child: Icon(Icons.corporate_fare, color: maroonColor, size: 20),
                                    ),
                                    const SizedBox(width: 10),
                                    Text(
                                      displayTeamName,
                                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18, color: Colors.black87),
                                    ),
                                    const SizedBox(width: 8),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                      decoration: BoxDecoration(
                                        color: Colors.grey.shade200,
                                        borderRadius: BorderRadius.circular(12),
                                      ),
                                      child: Text(
                                        '${teamMembers.length} Members',
                                        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.black54),
                                      ),
                                    ),
                                  ],
                                ),
                                IconButton(
                                  icon: const Icon(Icons.person_add_alt_1, color: Color(0xFF640D14)),
                                  tooltip: 'Add member to $deptName',
                                  onPressed: () => _showAddEditBoardMemberDialog(initialDept: deptName, availableDepts: depts),
                                ),
                              ],
                            ),
                            const Divider(height: 24),

                            // --- PROMINENT TEAM HEAD SECTION ---
                            Container(
                              padding: const EdgeInsets.all(14),
                              decoration: BoxDecoration(
                                gradient: LinearGradient(
                                  colors: headMember != null
                                      ? [maroonColor.withValues(alpha: 0.08), const Color(0xFF800E13).withValues(alpha: 0.04)]
                                      : [Colors.grey.shade100, Colors.grey.shade50],
                                ),
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(
                                  color: headMember != null ? maroonColor.withValues(alpha: 0.3) : Colors.grey.shade300,
                                  width: headMember != null ? 1.5 : 1,
                                ),
                              ),
                              child: Row(
                                children: [
                                  CircleAvatar(
                                    radius: 24,
                                    backgroundColor: headMember != null ? maroonColor : Colors.grey.shade400,
                                    child: Icon(
                                      headMember != null ? Icons.workspace_premium : Icons.person_outline,
                                      color: Colors.white,
                                      size: 24,
                                    ),
                                  ),
                                  const SizedBox(width: 14),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Row(
                                          children: [
                                            Container(
                                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                              decoration: BoxDecoration(
                                                color: headMember != null ? maroonColor : Colors.grey.shade600,
                                                borderRadius: BorderRadius.circular(4),
                                              ),
                                              child: const Text(
                                                'TEAM HEAD',
                                                style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 0.5),
                                              ),
                                            ),
                                            const SizedBox(width: 8),
                                            Expanded(
                                              child: Text(
                                                headMember != null ? headMember.name : 'No Head Assigned',
                                                style: TextStyle(
                                                  fontWeight: FontWeight.bold,
                                                  fontSize: 16,
                                                  color: headMember != null ? Colors.black87 : Colors.grey.shade600,
                                                ),
                                                overflow: TextOverflow.ellipsis,
                                              ),
                                            ),
                                          ],
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          headMember != null
                                              ? (headMember.position.isNotEmpty ? headMember.position : 'Head of Department')
                                              : 'Assign a team head using Edit or Add Member',
                                          style: TextStyle(
                                            fontSize: 13,
                                            fontWeight: FontWeight.w600,
                                            color: headMember != null ? maroonColor : Colors.grey.shade500,
                                          ),
                                        ),
                                        if (headMember != null && isSuperAdminEmail(_firebaseService.currentUser?.email)) ...[
                                          const SizedBox(height: 2),
                                          Text(
                                            '${headMember.email} • Roll: ${headMember.rollNumber.isNotEmpty ? headMember.rollNumber : 'N/A'}',
                                            style: const TextStyle(fontSize: 12, color: Colors.black54),
                                          ),
                                        ],
                                      ],
                                    ),
                                  ),
                                  if (headMember != null) ...[
                                    IconButton(
                                      icon: const Icon(Icons.edit, color: Colors.blue, size: 20),
                                      tooltip: 'Edit Head Details',
                                      onPressed: () => _showAddEditBoardMemberDialog(member: headMember, availableDepts: depts),
                                    ),
                                    IconButton(
                                      icon: const Icon(Icons.delete_outline, color: Colors.red, size: 20),
                                      tooltip: 'Delete Member',
                                      onPressed: () async {
                                        await _firebaseService.deleteBoardMember(headMember.id);
                                        if (mounted) {
                                          ScaffoldMessenger.of(context).showSnackBar(
                                            SnackBar(content: Text('Member "${headMember.name}" removed.')),
                                          );
                                        }
                                      },
                                    ),
                                  ] else if (isSuperAdminEmail(_firebaseService.currentUser?.email))
                                    TextButton.icon(
                                      icon: const Icon(Icons.person_add, size: 16),
                                      label: const Text('Assign Head', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                                      style: TextButton.styleFrom(foregroundColor: maroonColor),
                                      onPressed: () => _showAddEditBoardMemberDialog(initialDept: deptName, availableDepts: depts),
                                    ),
                                ],
                              ),
                            ),

                            // --- OTHER TEAM MEMBERS ---
                            if (otherMembers.isNotEmpty) ...[
                              const SizedBox(height: 14),
                              const Text('Team Members:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: Colors.black54)),
                              const SizedBox(height: 6),
                              ...otherMembers.map((m) {
                                return Container(
                                  margin: const EdgeInsets.only(bottom: 6),
                                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                  decoration: BoxDecoration(
                                    color: Colors.white,
                                    borderRadius: BorderRadius.circular(8),
                                    border: Border.all(color: Colors.grey.shade200),
                                  ),
                                  child: Row(
                                    children: [
                                      const CircleAvatar(
                                        radius: 14,
                                        backgroundColor: Color(0xFFEEEEEE),
                                        child: Icon(Icons.person, size: 16, color: Colors.black54),
                                      ),
                                      const SizedBox(width: 10),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Text(m.name, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                                            Text(
                                              '${m.position.isNotEmpty ? "${m.position} • " : ""}${m.email} • Roll: ${m.rollNumber.isNotEmpty ? m.rollNumber : 'N/A'}',
                                              style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                                            ),
                                          ],
                                        ),
                                      ),
                                      if (m.position.isNotEmpty)
                                        Container(
                                          margin: const EdgeInsets.only(right: 8),
                                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                          decoration: BoxDecoration(
                                            color: maroonColor.withValues(alpha: 0.08),
                                            borderRadius: BorderRadius.circular(10),
                                          ),
                                          child: Text(
                                            m.position,
                                            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: maroonColor),
                                          ),
                                        ),
                                      if (isSuperAdminEmail(_firebaseService.currentUser?.email)) ...[
                                        IconButton(
                                          icon: const Icon(Icons.edit, color: Colors.blue, size: 18),
                                          onPressed: () => _showAddEditBoardMemberDialog(member: m, availableDepts: depts),
                                        ),
                                        IconButton(
                                          icon: const Icon(Icons.delete_outline, color: Colors.red, size: 18),
                                          onPressed: () async {
                                            await _firebaseService.deleteBoardMember(m.id);
                                            if (mounted) {
                                              ScaffoldMessenger.of(context).showSnackBar(
                                                SnackBar(content: Text('Member "${m.name}" removed.')),
                                              );
                                            }
                                          },
                                        ),
                                      ],
                                    ],
                                  ),
                                );
                              }),
                            ] else if (headMember == null) ...[
                              const Padding(
                                padding: EdgeInsets.all(12.0),
                                child: Text('No members in this team yet.', style: TextStyle(color: Colors.grey, fontStyle: FontStyle.italic)),
                              ),
                            ],
                          ],
                        ),
                      ),
                    );
                  }),
              ],
            );
          },
        );
      },
    );
  }

  // --- TAB 3: Admins List & Management ---

  Widget _buildAdminsTab(Color maroonColor) {
    return StreamBuilder<QuerySnapshot>(
      stream: _firebaseService.getAdminUsersStream(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }

        final docs = snapshot.data?.docs ?? [];
        final adminUsers = docs.map((d) => AppUser.fromMap(d.data() as Map<String, dynamic>, d.id)).toList();

        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Card(
              color: Colors.amber.shade50,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: BorderSide(color: Colors.amber.shade300)),
              child: const Padding(
                padding: EdgeInsets.all(16.0),
                child: Row(
                  children: [
                    Icon(Icons.shield, color: Colors.amber, size: 32),
                    SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Super Admin Control', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                          SizedBox(height: 4),
                          Text('Super Admins: prathamaj@karunya.edu.in, matrixkarunya@gmail.com\nAdmins can manage teams, board members, and meeting records.', style: TextStyle(fontSize: 13, color: Colors.black87)),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('Active Administrators', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                if (isSuperAdminEmail(_firebaseService.currentUser?.email))
                  ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(backgroundColor: maroonColor, foregroundColor: Colors.white),
                    icon: const Icon(Icons.person_add, size: 16),
                    label: const Text('Add Admin'),
                    onPressed: _showAddAdminDialog,
                  ),
              ],
            ),
            const SizedBox(height: 12),
            Card(
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              child: ListView.separated(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: adminUsers.length,
                separatorBuilder: (_, __) => const Divider(height: 1),
                itemBuilder: (ctx, idx) {
                  final admin = adminUsers[idx];
                  final isPrimary = isSuperAdminEmail(admin.email);
                  return ListTile(
                    leading: CircleAvatar(
                      backgroundColor: isPrimary ? Colors.amber.shade100 : maroonColor.withOpacity(0.1),
                      child: Icon(isPrimary ? Icons.star : Icons.verified_user, color: isPrimary ? Colors.amber.shade800 : maroonColor),
                    ),
                    title: Text(admin.name.isNotEmpty ? admin.name : admin.email, style: const TextStyle(fontWeight: FontWeight.bold)),
                    subtitle: Text(admin.email),
                    trailing: isPrimary
                        ? Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(color: Colors.amber.shade100, borderRadius: BorderRadius.circular(4)),
                            child: const Text('Super Admin', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.brown)),
                          )
                        : (isSuperAdminEmail(_firebaseService.currentUser?.email)
                            ? IconButton(
                                icon: const Icon(Icons.remove_circle_outline, color: Colors.red),
                                tooltip: 'Revoke Admin Privileges',
                                onPressed: () => _confirmDemoteAdmin(admin.uid, admin.email),
                              )
                            : Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                decoration: BoxDecoration(color: Colors.grey.shade100, borderRadius: BorderRadius.circular(4)),
                                child: const Text('Admin', style: TextStyle(fontSize: 11, color: Colors.grey)),
                              )),
                  );
                },
              ),
            ),
          ],
        );
      },
    );
  }

  // --- TAB 4: All Meeting Records & Minutes ---

  Widget _buildMeetingRecordsTab(Color maroonColor) {
    return StreamBuilder<QuerySnapshot>(
      stream: _firebaseService.getMeetingsStream(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }

        final docs = snapshot.data?.docs ?? [];
        if (docs.isEmpty) {
          return const Center(child: Text('No meeting records found.'));
        }

        return ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: docs.length,
          itemBuilder: (ctx, idx) {
            final doc = docs[idx];
            final meetingData = doc.data() as Map<String, dynamic>;
            meetingData['id'] = doc.id;

            final title = meetingData['title'] ?? 'Untitled Meeting';
            final status = meetingData['status'] ?? 'waiting';
            final code = meetingData['meetingCode'] ?? 'N/A';
            final host = meetingData['hostName'] ?? 'Host';

            return Card(
              margin: const EdgeInsets.only(bottom: 12),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              child: ListTile(
                leading: CircleAvatar(
                  backgroundColor: status == 'completed' ? Colors.green.shade100 : Colors.blue.shade100,
                  child: Icon(status == 'completed' ? Icons.check_circle : Icons.video_call, color: status == 'completed' ? Colors.green : Colors.blue),
                ),
                title: Text(title, style: const TextStyle(fontWeight: FontWeight.bold)),
                subtitle: Text('Host: $host  •  Code: $code\nStatus: ${status.toUpperCase()}'),
                isThreeLine: true,
                trailing: status == 'completed'
                    ? IconButton(
                        icon: const Icon(Icons.picture_as_pdf, color: Colors.red),
                        tooltip: 'Export PDF Minutes',
                        onPressed: () => PdfGenerator.generateMeetingPdf(meetingData),
                      )
                    : null,
              ),
            );
          },
        );
      },
    );
  }
}

