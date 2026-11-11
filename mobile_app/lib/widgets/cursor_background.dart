import 'package:flutter/material.dart';

class CursorBackground extends StatefulWidget {
  final Widget child;

  const CursorBackground({super.key, required this.child});

  @override
  State<CursorBackground> createState() => _CursorBackgroundState();
}

class _CursorBackgroundState extends State<CursorBackground> {
  Offset _mousePosition = const Offset(0, 0);
  bool _isHovering = false;

  @override
  Widget build(BuildContext context) {
    // Define the color palette for Light Theme
    const lightBgBase = Color(0xFFF9F9F9); // Very light grey/off-white
    const lightBgTop = Colors.white;
    const glowColor = Color(0xFF800E13); // The bright glowing red

    return Scaffold(
      backgroundColor: lightBgBase,
      body: MouseRegion(
        onHover: (event) {
          setState(() {
            _mousePosition = event.position;
            _isHovering = true;
          });
        },
        onExit: (event) {
          setState(() {
            _isHovering = false;
          });
        },
        child: Stack(
          children: [
            // Light Gradient Background
            Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [lightBgTop, lightBgBase],
                ),
              ),
            ),
            
            // The Glowing Orb
            AnimatedPositioned(
              duration: const Duration(milliseconds: 100), // Smooth follow
              curve: Curves.easeOutExpo,
              left: _mousePosition.dx - 200, // Center the orb (size 400)
              top: _mousePosition.dy - 200,
              child: AnimatedOpacity(
                duration: const Duration(milliseconds: 300),
                opacity: _isHovering ? 0.3 : 0.0, // More subtle opacity for light theme
                child: Container(
                  width: 400,
                  height: 400,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: RadialGradient(
                      colors: [
                        glowColor.withOpacity(0.5),
                        glowColor.withOpacity(0.2),
                        Colors.transparent,
                      ],
                      stops: const [0.1, 0.5, 1.0],
                    ),
                  ),
                ),
              ),
            ),
            
            // The App Content goes on top
            Positioned.fill(
              child: widget.child,
            ),
          ],
        ),
      ),
    );
  }
}
