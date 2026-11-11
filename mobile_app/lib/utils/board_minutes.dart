// Pure report data rules: no database writes or invented meeting values.
class BoardAttendance {
  final int? present;
  const BoardAttendance(this.present);
  int? get absent => present == null ? null : 22 - present!;
  String get status => present == null
      ? 'UNAVAILABLE'
      : present! >= 13
      ? 'QUORUM MET'
      : 'QUORUM NOT MET';
  factory BoardAttendance.fromRecords(List<Map<String, dynamic>>? records) {
    if (records == null) return const BoardAttendance(null);
    final identities = <String>{};
    for (final record in records) {
      if (record['joinedAt'] == null) return const BoardAttendance(null);
      String? identity;
      for (final field in ['uid', 'email', 'displayName']) {
        final value = record[field];
        if (value is String && value.trim().isNotEmpty) {
          identity = '$field:${field == 'uid' ? value.trim() : value.trim().toLowerCase()}';
          break;
        }
      }
      if (identity == null) return const BoardAttendance(null);
      identities.add(identity);
    }
    return BoardAttendance(identities.length <= 22 ? identities.length : null);
  }
}

DateTime? reportDate(dynamic value) {
  try {
    if (value is DateTime) return value.toUtc();
    if (value is String) return DateTime.tryParse(value)?.toUtc();
    if (value != null) return (value.toDate() as DateTime).toUtc();
  } catch (_) {}
  return null;
}

// The existing meeting calendar is Indian Standard Time; convert, do not relabel UTC.
DateTime? reportIst(dynamic value) =>
    reportDate(value)?.add(const Duration(hours: 5, minutes: 30));
String reportText(dynamic value) =>
    value is String && value.trim().isNotEmpty ? value.trim() : 'Not available';
