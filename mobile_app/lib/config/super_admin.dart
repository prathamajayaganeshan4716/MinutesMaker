const superAdminEmails = <String>{
  'prathamaj@karunya.edu.in',
  'matrixkarunya@gmail.com',
};

bool isSuperAdminEmail(String? email) =>
    superAdminEmails.contains((email ?? '').trim().toLowerCase());
