import '../config/super_admin.dart';
import 'dart:math';
import 'package:flutter/foundation.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/app_models.dart';

class FirebaseService {
  final FirebaseAuth _auth = FirebaseAuth.instance;
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  User? get currentUser => _auth.currentUser;
  
  Stream<QuerySnapshot> getMeetingsStream() {
    return _firestore
        .collection('meetings')
        .orderBy('createdAt', descending: true)
        .snapshots();
  }

  Future<User?> signInWithGoogle() async {
    try {
      GoogleAuthProvider googleProvider = GoogleAuthProvider();
      googleProvider.addScope('email');
      googleProvider.addScope('profile');
      
      UserCredential userCredential;
      if (kIsWeb) {
        try {
          userCredential = await _auth.signInWithPopup(googleProvider);
        } catch (popupError) {
          print("[FirebaseService] Popup auth failed/blocked, trying redirect: $popupError");
          await _auth.signInWithRedirect(googleProvider);
          return _auth.currentUser;
        }
      } else {
        try {
          userCredential = await _auth.signInWithProvider(googleProvider);
        } catch (providerError) {
          print("[FirebaseService] Provider auth failed, trying fallback: $providerError");
          userCredential = await _auth.signInWithPopup(googleProvider);
        }
      }
      if (userCredential.user != null) {
        await _ensureUserDocument(userCredential.user!);
      }
      return userCredential.user;
    } catch (e) {
      print("Google Auth error: $e");
      rethrow;
    }
  }

  Future<void> signOut() async {
    await _auth.signOut();
  }

  Future<User?> signIn(String email, String password) async {
    try {
      final userCredential = await _auth.signInWithEmailAndPassword(
        email: email, 
        password: password
      );
      if (userCredential.user != null) {
        await _ensureUserDocument(userCredential.user!);
      }
      return userCredential.user;
    } catch (e) {
      print("Auth error: $e");
      return null;
    }
  }

  Future<User?> register(String email, String password) async {
    try {
      final userCredential = await _auth.createUserWithEmailAndPassword(
        email: email,
        password: password,
      );
      
      if (userCredential.user != null) {
        await _ensureUserDocument(userCredential.user!);
      }
      
      return userCredential.user;
    } catch (e) {
      print("Registration error: $e");
      return null;
    }
  }

  Future<void> _ensureUserDocument(User user) async {
    try {
      final userDoc = await _firestore.collection('users').doc(user.uid).get();
      final userEmail = (user.email ?? '').trim().toLowerCase();
      final isDefaultAdmin = isSuperAdminEmail(userEmail);

      // Check board_members collection for this email (case-insensitive & trimmed)
      BoardMember? matchedBoardMember;
      try {
        final bSnap = await _firestore.collection('board_members').get();
        for (var doc in bSnap.docs) {
          final data = doc.data();
          final bEmail = (data['email'] ?? '').toString().trim().toLowerCase();
          if (bEmail == userEmail && userEmail.isNotEmpty) {
            matchedBoardMember = BoardMember.fromMap(data, doc.id);
            break;
          }
        }
      } catch (e) {
        print("Error checking board members during ensureUserDoc: $e");
      }

      final isBoardMember = matchedBoardMember != null;
      final isTeamHead = matchedBoardMember?.isHead ?? false;
      final isGuest = !isDefaultAdmin && !isBoardMember && !isTeamHead;

      if (!userDoc.exists) {
        await _firestore.collection('users').doc(user.uid).set({
          'email': user.email ?? '',
          'name': user.displayName ?? user.email?.split('@')[0] ?? 'User',
          'role': isDefaultAdmin ? 'admin' : 'member',
          'department': matchedBoardMember?.department ?? '',
          'rollNumber': matchedBoardMember?.rollNumber ?? '',
          'position': matchedBoardMember?.position ?? '',
          'postingId': '',
          'teamId': '',
          'isTeamHead': isTeamHead,
          'isActive': true,
          'permissions': isDefaultAdmin
              ? ['adminAccess', 'docsAccess']
              : (isTeamHead ? ['docsAccess'] : []),
          'isGuest': isGuest,
          'createdAt': FieldValue.serverTimestamp(),
        });
      } else {
        final data = userDoc.data() ?? {};
        final Map<String, dynamic> updates = {};
        if (isDefaultAdmin && (data['role'] != 'admin' || !(data['permissions'] as List? ?? []).contains('adminAccess'))) {
          updates['role'] = 'admin';
          updates['permissions'] = FieldValue.arrayUnion(['adminAccess', 'docsAccess']);
          updates['isGuest'] = false;
        }
        if (isBoardMember && data['isGuest'] == true) {
          updates['isGuest'] = false;
        }
        if (isTeamHead) {
          if (data['isTeamHead'] != true) updates['isTeamHead'] = true;
          if (data['isGuest'] != false) updates['isGuest'] = false;
        }
        if (matchedBoardMember != null && data['department'] != matchedBoardMember.department) {
          updates['department'] = matchedBoardMember.department;
        }
        if (updates.isNotEmpty) {
          await _firestore.collection('users').doc(user.uid).update(updates);
        }
      }
    } catch (e) {
      print("Error ensuring user document: $e");
    }
  }

  Future<AppUser?> getUserProfile(String uid) async {
    try {
      final doc = await _firestore.collection('users').doc(uid).get();
      if (doc.exists && doc.data() != null) {
        var profile = AppUser.fromMap(doc.data()!, doc.id);
        final cleanEmail = profile.email.trim().toLowerCase();

        if (isSuperAdminEmail(cleanEmail) && !profile.isAdmin) {
          await _firestore.collection('users').doc(uid).update({
            'role': 'admin',
            'permissions': FieldValue.arrayUnion(['adminAccess', 'docsAccess']),
            'isGuest': false,
          });
          profile = AppUser.fromMap({
            ...doc.data()!,
            'role': 'admin',
            'permissions': ['adminAccess', 'docsAccess'],
            'isGuest': false,
          }, uid);
        }

        // Case-insensitive lookup in board_members collection
        BoardMember? matchedMember;
        try {
          final boardSnap = await _firestore.collection('board_members').get();
          for (var bDoc in boardSnap.docs) {
            final bData = bDoc.data();
            final bEmail = (bData['email'] ?? '').toString().trim().toLowerCase();
            if (bEmail == cleanEmail && cleanEmail.isNotEmpty) {
              matchedMember = BoardMember.fromMap(bData, bDoc.id);
              break;
            }
          }
        } catch (e) {
          print("Error fetching board members check: $e");
        }

        final isBoardMember = matchedMember != null;
        final isTeamHead = matchedMember?.isHead ?? profile.isTeamHead;
        final shouldBeGuest = !profile.isAdmin && !isBoardMember && !isTeamHead;

        if (profile.isGuest != shouldBeGuest || profile.isTeamHead != isTeamHead) {
          await _firestore.collection('users').doc(uid).update({
            'isGuest': shouldBeGuest,
            'isTeamHead': isTeamHead,
            if (matchedMember != null) 'department': matchedMember.department,
            if (matchedMember != null && matchedMember.position.isNotEmpty) 'position': matchedMember.position,
            if (matchedMember != null && matchedMember.rollNumber.isNotEmpty) 'rollNumber': matchedMember.rollNumber,
          });
          profile = AppUser.fromMap({
            ...doc.data()!,
            'isGuest': shouldBeGuest,
            'isTeamHead': isTeamHead,
            if (matchedMember != null) 'department': matchedMember.department,
            if (matchedMember != null && matchedMember.position.isNotEmpty) 'position': matchedMember.position,
            if (matchedMember != null && matchedMember.rollNumber.isNotEmpty) 'rollNumber': matchedMember.rollNumber,
          }, uid);
        }

        return profile;
      }
    } catch (e) {
      print("Error fetching user profile: $e");
    }
    return null;
  }

  // --- Departments / Teams Management ---

  static const List<String> defaultDepartmentsList = [
    'Technical',
    'Management',
    'Operations',
    'Executive',
    'HR & Admin',
    'General',
  ];

  Stream<QuerySnapshot> getDepartmentsStream() {
    return _firestore.collection('departments').orderBy('name').snapshots();
  }

  Future<void> seedDefaultDepartmentsIfEmpty() async {
    try {
      final snap = await _firestore.collection('departments').limit(1).get();
      if (snap.docs.isEmpty) {
        for (var dept in defaultDepartmentsList) {
          await _firestore.collection('departments').add({
            'name': dept,
            'createdAt': FieldValue.serverTimestamp(),
          });
        }
      }
    } catch (e) {
      print("Error seeding default departments: $e");
    }
  }

  Future<void> addDepartment(String name) async {
    if (!isSuperAdminEmail(currentUser?.email)) {
      throw Exception('Only super admins can add teams/departments.');
    }
    final clean = name.trim();
    if (clean.isEmpty) return;
    final existing = await _firestore
        .collection('departments')
        .where('name', isEqualTo: clean)
        .limit(1)
        .get();
    if (existing.docs.isEmpty) {
      await _firestore.collection('departments').add({
        'name': clean,
        'createdAt': FieldValue.serverTimestamp(),
      });
    }
  }

  Future<void> deleteDepartment(String deptDocId) async {
    if (!isSuperAdminEmail(currentUser?.email)) {
      throw Exception('Only super admins can delete teams/departments.');
    }
    await _firestore.collection('departments').doc(deptDocId).delete();
  }

  Future<List<String>> getDepartmentsList() async {
    try {
      final snap = await _firestore.collection('departments').orderBy('name').get();
      final list = snap.docs
          .map((d) => (d.data())['name']?.toString().trim() ?? '')
          .where((s) => s.isNotEmpty)
          .toList();
      if (list.isNotEmpty) return list;
    } catch (e) {
      print("Error getting departments list: $e");
    }
    return List<String>.from(defaultDepartmentsList);
  }

  // --- Board Member Management (Admin Dashboard) ---

  Stream<QuerySnapshot> getBoardMembersStream() {
    return _firestore.collection('board_members').snapshots();
  }

  Future<void> addBoardMember(Map<String, dynamic> data) async {
    if (!isSuperAdminEmail(currentUser?.email)) {
      throw Exception('Only super admins can add board members.');
    }
    data['createdAt'] = FieldValue.serverTimestamp();
    await _firestore.collection('board_members').add(data);
  }

  Future<void> updateBoardMember(String memberId, Map<String, dynamic> data) async {
    if (!isSuperAdminEmail(currentUser?.email)) {
      throw Exception('Only super admins can edit board members.');
    }
    await _firestore.collection('board_members').doc(memberId).update(data);
  }

  Future<void> deleteBoardMember(String memberId) async {
    if (!isSuperAdminEmail(currentUser?.email)) {
      throw Exception('Only super admins can delete board members.');
    }
    await _firestore.collection('board_members').doc(memberId).delete();
  }

  // --- Admin User Management ---

  Stream<QuerySnapshot> getAdminUsersStream() {
    return _firestore.collection('users').where('role', isEqualTo: 'admin').snapshots();
  }

  Future<void> promoteUserToAdmin(String email) async {
    if (!isSuperAdminEmail(currentUser?.email)) {
      throw Exception('Only Super Admins can promote users to admin.');
    }
    final query = await _firestore.collection('users').where('email', isEqualTo: email.trim().toLowerCase()).get();
    if (query.docs.isEmpty) {
      // Create user entry if not already in collection
      await _firestore.collection('users').add({
        'email': email.trim().toLowerCase(),
        'name': email.split('@')[0],
        'role': 'admin',
        'permissions': ['adminAccess', 'docsAccess'],
        'isGuest': false,
        'createdAt': FieldValue.serverTimestamp(),
      });
    } else {
      for (var doc in query.docs) {
        await doc.reference.update({
          'role': 'admin',
          'permissions': FieldValue.arrayUnion(['adminAccess', 'docsAccess']),
          'isGuest': false,
        });
      }
    }
  }

  Future<void> demoteAdminToMember(String docId, String email) async {
    if (!isSuperAdminEmail(currentUser?.email)) {
      throw Exception('Only Super Admins can revoke admin access.');
    }
    if (isSuperAdminEmail(email)) {
      throw Exception('Super Admin cannot be demoted.');
    }
    await _firestore.collection('users').doc(docId).update({
      'role': 'member',
      'permissions': FieldValue.arrayRemove(['adminAccess']),
    });
  }

  Future<void> addMemberAccount({
    required String name,
    required String email,
    String? department,
    String? position,
    String? rollNumber,
  }) async {
    if (!isSuperAdminEmail(currentUser?.email)) {
      throw Exception('Only Super Admins can add member accounts.');
    }
    final cleanEmail = email.trim().toLowerCase();
    final cleanName = name.trim().isEmpty ? cleanEmail.split('@')[0] : name.trim();
    final query = await _firestore.collection('users').where('email', isEqualTo: cleanEmail).get();
    if (query.docs.isEmpty) {
      await _firestore.collection('users').add({
        'email': cleanEmail,
        'name': cleanName,
        'department': department ?? '',
        'position': position ?? '',
        'rollNumber': rollNumber ?? '',
        'role': 'member',
        'permissions': [],
        'isGuest': false,
        'isActive': true,
        'createdAt': FieldValue.serverTimestamp(),
      });
    } else {
      for (var doc in query.docs) {
        await doc.reference.update({
          'name': cleanName,
          if (department != null && department.isNotEmpty) 'department': department,
          if (position != null && position.isNotEmpty) 'position': position,
          if (rollNumber != null && rollNumber.isNotEmpty) 'rollNumber': rollNumber,
          'isGuest': false,
          'isActive': true,
        });
      }
    }
    if (department != null && department.isNotEmpty) {
      await addBoardMember({
        'name': cleanName,
        'email': cleanEmail,
        'rollNumber': rollNumber ?? '',
        'department': department,
        'position': position ?? '',
        'isHead': false,
      });
    }
  }

  // --- Meeting Creation & Code Generation ---

  String _generateMeetingCode() {
    final rand = Random();
    final p1 = (1000 + rand.nextInt(9000)).toString();
    final p2 = (1000 + rand.nextInt(9000)).toString();
    return 'cnt-$p1-$p2';
  }

  Future<BoardMember?> findBoardMemberByName(String name) async {
    try {
      final clean = name.trim().toLowerCase();
      final snap = await _firestore.collection('board_members').get();
      for (var doc in snap.docs) {
        final member = BoardMember.fromMap(doc.data(), doc.id);
        final mName = member.name.trim().toLowerCase();
        if (mName == clean || clean.contains(mName) || mName.contains(clean)) {
          return member;
        }
      }
    } catch (e) {
      print('findBoardMemberByName error: $e');
    }
    return null;
  }

  Future<Map<String, String>?> createMeetingDetailed({
    required String title,
    required String agenda,
    required String meetingType, // 'instant' | 'scheduled'
    DateTime? scheduledAt,
    required String hostName,
    required String hostEmail,
    required String hostUid,
    List<String> selectedDepartments = const [],
    List<String> invitedMemberUids = const [],
    List<Map<String, String>> externalParticipants = const [],
    String? presidingOfficer,
    String? presidingOfficerDesignation,
  }) async {
    try {
      final meetingCode = _generateMeetingCode();
      
      int boardStrength = 0;
      try {
        final bSnap = await _firestore.collection('board_members').get();
        boardStrength = bSnap.docs.length;
      } catch (e) {
        print("Board strength count error: $e");
      }

      // If designation wasn't explicitly supplied, attempt to resolve from board_members
      String resolvedDesignation = presidingOfficerDesignation ?? '';
      if (resolvedDesignation.isEmpty && presidingOfficer != null && presidingOfficer.isNotEmpty) {
        final matchedMember = await findBoardMemberByName(presidingOfficer);
        if (matchedMember != null && matchedMember.position.isNotEmpty) {
          resolvedDesignation = matchedMember.position;
        }
      }

      final docRef = await _firestore.collection('meetings').add({
        'meetingCode': meetingCode,
        'title': title,
        'agenda': agenda,
        'meetingType': meetingType,
        'scheduledAt': scheduledAt != null ? Timestamp.fromDate(scheduledAt) : null,
        'hostUid': hostUid,
        'hostName': hostName,
        'hostEmail': hostEmail,
        'selectedDepartments': selectedDepartments,
        'invitedMemberUids': invitedMemberUids,
        'externalParticipants': externalParticipants,
        'presidingOfficer': presidingOfficer ?? hostName,
        'presidingOfficerDesignation': resolvedDesignation,
        'boardStrength': boardStrength,
        'createdAt': FieldValue.serverTimestamp(),
        'status': meetingType == 'scheduled' ? 'scheduled' : 'waiting',
        'attendanceTracked': true,
      });

      return {
        'meetingId': docRef.id,
        'meetingCode': meetingCode,
      };
    } catch (e) {
      print("Create meeting error: $e");
      return null;
    }
  }

  Future<String?> createMeeting(String title, {String? hostName, String? agenda, String? department, String? participants}) async {
    final user = currentUser;
    final res = await createMeetingDetailed(
      title: title,
      agenda: agenda ?? '',
      meetingType: 'instant',
      hostName: hostName ?? user?.displayName ?? 'Host',
      hostEmail: user?.email ?? '',
      hostUid: user?.uid ?? '',
      selectedDepartments: department != null && department.isNotEmpty ? [department] : [],
    );
    return res?['meetingId'];
  }

  Future<MeetingModel?> getMeetingByCodeOrId(String codeOrId) async {
    try {
      // 1. Direct document ID lookup
      final doc = await _firestore.collection('meetings').doc(codeOrId).get();
      if (doc.exists && doc.data() != null) {
        return MeetingModel.fromMap(doc.data()!, doc.id);
      }

      // 2. Lookup by meetingCode
      final query = await _firestore
          .collection('meetings')
          .where('meetingCode', isEqualTo: codeOrId.trim())
          .limit(1)
          .get();

      if (query.docs.isNotEmpty) {
        return MeetingModel.fromMap(query.docs.first.data(), query.docs.first.id);
      }
    } catch (e) {
      print("Error looking up meeting: $e");
    }
    return null;
  }

  Future<void> updateMeetingStatus(String meetingId, String status) async {
    final ref = _firestore.collection('meetings').doc(meetingId);
    await _firestore.runTransaction((tx) async {
      final data = (await tx.get(ref)).data() ?? {};
      if (status == 'recording' && ['processing', 'completed'].contains(data['status'])) return;
      tx.update(ref, {
        'status': status,
        if (status == 'recording' && data['startedAt'] == null) 'startedAt': FieldValue.serverTimestamp(),
        if (status == 'processing' && data['endedAt'] == null) 'endedAt': FieldValue.serverTimestamp(),
      });
    });
  }

  Future<void> recordAttendance(String meetingId, String name) async {
    final user = currentUser;
    final uid = user?.uid ?? '';
    final email = user?.email ?? '';
    final identity = uid.isNotEmpty ? 'uid:$uid' : email.isNotEmpty ? 'email:${email.trim().toLowerCase()}' : 'displayName:${name.trim().toLowerCase()}';
    if (uid.isEmpty && email.isEmpty && name.trim().isEmpty) return;
    final ref = _firestore.collection('meetings').doc(meetingId);
    await ref.collection('attendance').doc(Uri.encodeComponent(identity)).set({
      'uid': uid, 'email': email, 'displayName': name,
      'joinedAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));
  }

  Future<bool> meetingExists(String meetingId) async {
    try {
      final doc = await _firestore.collection('meetings').doc(meetingId).get();
      return doc.exists;
    } catch (e) {
      return false;
    }
  }

  Future<void> deleteMeeting(String meetingId) async {
    try {
      final user = currentUser;
      final isSuper = isSuperAdminEmail(user?.email);
      if (!isSuper) {
        final snap = await _firestore.collection('meetings').doc(meetingId).get();
        final data = snap.data();
        if (data != null) {
          final hostEmail = (data['hostEmail'] ?? '').toString().trim().toLowerCase();
          final hostUid = (data['hostUid'] ?? data['hostId'] ?? '').toString();
          final userEmail = (user?.email ?? '').trim().toLowerCase();
          final uid = user?.uid ?? '';
          if (hostEmail != userEmail && hostUid != uid) {
            throw Exception('You can only delete your own meetings.');
          }
        }
      }
      await _firestore.collection('meetings').doc(meetingId).delete();
    } catch (e) {
      print("Error deleting meeting: $e");
      rethrow;
    }
  }

  Future<void> updateMeeting(String meetingId, Map<String, dynamic> data) async {
    try {
      final user = currentUser;
      final isSuper = isSuperAdminEmail(user?.email);
      if (!isSuper) {
        final snap = await _firestore.collection('meetings').doc(meetingId).get();
        final existing = snap.data();
        if (existing != null) {
          final hostEmail = (existing['hostEmail'] ?? '').toString().trim().toLowerCase();
          final hostUid = (existing['hostUid'] ?? existing['hostId'] ?? '').toString();
          final userEmail = (user?.email ?? '').trim().toLowerCase();
          final uid = user?.uid ?? '';
          if (hostEmail != userEmail && hostUid != uid) {
            throw Exception('You can only edit your own meetings.');
          }
        }
      }
      await _firestore.collection('meetings').doc(meetingId).update(data);
    } catch (e) {
      print("Error updating meeting: $e");
      rethrow;
    }
  }

  Future<String?> scheduleMeeting(String title, String agenda, String department, DateTime date) async {
    final user = currentUser;
    final res = await createMeetingDetailed(
      title: title,
      agenda: agenda,
      meetingType: 'scheduled',
      scheduledAt: date,
      hostName: user?.displayName ?? 'Host',
      hostEmail: user?.email ?? '',
      hostUid: user?.uid ?? '',
      selectedDepartments: [department],
    );
    return res?['meetingId'];
  }

  Stream<QuerySnapshot> getScheduledMeetingsStream() {
    return _firestore
        .collection('meetings')
        .where('status', isEqualTo: 'scheduled')
        .snapshots();
  }

  // --- Host Admission & Waiting Lobby ---

  Future<String?> requestEntryToLobby(String meetingId, String name, String email) async {
    try {
      final ref = await _firestore
          .collection('meetings')
          .doc(meetingId)
          .collection('waiting_lobby')
          .add({
        'name': name,
        'email': email,
        'status': 'pending', // 'pending' | 'admitted' | 'denied'
        'requestedAt': FieldValue.serverTimestamp(),
      });
      return ref.id;
    } catch (e) {
      print("Lobby request error: $e");
      return null;
    }
  }

  Stream<QuerySnapshot> streamWaitingLobby(String meetingId) {
    return _firestore
        .collection('meetings')
        .doc(meetingId)
        .collection('waiting_lobby')
        .where('status', isEqualTo: 'pending')
        .snapshots();
  }

  Stream<DocumentSnapshot> streamLobbyStatus(String meetingId, String lobbyDocId) {
    return _firestore
        .collection('meetings')
        .doc(meetingId)
        .collection('waiting_lobby')
        .doc(lobbyDocId)
        .snapshots();
  }

  Future<void> updateLobbyStatus(String meetingId, String lobbyDocId, String status) async {
    try {
      await _firestore
          .collection('meetings')
          .doc(meetingId)
          .collection('waiting_lobby')
          .doc(lobbyDocId)
          .update({'status': status});
    } catch (e) {
      print("Error updating lobby status: $e");
    }
  }

  // --- Transcript & Completion ---

  Future<void> addTranscriptSegment(String meetingId, Map<String, dynamic> segmentData) async {
    try {
      segmentData['createdAt'] = FieldValue.serverTimestamp();
      final collection = _firestore
          .collection('meetings')
          .doc(meetingId)
          .collection('transcript_segments');

      final segmentId = segmentData.remove('segmentId');
      if (segmentId != null && segmentId.toString().isNotEmpty) {
        await collection.doc(segmentId.toString()).set(segmentData, SetOptions(merge: true));
      } else {
        await collection.add(segmentData);
      }
    } catch (e) {
      print("[FirebaseService] Error saving transcript segment: $e");
    }
  }

  Future<List<Map<String, dynamic>>> getTranscriptSegments(String meetingId) async {
    try {
      final snapshot = await _firestore
          .collection('meetings')
          .doc(meetingId)
          .collection('transcript_segments')
          .orderBy('createdAt', descending: false)
          .get();

      return snapshot.docs.map((doc) => doc.data()).toList();
    } catch (e) {
      print("[FirebaseService] Error fetching transcript segments: $e");
      return [];
    }
  }

  Future<void> completeMeeting(String meetingId, Map<String, dynamic> reportData, {String? transcript}) async {
    try {
      final updateData = <String, dynamic>{
        'status': 'completed',
        'summary': reportData['summary'] ?? '',
        'decisions': reportData['decisions'] ?? '',
        'actionItems': reportData['actionItems'] ?? '',
        'conclusion': reportData['conclusion'] ?? '',
      };
      if (transcript != null && transcript.isNotEmpty) {
        updateData['transcript'] = transcript;
      }
      await _firestore.collection('meetings').doc(meetingId).update(updateData);
    } catch (e) {
      print("[FirebaseService] Error completing meeting: $e");
    }
  }
}
