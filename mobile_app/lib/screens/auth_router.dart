import '../config/super_admin.dart';
import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../services/firebase_service.dart';
import '../models/app_models.dart';
import 'login_screen.dart';
import 'dashboard_screen.dart';
import 'admin_host_screen.dart';
import 'meeting_room_screen.dart';

class AuthRouter extends StatelessWidget {
  const AuthRouter({super.key});

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<User?>(
      stream: FirebaseAuth.instance.authStateChanges(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Scaffold(body: Center(child: CircularProgressIndicator()));
        }

        final user = snapshot.data;

        // Check if there is a meeting code in the URL query string
        final joinCode = Uri.base.queryParameters['code'] ?? Uri.base.queryParameters['join'];
        if (joinCode != null && joinCode.isNotEmpty && user == null) {
          // If unauthenticated user opens join link, direct to login with return option or guest join
          return LoginScreen(initialJoinCode: joinCode);
        }

        if (user == null) {
          return const LoginScreen();
        }

        // Authenticated User: fetch profile
        return FutureBuilder<AppUser?>(
          future: FirebaseService().getUserProfile(user.uid),
          builder: (context, profileSnapshot) {
            if (profileSnapshot.connectionState == ConnectionState.waiting) {
              return const Scaffold(body: Center(child: CircularProgressIndicator()));
            }

            final profile = profileSnapshot.data;

            // Direct link join for authenticated user
            if (joinCode != null && joinCode.isNotEmpty) {
              return MeetingRoomScreen(
                meetingId: joinCode,
                userName: profile?.name ?? user.displayName ?? user.email?.split('@')[0] ?? 'Member',
              );
            }

            final isSuperAdmin = isSuperAdminEmail(user.email);
            if (isSuperAdmin || (profile != null && (profile.isAdmin || profile.isTeamHead))) {
              return const AdminHostScreen();
            } else {
              return const DashboardScreen(); // Member Dashboard
            }
          },
        );

      },
    );
  }
}
