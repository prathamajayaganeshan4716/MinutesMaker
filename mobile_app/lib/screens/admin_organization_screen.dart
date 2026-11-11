import 'package:flutter/material.dart';
import '../services/organization_service.dart';
import '../models/app_models.dart';

class AdminOrganizationScreen extends StatefulWidget {
  const AdminOrganizationScreen({Key? key}) : super(key: key);

  @override
  State<AdminOrganizationScreen> createState() => _AdminOrganizationScreenState();
}

class _AdminOrganizationScreenState extends State<AdminOrganizationScreen> {
  final OrganizationService _orgService = OrganizationService();

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Organization Management'),
          bottom: const TabBar(
            tabs: [
              Tab(text: 'Members'),
              Tab(text: 'Teams'),
              Tab(text: 'Postings'),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            _buildMembersTab(),
            _buildTeamsTab(),
            _buildPostingsTab(),
          ],
        ),
      ),
    );
  }

  Widget _buildMembersTab() {
    return StreamBuilder<List<AppUser>>(
      stream: _orgService.getMembersStream(),
      builder: (context, snapshot) {
        if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
        final members = snapshot.data!;
        
        // Group by department
        final Map<String, List<AppUser>> grouped = {};
        for (var m in members) {
          final dept = m.department.isEmpty ? 'Unassigned' : m.department;
          grouped.putIfAbsent(dept, () => []).add(m);
        }
        
        final sortedDepts = grouped.keys.toList()..sort();

        return ListView.builder(
          itemCount: sortedDepts.length,
          itemBuilder: (context, i) {
            final dept = sortedDepts[i];
            final deptMembers = grouped[dept]!;
            
            return ExpansionTile(
              initiallyExpanded: true,
              title: Text('$dept (${deptMembers.length})', style: const TextStyle(fontWeight: FontWeight.bold)),
              children: deptMembers.map((member) {
                return ListTile(
                  title: Text(member.name.isEmpty ? member.email : member.name),
                  subtitle: Text('${member.email}\nRole No: ${member.rollNumber}'),
                  isThreeLine: true,
                  trailing: IconButton(
                    icon: const Icon(Icons.edit),
                    onPressed: () => _showEditMemberDialog(member),
                  ),
                );
              }).toList(),
            );
          },
        );
      },
    );
  }

  void _showEditMemberDialog(AppUser member) {
    final nameController = TextEditingController(text: member.name);
    final deptController = TextEditingController(text: member.department);
    final rollController = TextEditingController(text: member.rollNumber);
    bool isAdmin = member.hasPermission('adminAccess');
    
    showDialog(
      context: context,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setState) {
            return AlertDialog(
              title: const Text('Edit Member'),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    TextField(controller: nameController, decoration: const InputDecoration(labelText: 'Name')),
                    TextField(controller: deptController, decoration: const InputDecoration(labelText: 'Department')),
                    TextField(controller: rollController, decoration: const InputDecoration(labelText: 'Role Number')),
                    SwitchListTile(
                      title: const Text('Admin Access'),
                      value: isAdmin,
                      onChanged: (val) {
                        setState(() => isAdmin = val);
                      },
                    ),
                  ],
                ),
              ),
              actions: [
                TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
                ElevatedButton(
                  onPressed: () {
                    List<String> perms = List.from(member.permissions);
                    if (isAdmin && !perms.contains('adminAccess')) perms.add('adminAccess');
                    if (!isAdmin) perms.remove('adminAccess');
                    
                    _orgService.updateMember(
                      member.uid,
                      name: nameController.text,
                      department: deptController.text,
                      rollNumber: rollController.text,
                      permissions: perms,
                    );
                    Navigator.pop(context);
                  },
                  child: const Text('Save'),
                ),
              ],
            );
          }
        );
      },
    );
  }

  Widget _buildTeamsTab() {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(8.0),
          child: ElevatedButton(
            onPressed: () => _showCreateTeamDialog(),
            child: const Text('Create New Team'),
          ),
        ),
        Expanded(
          child: StreamBuilder<List<Team>>(
            stream: _orgService.getTeamsStream(),
            builder: (context, snapshot) {
              if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
              return ListView.builder(
                itemCount: snapshot.data!.length,
                itemBuilder: (context, index) {
                  final team = snapshot.data![index];
                  return ListTile(
                    title: Text(team.name),
                    trailing: IconButton(
                      icon: const Icon(Icons.delete, color: Colors.red),
                      onPressed: () => _orgService.deleteTeam(team.id),
                    ),
                  );
                },
              );
            },
          ),
        ),
      ],
    );
  }

  void _showCreateTeamDialog() {
    final controller = TextEditingController();
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Create Team'),
        content: TextField(controller: controller, decoration: const InputDecoration(labelText: 'Team Name')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () {
              if (controller.text.isNotEmpty) {
                _orgService.createTeam(controller.text);
                Navigator.pop(context);
              }
            },
            child: const Text('Create'),
          ),
        ],
      ),
    );
  }

  Widget _buildPostingsTab() {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(8.0),
          child: ElevatedButton(
            onPressed: () => _showCreatePostingDialog(),
            child: const Text('Create New Posting'),
          ),
        ),
        Expanded(
          child: StreamBuilder<List<Posting>>(
            stream: _orgService.getPostingsStream(),
            builder: (context, snapshot) {
              if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
              return ListView.builder(
                itemCount: snapshot.data!.length,
                itemBuilder: (context, index) {
                  final posting = snapshot.data![index];
                  return ListTile(
                    title: Text(posting.title),
                    trailing: IconButton(
                      icon: const Icon(Icons.delete, color: Colors.red),
                      onPressed: () => _orgService.deletePosting(posting.id),
                    ),
                  );
                },
              );
            },
          ),
        ),
      ],
    );
  }

  void _showCreatePostingDialog() {
    final controller = TextEditingController();
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Create Posting'),
        content: TextField(controller: controller, decoration: const InputDecoration(labelText: 'Posting Title')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () {
              if (controller.text.isNotEmpty) {
                _orgService.createPosting(controller.text, []);
                Navigator.pop(context);
              }
            },
            child: const Text('Create'),
          ),
        ],
      ),
    );
  }
}
