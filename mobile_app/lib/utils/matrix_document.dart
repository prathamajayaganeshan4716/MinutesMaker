import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

import 'board_minutes.dart';

pw.Widget _pageBorder(pw.Context context) => pw.FullPage(
  ignoreMargins: true,
  child: pw.Container(
    margin: const pw.EdgeInsets.all(24),
    decoration: pw.BoxDecoration(border: pw.Border.all(width: 1.3)),
  ),
);

pw.Document buildMatrixDocument({
  required Map<String, dynamic> meeting,
  required String title,
  required String dateStr,
  required String timeCommenced,
  required String timeAdjourned,
  required String presidingOfficerFullText,
  required BoardAttendance attendance,
  required String transcriptText,
  pw.ImageProvider? logoImage,
}) {
  final pdf = pw.Document();
  const totalBoardStrength = 22;
  pdf.addPage(
    pw.MultiPage(
      pageTheme: pw.PageTheme(
        pageFormat: PdfPageFormat.a4,
        margin: pw.EdgeInsets.all(40),
        theme: pw.ThemeData.withFont(
          base: pw.Font.times(),
          bold: pw.Font.timesBold(),
        ),
        buildBackground: _pageBorder,
      ),
      build: (pw.Context context) {
        return [
          // Header Section
          pw.Center(
            child: logoImage != null
                ? pw.Image(
                    logoImage,
                    width: 370,
                    height: 110,
                    fit: pw.BoxFit.contain,
                  )
                : pw.Text(
                    'MATRIX',
                    style: pw.TextStyle(
                      fontSize: 40,
                      fontWeight: pw.FontWeight.bold,
                    ),
                  ),
          ),
          pw.SizedBox(height: 60),

          // Title
          pw.Center(
            child: pw.Text(
              'OFFICIAL BOARD MEETING MINUTES',
              style: pw.TextStyle(fontSize: 12, fontWeight: pw.FontWeight.bold),
            ),
          ),

          pw.SizedBox(height: 40),

          // Metadata
          pw.Padding(
            padding: const pw.EdgeInsets.only(left: 20),
            child: pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              children: [
                pw.RichText(
                  text: pw.TextSpan(
                    children: [
                      pw.TextSpan(
                        text: 'Meeting Type: ',
                        style: pw.TextStyle(fontWeight: pw.FontWeight.bold),
                      ),
                      pw.TextSpan(text: title),
                    ],
                  ),
                ),
                pw.SizedBox(height: 8),
                pw.RichText(
                  text: pw.TextSpan(
                    children: [
                      pw.TextSpan(
                        text: 'Date: ',
                        style: pw.TextStyle(fontWeight: pw.FontWeight.bold),
                      ),
                      pw.TextSpan(text: dateStr),
                    ],
                  ),
                ),
                pw.SizedBox(height: 8),
                pw.RichText(
                  text: pw.TextSpan(
                    children: [
                      pw.TextSpan(
                        text: 'Time Commenced: ',
                        style: pw.TextStyle(fontWeight: pw.FontWeight.bold),
                      ),
                      pw.TextSpan(text: timeCommenced),
                    ],
                  ),
                ),
                pw.SizedBox(height: 8),
                pw.RichText(
                  text: pw.TextSpan(
                    children: [
                      pw.TextSpan(
                        text: 'Time Adjourned: ',
                        style: pw.TextStyle(fontWeight: pw.FontWeight.bold),
                      ),
                      pw.TextSpan(text: timeAdjourned),
                    ],
                  ),
                ),
                pw.SizedBox(height: 8),
                pw.RichText(
                  text: pw.TextSpan(
                    children: [
                      pw.TextSpan(
                        text: 'Presiding Officer: ',
                        style: pw.TextStyle(fontWeight: pw.FontWeight.bold),
                      ),
                      pw.TextSpan(text: presidingOfficerFullText),
                    ],
                  ),
                ),
              ],
            ),
          ),

          pw.SizedBox(height: 30),

          // Section 1
          pw.Padding(
            padding: const pw.EdgeInsets.only(left: 20),
            child: pw.Text(
              'SECTION 1 — ATTENDANCE & QUORUM',
              style: pw.TextStyle(fontWeight: pw.FontWeight.bold),
            ),
          ),

          pw.SizedBox(height: 20),

          // Keep every row in the same table so the central border stays aligned.
        pw.Center(child: pw.Container(width: 265, child: pw.Table(
          border: pw.TableBorder.all(width: 1),
          columnWidths: const {0: pw.FlexColumnWidth(), 1: pw.FlexColumnWidth()},
          children: [
            ['Parameter', 'Details'],
            ['Total Board Strength', '$totalBoardStrength Members'],
            ['Quorum Requirement', 'Minimum 13 Members'],
            ['Members Present', attendance.present == null ? 'Not available' : '${attendance.present} Members'],
            ['Members Absent', attendance.absent == null ? 'Not available' : '${attendance.absent} Members'],
            ['Quorum Status', attendance.status],
          ].asMap().entries.map((row) => pw.TableRow(children: row.value.map((text) => pw.Padding(
            padding: const pw.EdgeInsets.all(8),
            child: pw.Center(child: pw.Text(text, textAlign: pw.TextAlign.center,
              style: pw.TextStyle(fontWeight: row.key == 0 || row.key == 5 ? pw.FontWeight.bold : pw.FontWeight.normal))),
          )).toList())).toList(),
        ))),

        pw.NewPage(),

          if (meeting['summary'] != null && meeting['summary'] != 'N/A') ...[
            pw.Text(
              'Executive Summary',
              style: pw.TextStyle(fontSize: 18, fontWeight: pw.FontWeight.bold),
            ),
            pw.Divider(),
            pw.SizedBox(height: 10),
            pw.Text(meeting['summary']),
            pw.SizedBox(height: 20),
          ],

          if (meeting['decisions'] != null &&
              meeting['decisions'] != 'N/A') ...[
            pw.Text(
              'Key Decisions',
              style: pw.TextStyle(fontSize: 18, fontWeight: pw.FontWeight.bold),
            ),
            pw.Divider(),
            pw.SizedBox(height: 10),
            pw.Text(meeting['decisions']),
            pw.SizedBox(height: 20),
          ],

          if (meeting['actionItems'] != null &&
              meeting['actionItems'] != 'N/A') ...[
            pw.Text(
              'Action Items',
              style: pw.TextStyle(fontSize: 18, fontWeight: pw.FontWeight.bold),
            ),
            pw.Divider(),
            pw.SizedBox(height: 10),
            pw.Text(meeting['actionItems']),
            pw.SizedBox(height: 20),
          ],

          if (meeting['conclusion'] != null &&
              meeting['conclusion'] != 'N/A') ...[
            pw.Text(
              'Conclusion',
              style: pw.TextStyle(fontSize: 18, fontWeight: pw.FontWeight.bold),
            ),
            pw.Divider(),
            pw.SizedBox(height: 10),
            pw.Text(meeting['conclusion']),
            pw.SizedBox(height: 20),
          ],

          pw.Text(
            'Full Transcript',
            style: pw.TextStyle(fontSize: 18, fontWeight: pw.FontWeight.bold),
          ),
          pw.Divider(),
          pw.SizedBox(height: 10),
          pw.Text(
            transcriptText.isNotEmpty
                ? transcriptText
                : 'No transcript recorded.',
          ),
        ];
      },
    ),
  );

  return pdf;
}
