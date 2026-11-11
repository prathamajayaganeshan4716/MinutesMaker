import 'package:flutter/material.dart';
import '../services/firebase_service.dart';
import 'dashboard_screen.dart';
import 'admin_dashboard_screen.dart';

class AdminHostScreen extends StatefulWidget {
  const AdminHostScreen({super.key});

  @override
  State<AdminHostScreen> createState() => _AdminHostScreenState();
}

class _AdminHostScreenState extends State<AdminHostScreen> with SingleTickerProviderStateMixin {
  late TabController _mainTabController;
  final FirebaseService _firebaseService = FirebaseService();

  @override
  void initState() {
    super.initState();
    // 2 tabs: Admin Controls, Meeting Hub
    _mainTabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _mainTabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const maroonColor = Color(0xFF640D14);

    return Scaffold(
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
          IconButton(
            icon: const Icon(Icons.logout, color: maroonColor),
            tooltip: 'Sign Out',
            onPressed: () async => await _firebaseService.signOut(),
          ),
          const SizedBox(width: 8),
        ],
        bottom: TabBar(
          controller: _mainTabController,
          labelColor: maroonColor,
          unselectedLabelColor: Colors.black54,
          indicatorColor: maroonColor,
          tabs: const [
            Tab(icon: Icon(Icons.admin_panel_settings), text: 'Admin Controls'),
            Tab(icon: Icon(Icons.dashboard), text: 'Meeting Hub'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _mainTabController,
        physics: const NeverScrollableScrollPhysics(), // Prevent swipe to avoid conflict with AdminDashboard's internal tabs
        children: const [
          AdminDashboardScreen(hideAppBar: true),
          DashboardScreen(hideAppBar: true),
        ],
      ),
    );
  }
}
