import '../config/super_admin.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

class AppUser {
  final String uid;
  final String email;
  final String name;
  final String role; // 'admin' | 'member'
  final String department;
  final String rollNumber;
  final String postingId;
  final String teamId;
  final bool isTeamHead;
  final bool isActive;
  final List<String> permissions;
  final bool isGuest; // true if external user

  AppUser({
    required this.uid,
    required this.email,
    required this.name,
    this.role = 'member',
    this.department = '',
    this.rollNumber = '',
    this.postingId = '',
    this.teamId = '',
    this.isTeamHead = false,
    this.isActive = true,
    this.permissions = const [],
    this.isGuest = false,
  });

  bool get isAdmin => 
      role.toLowerCase() == 'admin' || 
      isSuperAdminEmail(email) || 
      permissions.contains('adminAccess');

  bool get isAuthorizedMember =>
      isAdmin ||
      isTeamHead ||
      (role.toLowerCase() == 'member' && !isGuest);

  factory AppUser.fromMap(Map<String, dynamic> data, String documentId) {
    final emailVal = data['email'] ?? '';
    final roleVal = data['role'] ?? ((isSuperAdminEmail(emailVal.toString())) ? 'admin' : 'member');
    final isHeadVal = data['isTeamHead'] ?? false;
    final guestRaw = data['isGuest'] ?? false;
    final isAdminUser = roleVal.toString().toLowerCase() == 'admin' ||
        isSuperAdminEmail(emailVal.toString()) ||
        (data['permissions'] as List? ?? []).contains('adminAccess');

    return AppUser(
      uid: documentId,
      email: emailVal,
      name: data['name'] ?? '',
      role: roleVal,
      department: data['department'] ?? '',
      rollNumber: data['rollNumber'] ?? '',
      postingId: data['postingId'] ?? '',
      teamId: data['teamId'] ?? '',
      isTeamHead: isHeadVal,
      isActive: data['isActive'] ?? true,
      permissions: List<String>.from(data['permissions'] ?? []),
      isGuest: (isAdminUser || isHeadVal) ? false : guestRaw,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'email': email,
      'name': name,
      'role': role,
      'department': department,
      'rollNumber': rollNumber,
      'postingId': postingId,
      'teamId': teamId,
      'isTeamHead': isTeamHead,
      'isActive': isActive,
      'permissions': permissions,
    };
  }

  bool hasPermission(String permission) {
    if (isAdmin) return true;
    return permissions.contains(permission);
  }
}

class BoardMember {
  final String id;
  final String name;
  final String email;
  final String rollNumber;
  final String department;
  final String position;
  final bool isHead;
  final DateTime? createdAt;

  BoardMember({
    required this.id,
    required this.name,
    required this.email,
    required this.rollNumber,
    required this.department,
    this.position = '',
    this.isHead = false,
    this.createdAt,
  });

  factory BoardMember.fromMap(Map<String, dynamic> data, String documentId) {
    return BoardMember(
      id: documentId,
      name: data['name'] ?? '',
      email: data['email'] ?? '',
      rollNumber: data['rollNumber'] ?? '',
      department: data['department'] ?? 'General',
      position: data['position'] ?? '',
      isHead: data['isHead'] ?? false,
      createdAt: (data['createdAt'] as Timestamp?)?.toDate(),
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'name': name,
      'email': email,
      'rollNumber': rollNumber,
      'department': department,
      'position': position,
      'isHead': isHead,
    };
  }
}

class MeetingModel {
  final String id;
  final String meetingCode;
  final String title;
  final String agenda;
  final String meetingType; // 'instant' | 'scheduled'
  final DateTime? scheduledAt;
  final String hostUid;
  final String hostName;
  final String hostEmail;
  final String status; // 'waiting' | 'recording' | 'processing' | 'completed'
  final List<String> selectedDepartments;
  final List<String> invitedMemberUids;
  final List<Map<String, String>> externalParticipants;
  final String presidingOfficer;
  final String presidingOfficerDesignation;
  final int boardStrength;
  final DateTime? createdAt;

  MeetingModel({
    required this.id,
    required this.meetingCode,
    required this.title,
    required this.agenda,
    required this.meetingType,
    this.scheduledAt,
    required this.hostUid,
    required this.hostName,
    required this.hostEmail,
    required this.status,
    this.selectedDepartments = const [],
    this.invitedMemberUids = const [],
    this.externalParticipants = const [],
    this.presidingOfficer = '',
    this.presidingOfficerDesignation = '',
    this.boardStrength = 0,
    this.createdAt,
  });

  factory MeetingModel.fromMap(Map<String, dynamic> data, String documentId) {
    List<Map<String, String>> extList = [];
    if (data['externalParticipants'] is List) {
      extList = (data['externalParticipants'] as List).map((item) {
        if (item is Map) {
          return {
            'name': item['name']?.toString() ?? '',
            'email': item['email']?.toString() ?? '',
          };
        }
        return {'name': '', 'email': ''};
      }).toList();
    }

    return MeetingModel(
      id: documentId,
      meetingCode: data['meetingCode'] ?? '',
      title: data['title'] ?? '',
      agenda: data['agenda'] ?? '',
      meetingType: data['meetingType'] ?? 'instant',
      scheduledAt: (data['scheduledAt'] as Timestamp?)?.toDate(),
      hostUid: data['hostUid'] ?? '',
      hostName: data['hostName'] ?? 'Host',
      hostEmail: data['hostEmail'] ?? '',
      status: data['status'] ?? 'waiting',
      selectedDepartments: List<String>.from(data['selectedDepartments'] ?? []),
      invitedMemberUids: List<String>.from(data['invitedMemberUids'] ?? []),
      externalParticipants: extList,
      presidingOfficer: data['presidingOfficer'] ?? '',
      presidingOfficerDesignation: data['presidingOfficerDesignation'] ?? '',
      boardStrength: (data['boardStrength'] is num) ? (data['boardStrength'] as num).toInt() : 0,
      createdAt: (data['createdAt'] as Timestamp?)?.toDate(),
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'meetingCode': meetingCode,
      'title': title,
      'agenda': agenda,
      'meetingType': meetingType,
      'scheduledAt': scheduledAt != null ? Timestamp.fromDate(scheduledAt!) : null,
      'hostUid': hostUid,
      'hostName': hostName,
      'hostEmail': hostEmail,
      'status': status,
      'selectedDepartments': selectedDepartments,
      'invitedMemberUids': invitedMemberUids,
      'externalParticipants': externalParticipants,
      'presidingOfficer': presidingOfficer,
      'presidingOfficerDesignation': presidingOfficerDesignation,
      'boardStrength': boardStrength,
    };
  }
}

class Team {
  final String id;
  final String name;

  Team({required this.id, required this.name});

  factory Team.fromMap(Map<String, dynamic> data, String documentId) {
    return Team(
      id: documentId,
      name: data['name'] ?? '',
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'name': name,
    };
  }
}

class Posting {
  final String id;
  final String title;
  final List<String> defaultPermissions;

  Posting({required this.id, required this.title, required this.defaultPermissions});

  factory Posting.fromMap(Map<String, dynamic> data, String documentId) {
    return Posting(
      id: documentId,
      title: data['title'] ?? '',
      defaultPermissions: List<String>.from(data['defaultPermissions'] ?? []),
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'title': title,
      'defaultPermissions': defaultPermissions,
    };
  }
}

class TranscriptSegment {
  final String id;
  final String meetingId;
  final String speakerName;
  final String text;
  final int sequenceNumber;
  final DateTime? createdAt;

  TranscriptSegment({
    required this.id,
    required this.meetingId,
    required this.speakerName,
    required this.text,
    required this.sequenceNumber,
    this.createdAt,
  });

  factory TranscriptSegment.fromMap(Map<String, dynamic> data, String documentId) {
    return TranscriptSegment(
      id: documentId,
      meetingId: data['meetingId'] ?? '',
      speakerName: data['speakerName'] ?? 'Unknown',
      text: data['text'] ?? '',
      sequenceNumber: data['sequenceNumber'] ?? 0,
      createdAt: (data['createdAt'] as Timestamp?)?.toDate(),
    );
  }
}
