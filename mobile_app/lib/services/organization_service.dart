import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/app_models.dart';

class OrganizationService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  // --- Teams ---

  Future<void> createTeam(String name) async {
    await _firestore.collection('teams').add({'name': name, 'createdAt': FieldValue.serverTimestamp()});
  }

  Stream<List<Team>> getTeamsStream() {
    return _firestore.collection('teams').orderBy('name').snapshots().map((snapshot) {
      return snapshot.docs.map((doc) => Team.fromMap(doc.data(), doc.id)).toList();
    });
  }

  Future<void> deleteTeam(String teamId) async {
    await _firestore.collection('teams').doc(teamId).delete();
  }

  // --- Postings ---

  Future<void> createPosting(String title, List<String> defaultPermissions) async {
    await _firestore.collection('postings').add({
      'title': title,
      'defaultPermissions': defaultPermissions,
      'createdAt': FieldValue.serverTimestamp(),
    });
  }

  Stream<List<Posting>> getPostingsStream() {
    return _firestore.collection('postings').orderBy('title').snapshots().map((snapshot) {
      return snapshot.docs.map((doc) => Posting.fromMap(doc.data(), doc.id)).toList();
    });
  }

  Future<void> deletePosting(String postingId) async {
    await _firestore.collection('postings').doc(postingId).delete();
  }

  // --- Members ---

  Stream<List<AppUser>> getMembersStream() {
    return _firestore.collection('users').orderBy('name').snapshots().map((snapshot) {
      return snapshot.docs.map((doc) => AppUser.fromMap(doc.data(), doc.id)).toList();
    });
  }

  Future<void> updateMember(String uid, {
    String? name,
    String? postingId,
    String? teamId,
    bool? isTeamHead,
    bool? isActive,
    List<String>? permissions,
    String? department,
    String? rollNumber,
  }) async {
    final Map<String, dynamic> data = {};
    if (name != null) data['name'] = name;
    if (postingId != null) data['postingId'] = postingId;
    if (teamId != null) data['teamId'] = teamId;
    if (isTeamHead != null) data['isTeamHead'] = isTeamHead;
    if (isActive != null) data['isActive'] = isActive;
    if (permissions != null) data['permissions'] = permissions;
    if (department != null) data['department'] = department;
    if (rollNumber != null) data['rollNumber'] = rollNumber;

    await _firestore.collection('users').doc(uid).update(data);
  }
}
