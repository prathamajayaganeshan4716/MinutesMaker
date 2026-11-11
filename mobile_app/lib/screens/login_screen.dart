import 'dart:ui';
import 'package:flutter/material.dart';
import '../services/firebase_service.dart';
import 'external_join_screen.dart';

class LoginScreen extends StatefulWidget {
  final String? initialJoinCode;

  const LoginScreen({super.key, this.initialJoinCode});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> with SingleTickerProviderStateMixin {
  final _firebaseService = FirebaseService();
  bool _isLoading = false;
  late AnimationController _bgController;

  @override
  void initState() {
    super.initState();
    // This controller creates the smooth, slow-moving "video" effect for the background
    _bgController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 8),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _bgController.dispose();
    super.dispose();
  }

  Future<void> _loginWithGoogle() async {
    setState(() => _isLoading = true);

    try {
      final user = await _firebaseService.signInWithGoogle();
      if (mounted) {
        setState(() => _isLoading = false);
        if (user == null) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Failed to sign in with Google. Please try again.')),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Google Sign-In Error: ${e.toString()}'),
            backgroundColor: Colors.red.shade800,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          // 1. The "Video-like" Animated Maroon Background
          AnimatedBuilder(
            animation: _bgController,
            builder: (context, child) {
              return Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: const [
                      Color(0xFF1A0000), // Almost black maroon
                      Color(0xFF800E13), // Matrix primary maroon
                      Color(0xFF640D14), // Dark maroon
                      Color(0xFF250902), // Darkest brown/maroon
                    ],
                    stops: [
                      0.0,
                      0.3 + (_bgController.value * 0.3),
                      0.6 + (_bgController.value * 0.3),
                      1.0,
                    ],
                  ),
                ),
              );
            },
          ),
          
          // 2. Some glowing orbs for extra depth
          Positioned(
            top: -100,
            left: -100,
            child: Container(
              width: 300,
              height: 300,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: const Color(0xFF800E13).withOpacity(0.4),
                boxShadow: const [BoxShadow(blurRadius: 100, spreadRadius: 50, color: Color(0xFF800E13))],
              ),
            ),
          ),
          Positioned(
            bottom: -50,
            right: -50,
            child: Container(
              width: 250,
              height: 250,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: const Color(0xFFD90429).withOpacity(0.3),
                boxShadow: const [BoxShadow(blurRadius: 80, spreadRadius: 40, color: Color(0xFFD90429))],
              ),
            ),
          ),

          // 3. The Glassmorphism Login Card
          Center(
            child: Padding(
              padding: const EdgeInsets.all(24.0),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(24),
                child: BackdropFilter(
                  filter: ImageFilter.blur(sigmaX: 15, sigmaY: 15),
                  child: Container(
                    width: 400,
                    padding: const EdgeInsets.symmetric(horizontal: 32.0, vertical: 48.0),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.1), // Semi-transparent white
                      borderRadius: BorderRadius.circular(24),
                      border: Border.all(
                        color: Colors.white.withOpacity(0.2), // Frosted glass border
                        width: 1.5,
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withOpacity(0.2),
                          blurRadius: 30,
                          offset: const Offset(0, 10),
                        ),
                      ],
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        // Transparent logo with symbol + official MINUTES MAKER logo font
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 18),
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(color: Colors.white.withValues(alpha: 0.2)),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black.withValues(alpha: 0.15),
                                blurRadius: 20,
                                offset: const Offset(0, 8),
                              )
                            ]
                          ),
                          child: Image.asset(
                            'assets/images/connect_logo_transparent.png',
                            height: 110,
                            errorBuilder: (context, error, stackTrace) {
                              return Column(
                                mainAxisSize: MainAxisSize.min,
                                children: const [
                                  Icon(Icons.hub, size: 64, color: Colors.white),
                                  SizedBox(height: 8),
                                  Text(
                                    'MINUTES MAKER',
                                    style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900, color: Colors.white, letterSpacing: 2),
                                  )
                                ],
                              );
                            },
                          ),
                        ),
                        const SizedBox(height: 16),
                        Text(
                          'Smart Meeting Collaboration & Minutes',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.85),
                            fontSize: 14,
                            letterSpacing: 0.5,
                          ),
                        ),
                        const SizedBox(height: 48),
                        
                        // Google Sign In Button
                        SizedBox(
                          height: 52,
                          width: double.infinity,
                          child: ElevatedButton.icon(
                            onPressed: _isLoading ? null : _loginWithGoogle,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.white,
                              foregroundColor: Colors.black87,
                              elevation: 0,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                            ),
                            icon: _isLoading
                                ? const SizedBox(
                                    width: 24,
                                    height: 24,
                                    child: CircularProgressIndicator(strokeWidth: 2),
                                  )
                                : const Icon(
                                    Icons.g_mobiledata,
                                    size: 32,
                                    color: Colors.red,
                                  ),
                            label: const Text(
                              'Sign in with Google',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(height: 16),
                        TextButton.icon(
                          onPressed: () {
                            Navigator.of(context).push(
                              MaterialPageRoute(builder: (_) => const ExternalJoinScreen()),
                            );
                          },
                          icon: const Icon(Icons.key, color: Colors.white70, size: 18),
                          label: const Text(
                            'Have a Meeting Code? Join as Guest',
                            style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
