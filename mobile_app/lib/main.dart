import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'firebase_options.dart';
import 'screens/auth_router.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  static const Color primaryMaroon = Color(0xFF800E13);
  static const Color darkMaroon = Color(0xFF640D14);
  static const Color deepMaroon = Color(0xFF38040E);
  static const Color darkestBrown = Color(0xFF250902);

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Minutes Maker',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: primaryMaroon,
          primary: primaryMaroon,
          secondary: darkMaroon,
          surface: Colors.white,
          brightness: Brightness.light,
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: Colors.white,
          foregroundColor: darkestBrown,
          elevation: 0,
        ),
        useMaterial3: true,
      ),
      home: const AuthRouter(),
    );
  }
}
