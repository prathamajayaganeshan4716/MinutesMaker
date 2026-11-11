import 'package:flutter/foundation.dart';
import 'meeting_leave_screen.dart';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'dart:math';
import '../services/webrtc_service.dart';
import '../services/recording_service.dart';
import '../services/firebase_service.dart';
import '../services/hf_ai_service.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

class MeetingRoomScreen extends StatefulWidget {
  final String meetingId;
  final String userName;

  const MeetingRoomScreen({super.key, required this.meetingId, required this.userName});

  @override
  State<MeetingRoomScreen> createState() => _MeetingRoomScreenState();
}

class _MeetingRoomScreenState extends State<MeetingRoomScreen> with TickerProviderStateMixin {
  final _webRTCService = WebRTCService();
  final _recordingService = RecordingService();
  final _firebaseService = FirebaseService();
  final _hfAiService = HfAiService();
  
  final RTCVideoRenderer _localRenderer = RTCVideoRenderer();
  final Map<String, RTCVideoRenderer> _remoteRenderers = {};
  
  bool _isMuted = true; // Start muted
  bool _isVideoOn = true; // Start with video on
  bool _isScreenSharing = false;
  bool _isUploadingChunk = false;
  bool _isCameraReady = false;
  Timer? _transcriptionTimer;
  String _latestTranscript = '';
  bool _showCaptionsOverlay = true;
  MediaStream? _screenStream;
  StreamSubscription? _chatSub;
  String? _chatPopupSender;
  String? _chatPopupMessage;
  Timer? _chatPopupTimer;
  int _unreadChatCount = 0;
  bool _isChatOpen = false;

  // For floating reactions
  final List<Widget> _floatingEmojis = [];

  // Participants list & real-time states
  final List<String> _presentMembers = [];
  final List<String> _absentMembers = [];
  late final String _myPeerId;
  StreamSubscription? _peersDataSub;
  final Map<String, Map<String, dynamic>> _peersData = {};
  bool _isGalleryView = false;
  String? _pinnedPeerId;
  final ScrollController _filmstripScrollController = ScrollController();

  String _getDisplayName(String id) {
    if (id.contains('_')) {
      return id.split('_').first;
    }
    return id;
  }

  @override
  void initState() {
    super.initState();
    final name = widget.userName.isEmpty ? 'Guest' : widget.userName;
    _myPeerId = '${name}_${DateTime.now().millisecondsSinceEpoch}';
    
    _initRenderers();
    
    // Add current user to present
    _presentMembers.add(_myPeerId);
    
    // Fetch actual expected participants from the meeting document
    _fetchExpectedParticipants();

    // Listen for incoming chat messages to show popup
    _listenForChatMessages();

    // Listen to real-time peer media states
    _listenToPeersData();
  }

  void _listenToPeersData() {
    _peersDataSub = FirebaseFirestore.instance
        .collection('meetings')
        .doc(widget.meetingId)
        .collection('peers')
        .snapshots()
        .listen((snapshot) {
      if (!mounted) return;
      setState(() {
        _peersData.clear();
        for (var doc in snapshot.docs) {
          _peersData[doc.id] = doc.data();
        }
      });
    });
  }

  Future<void> _fetchExpectedParticipants() async {
    try {
      final doc = await FirebaseFirestore.instance.collection('meetings').doc(widget.meetingId).get();
      if (doc.exists && doc.data() != null) {
        final data = doc.data()!;
        final String participantsStr = data['participants'] ?? '';
        if (participantsStr.isNotEmpty) {
          final List<String> expected = participantsStr.split(',').map((e) => e.trim()).where((e) => e.isNotEmpty).toList();
          setState(() {
            for (String p in expected) {
              if (p.toLowerCase() != _getDisplayName(_myPeerId).toLowerCase() && 
                  !_presentMembers.map((m) => _getDisplayName(m).toLowerCase()).contains(p.toLowerCase()) && 
                  !_absentMembers.contains(p)) {
                _absentMembers.add(p);
              }
            }
          });
        }
      }
    } catch (e) {
      print("Error fetching participants: $e");
    }
  }

  Future<void> _initRenderers() async {
    await _localRenderer.initialize();
    
    _webRTCService.onPeerJoined = (peerId) {
      setState(() {
        if (!_presentMembers.contains(peerId)) {
           _presentMembers.add(peerId);
           _absentMembers.remove(peerId);
        }
      });
    };

    _webRTCService.onPeerLeft = (peerId) {
      setState(() {
        _presentMembers.remove(peerId);
      });
    };

    _webRTCService.onRemoteStreamAdded = (peerId, renderer) {
      setState(() {
        _remoteRenderers[peerId] = renderer;
      });
    };
    
    _webRTCService.onRemoteStreamRemoved = (peerId) {
      setState(() {
        _remoteRenderers.remove(peerId);
      });
    };

    _localRenderer.muted = true; // Prevent local audio echo
    await _webRTCService.joinMeeting(widget.meetingId, _myPeerId);
    try {
      await _firebaseService.updateMeetingStatus(widget.meetingId, 'recording');
      await _firebaseService.recordAttendance(widget.meetingId, widget.userName);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Meeting metadata or attendance could not be saved. The report may be incomplete.')));
      }
    }
    
    setState(() {
      if (_webRTCService.localStream != null) {
        _localRenderer.srcObject = _webRTCService.localStream;
      }
      _isCameraReady = true;
    });
    
    _updatePeerMediaState();
    
    // Auto-start recording as soon as the camera is ready
    if (_isMuted) {
      _toggleMute();
    }
  }

  Future<void> _updatePeerMediaState() async {
    try {
      await FirebaseFirestore.instance
          .collection('meetings')
          .doc(widget.meetingId)
          .collection('peers')
          .doc(_myPeerId)
          .set({
            'peerId': _myPeerId,
            'displayName': widget.userName.isEmpty ? 'Guest' : widget.userName,
            'isMuted': _isMuted,
            'isVideoOff': !_isVideoOn,
            'isScreenSharing': _isScreenSharing,
            'updatedAt': FieldValue.serverTimestamp(),
          }, SetOptions(merge: true));
    } catch (e) {
      print("Error updating peer media state: $e");
    }
  }

  void _startTranscriptionTimer() {
    _transcriptionTimer?.cancel();
    _transcriptionTimer = Timer.periodic(const Duration(seconds: 25), (timer) async {
      if (!_isMuted && _localRenderer.srcObject != null) {
        await _sliceAndTranscribeChunk();
      }
    });
  }

  void _stopTranscriptionTimer() {
    _transcriptionTimer?.cancel();
    _transcriptionTimer = null;
  }

  Future<void> _sliceAndTranscribeChunk() async {
    if (_isUploadingChunk) return;
    try {
      final fileData = await _recordingService.stopRecording();
      if (!_isMuted && _localRenderer.srcObject != null) {
        await _recordingService.startRecording(_localRenderer.srcObject!, widget.meetingId);
      }
      if (fileData != null && fileData['bytes'] != null) {
        if (mounted) setState(() => _isUploadingChunk = true);
        final chunkText = await _hfAiService.transcribeChunk(fileData['bytes']);
        if (chunkText != null && chunkText.trim().isNotEmpty) {
          final speaker = widget.userName.isEmpty ? 'Speaker' : widget.userName;
          await _firebaseService.addTranscriptSegment(widget.meetingId, {
            'meetingId': widget.meetingId,
            'speakerName': speaker,
            'text': chunkText.trim(),
            'sequenceNumber': DateTime.now().millisecondsSinceEpoch,
          });
          if (mounted) {
            setState(() {
              _latestTranscript = '$speaker: ${chunkText.trim()}';
            });
          }
        }
      }
    } catch (e) {
      print("[MeetingRoom] Periodic transcription error: $e");
    } finally {
      if (mounted) setState(() => _isUploadingChunk = false);
    }
  }

  Future<void> _toggleMute() async {
    final nextMutedState = !_isMuted;
    if (_localRenderer.srcObject != null) {
      for (var track in _localRenderer.srcObject!.getAudioTracks()) {
        track.enabled = !nextMutedState;
      }
    }
    if (_webRTCService.localStream != null) {
      for (var track in _webRTCService.localStream!.getAudioTracks()) {
        track.enabled = !nextMutedState;
      }
    }
    
    setState(() => _isMuted = nextMutedState);
    _updatePeerMediaState();

    if (!nextMutedState) {
      // Unmuted - start recording and periodic chunk timer
      if (_localRenderer.srcObject != null) {
        await _recordingService.startRecording(_localRenderer.srcObject!, widget.meetingId);
        await _firebaseService.updateMeetingStatus(widget.meetingId, 'recording');
      }
      _startTranscriptionTimer();
    } else {
      // Muted - stop timer and process current audio chunk
      _stopTranscriptionTimer();
      await _sliceAndTranscribeChunk();
    }
  }

  void _toggleVideo() {
    final nextVideoState = !_isVideoOn;
    if (_localRenderer.srcObject != null) {
      for (var track in _localRenderer.srcObject!.getVideoTracks()) {
        track.enabled = nextVideoState;
      }
    }
    if (_webRTCService.localStream != null) {
      for (var track in _webRTCService.localStream!.getVideoTracks()) {
        track.enabled = nextVideoState;
      }
    }
    setState(() => _isVideoOn = nextVideoState);
    _updatePeerMediaState();
  }

  Future<void> _toggleScreenShare() async {
    try {
      if (_isScreenSharing) {
        // Stop screen sharing and revert to camera
        await _webRTCService.revertToCameraTrack();
        if (_screenStream != null) {
          for (var track in _screenStream!.getTracks()) {
            track.stop();
          }
          await _screenStream!.dispose();
          _screenStream = null;
        }
        _localRenderer.srcObject = _webRTCService.localStream;
        setState(() {
          _isScreenSharing = false;
        });
        _updatePeerMediaState();
      } else {
        // Start screen sharing
        final Map<String, dynamic> mediaConstraints = {
          'audio': false,
          'video': {
            'cursor': 'always',
          }
        };
        final stream = await navigator.mediaDevices.getDisplayMedia(mediaConstraints);
        _screenStream = stream;
        final screenTrack = stream.getVideoTracks().firstOrNull;
        if (screenTrack != null) {
          screenTrack.onEnded = () {
            if (_isScreenSharing && mounted) {
              _toggleScreenShare();
            }
          };
          await _webRTCService.replaceVideoTrack(screenTrack);
        }
        _localRenderer.srcObject = stream;
        setState(() {
          _isScreenSharing = true;
          _isVideoOn = true;
        });
        _updatePeerMediaState();
      }
    } catch (e) {
      print("[MeetingRoom] Error toggling screen share: $e");
    }
  }

  void _showParticipants() {
    final localDisplayName = widget.userName.trim().isEmpty ? 'Guest' : widget.userName.trim();

    // Deduplicate remote participants by display name
    final Map<String, Map<String, dynamic>> uniqueRemotePeers = {};
    for (var entry in _peersData.entries) {
      final pId = entry.key;
      if (pId == _myPeerId) continue;
      final data = entry.value;
      final dName = (data['displayName'] as String?)?.trim() ?? _getDisplayName(pId);
      if (dName.toLowerCase() == localDisplayName.toLowerCase()) continue;
      uniqueRemotePeers[dName.toLowerCase()] = {
        'peerId': pId,
        'displayName': dName,
        'isMuted': data['isMuted'] == true,
        'isVideoOff': data['isVideoOff'] == true,
        'isScreenSharing': data['isScreenSharing'] == true,
      };
    }

    // Include connected remote renderers if not in peersData yet
    for (var pId in _remoteRenderers.keys) {
      final dName = _getDisplayName(pId);
      if (dName.toLowerCase() == localDisplayName.toLowerCase()) continue;
      if (!uniqueRemotePeers.containsKey(dName.toLowerCase())) {
        uniqueRemotePeers[dName.toLowerCase()] = {
          'peerId': pId,
          'displayName': dName,
          'isMuted': false,
          'isVideoOff': false,
          'isScreenSharing': false,
        };
      }
    }

    final presentList = uniqueRemotePeers.values.toList();
    final totalPresent = 1 + presentList.length;

    // Filter absent members so nobody present is shown as absent
    final presentNamesLower = <String>{
      localDisplayName.toLowerCase(),
      ...presentList.map((p) => (p['displayName'] as String).toLowerCase())
    };
    final filteredAbsent = _absentMembers
        .where((a) => !presentNamesLower.contains(a.toLowerCase()))
        .toSet()
        .toList();

    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF1E222A),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (context) {
        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(color: Colors.white24, borderRadius: BorderRadius.circular(2)),
                ),
              ),
              const SizedBox(height: 14),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text("Participants", style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(color: Colors.blueAccent.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(12)),
                    child: Text("$totalPresent in meeting", style: const TextStyle(color: Colors.blueAccent, fontSize: 12, fontWeight: FontWeight.bold)),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Expanded(
                child: ListView(
                  children: [
                    Text("In Meeting ($totalPresent)", style: const TextStyle(color: Colors.white70, fontWeight: FontWeight.bold, fontSize: 13)),
                    const SizedBox(height: 8),
                    // Local user item
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: CircleAvatar(
                        backgroundColor: Colors.blueAccent,
                        child: Text(
                          localDisplayName.isNotEmpty ? localDisplayName[0].toUpperCase() : 'U',
                          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                        ),
                      ),
                      title: Row(
                        children: [
                          Flexible(
                            child: Text(
                              "$localDisplayName (You)",
                              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          const SizedBox(width: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(color: Colors.blue.withValues(alpha: 0.3), borderRadius: BorderRadius.circular(4)),
                            child: const Text("Host", style: TextStyle(color: Colors.lightBlueAccent, fontSize: 10, fontWeight: FontWeight.bold)),
                          ),
                        ],
                      ),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (_isScreenSharing) ...[
                            const Icon(Icons.screen_share, color: Colors.greenAccent, size: 20),
                            const SizedBox(width: 10),
                          ],
                          Icon(_isMuted ? Icons.mic_off : Icons.mic, color: _isMuted ? Colors.redAccent : Colors.greenAccent, size: 20),
                          const SizedBox(width: 10),
                          Icon(_isVideoOn ? Icons.videocam : Icons.videocam_off, color: _isVideoOn ? Colors.blueAccent : Colors.redAccent, size: 20),
                        ],
                      ),
                    ),
                    // Remote unique users
                    ...presentList.map((p) {
                      final name = p['displayName'] as String;
                      final isMuted = p['isMuted'] as bool;
                      final isVideoOff = p['isVideoOff'] as bool;
                      final isScreenSharing = p['isScreenSharing'] as bool;
                      return ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: CircleAvatar(
                          backgroundColor: Colors.indigoAccent,
                          child: Text(
                            name.isNotEmpty ? name[0].toUpperCase() : 'P',
                            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                          ),
                        ),
                        title: Text(name, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w500)),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            if (isScreenSharing) ...[
                              const Icon(Icons.screen_share, color: Colors.greenAccent, size: 20),
                              const SizedBox(width: 10),
                            ],
                            Icon(isMuted ? Icons.mic_off : Icons.mic, color: isMuted ? Colors.redAccent : Colors.greenAccent, size: 20),
                            const SizedBox(width: 10),
                            Icon(isVideoOff ? Icons.videocam_off : Icons.videocam, color: isVideoOff ? Colors.redAccent : Colors.blueAccent, size: 20),
                          ],
                        ),
                      );
                    }),
                    if (filteredAbsent.isNotEmpty) ...[
                      const SizedBox(height: 20),
                      Text("Invited / Absent (${filteredAbsent.length})", style: const TextStyle(color: Colors.white54, fontWeight: FontWeight.bold, fontSize: 13)),
                      const SizedBox(height: 8),
                      ...filteredAbsent.map((a) => ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: const CircleAvatar(backgroundColor: Color(0xFF2C3240), child: Icon(Icons.person_outline, color: Colors.white54)),
                        title: Text(a, style: const TextStyle(color: Colors.white54)),
                        trailing: const Text("Not Joined", style: TextStyle(color: Colors.white38, fontSize: 12)),
                      )),
                    ],
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  void _showHostTools() {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF242424),
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            return Container(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text("Host Tools - Manage Participants", style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 16),
                  Expanded(
                    child: ListView(
                      children: _presentMembers.map((m) => ListTile(
                        title: Text(m, style: const TextStyle(color: Colors.white)),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            IconButton(icon: const Icon(Icons.mic_off, color: Colors.white54), onPressed: () {}),
                            IconButton(icon: const Icon(Icons.videocam_off, color: Colors.white54), onPressed: () {}),
                            PopupMenuButton<String>(
                              icon: const Icon(Icons.more_vert, color: Colors.white),
                              color: const Color(0xFF333333),
                              onSelected: (val) {
                                if (val == 'kick') {
                                  // Update modal state
                                  setModalState(() {
                                    _presentMembers.remove(m);
                                    _absentMembers.add(m);
                                  });
                                  // Update screen state
                                  setState(() {});
                                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("$m removed from meeting")));
                                }
                              },
                              itemBuilder: (context) => [
                                const PopupMenuItem(value: 'kick', child: Text("Kick out of meeting", style: TextStyle(color: Colors.red))),
                              ],
                            ),
                          ],
                        ),
                      )).toList(),
                    ),
                  )
                ],
              ),
            );
          }
        );
      }
    );
  }

  void _listenForChatMessages() {
    final joinTime = DateTime.now().subtract(const Duration(seconds: 3));
    _chatSub = FirebaseFirestore.instance
        .collection('meetings')
        .doc(widget.meetingId)
        .collection('chats')
        .orderBy('timestamp', descending: true)
        .limit(1)
        .snapshots()
        .listen((snapshot) {
      if (snapshot.docs.isNotEmpty) {
        final data = snapshot.docs.first.data();
        final sender = data['sender'] as String? ?? 'Anonymous';
        final text = data['text'] as String? ?? '';
        final timestamp = data['timestamp'] as Timestamp?;
        
        if (sender.toLowerCase() != widget.userName.toLowerCase()) {
          if (timestamp != null && timestamp.toDate().isAfter(joinTime)) {
            _showIncomingMessagePopup(sender, text);
          }
        }
      }
    });
  }

  void _showIncomingMessagePopup(String sender, String text) {
    if (_isChatOpen) return;
    setState(() {
      _unreadChatCount++;
      _chatPopupSender = sender;
      _chatPopupMessage = text;
    });

    _chatPopupTimer?.cancel();
    _chatPopupTimer = Timer(const Duration(seconds: 5), () {
      if (mounted) {
        setState(() {
          _chatPopupSender = null;
          _chatPopupMessage = null;
        });
      }
    });
  }

  void _showChat() {
    setState(() {
      _isChatOpen = true;
      _unreadChatCount = 0;
      _chatPopupMessage = null;
      _chatPopupSender = null;
    });
    final TextEditingController _chatController = TextEditingController();
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF242424),
      builder: (context) {
        return Padding(
          padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
          child: Container(
            height: 400,
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                const Text("Meeting Chat", style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                const SizedBox(height: 16),
                Expanded(
                  child: StreamBuilder<QuerySnapshot>(
                    stream: FirebaseFirestore.instance.collection('meetings').doc(widget.meetingId).collection('chats').orderBy('timestamp', descending: true).snapshots(),
                    builder: (context, snapshot) {
                      if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
                      final docs = snapshot.data!.docs;
                      if (docs.isEmpty) return const Center(child: Text("No messages yet.", style: TextStyle(color: Colors.white54)));
                      
                      return ListView.builder(
                        reverse: true,
                        itemCount: docs.length,
                        itemBuilder: (context, index) {
                          final data = docs[index].data() as Map<String, dynamic>;
                          final isMe = data['sender'] == widget.userName;
                          return Align(
                            alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
                            child: Container(
                              margin: const EdgeInsets.symmetric(vertical: 4),
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                              decoration: BoxDecoration(
                                color: isMe ? Colors.blue : const Color(0xFF333333),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  if (!isMe) Text(data['sender'] ?? 'Unknown', style: const TextStyle(color: Colors.white70, fontSize: 10)),
                                  Text(data['text'] ?? '', style: const TextStyle(color: Colors.white)),
                                ],
                              ),
                            ),
                          );
                        },
                      );
                    },
                  )
                ),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _chatController,
                        style: const TextStyle(color: Colors.white),
                        decoration: InputDecoration(
                          hintText: "Type message here...",
                          hintStyle: const TextStyle(color: Colors.white54),
                          filled: true,
                          fillColor: const Color(0xFF333333),
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(20), borderSide: BorderSide.none),
                          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                        ),
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.send, color: Colors.blue),
                      onPressed: () {
                        if (_chatController.text.trim().isNotEmpty) {
                          FirebaseFirestore.instance.collection('meetings').doc(widget.meetingId).collection('chats').add({
                            'text': _chatController.text.trim(),
                            'sender': widget.userName.isEmpty ? 'Anonymous' : widget.userName,
                            'timestamp': FieldValue.serverTimestamp(),
                          });
                          _chatController.clear();
                        }
                      },
                    )
                  ],
                )
              ],
            ),
          ),
        );
      }
).then((_) {
      if (mounted) setState(() => _isChatOpen = false);
    });
  }

  void _showTranscript() {
    final TextEditingController noteController = TextEditingController();
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF242424),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (context) {
        return Padding(
          padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
          child: Container(
            height: MediaQuery.of(context).size.height * 0.75,
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.white24, borderRadius: BorderRadius.circular(2))),
                const SizedBox(height: 12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.subtitles, color: Colors.amber, size: 22),
                        const SizedBox(width: 8),
                        const Text(
                          "Live Transcript",
                          style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
                        ),
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(color: Colors.red.withOpacity(0.2), borderRadius: BorderRadius.circular(4), border: Border.all(color: Colors.redAccent, width: 0.5)),
                          child: const Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              CircleAvatar(radius: 3, backgroundColor: Colors.red),
                              SizedBox(width: 4),
                              Text("LIVE", style: TextStyle(color: Colors.redAccent, fontSize: 10, fontWeight: FontWeight.bold)),
                            ],
                          ),
                        ),
                      ],
                    ),
                    IconButton(
                      icon: const Icon(Icons.copy, color: Colors.white70, size: 20),
                      tooltip: "Copy All Transcript",
                      onPressed: () async {
                        final segments = await _firebaseService.getTranscriptSegments(widget.meetingId);
                        if (segments.isEmpty) {
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("No transcript to copy yet")));
                          }
                          return;
                        }
                        final fullText = segments.map((s) => '${s['speakerName'] ?? 'Speaker'}: ${s['text'] ?? ''}').join('\n');
                        await Clipboard.setData(ClipboardData(text: fullText));
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Transcript copied to clipboard!")));
                        }
                      },
                    ),
                  ],
                ),
                const Divider(color: Colors.white24),
                const SizedBox(height: 8),
                Expanded(
                  child: StreamBuilder<QuerySnapshot>(
                    stream: FirebaseFirestore.instance
                        .collection('meetings')
                        .doc(widget.meetingId)
                        .collection('transcript_segments')
                        .orderBy('sequenceNumber', descending: false)
                        .snapshots(),
                    builder: (context, snapshot) {
                      if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
                      final docs = snapshot.data!.docs;
                      if (docs.isEmpty) {
                        return Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(Icons.mic_none, size: 48, color: Colors.white.withOpacity(0.3)),
                              const SizedBox(height: 12),
                              const Text("No transcript segments yet", style: TextStyle(color: Colors.white70, fontSize: 15, fontWeight: FontWeight.w600)),
                              const SizedBox(height: 6),
                              Text(
                                "Speak while unmuted to generate speech-to-text, or type a note below.",
                                textAlign: TextAlign.center,
                                style: TextStyle(color: Colors.white.withOpacity(0.4), fontSize: 12),
                              ),
                            ],
                          ),
                        );
                      }

                      return ListView.builder(
                        itemCount: docs.length,
                        itemBuilder: (context, index) {
                          final data = docs[index].data() as Map<String, dynamic>;
                          final speaker = data['speakerName'] ?? 'Speaker';
                          final text = data['text'] ?? '';
                          final isMe = speaker.toLowerCase() == widget.userName.toLowerCase();

                          return Container(
                            margin: const EdgeInsets.symmetric(vertical: 6),
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: isMe ? const Color(0xFF2C3E50).withOpacity(0.6) : const Color(0xFF1E1E1E),
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(color: isMe ? Colors.blue.withOpacity(0.3) : Colors.white10),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    CircleAvatar(
                                      radius: 10,
                                      backgroundColor: isMe ? Colors.blue : Colors.orange,
                                      child: Text(
                                        speaker.isNotEmpty ? speaker[0].toUpperCase() : '?',
                                        style: const TextStyle(fontSize: 11, color: Colors.white, fontWeight: FontWeight.bold),
                                      ),
                                    ),
                                    const SizedBox(width: 6),
                                    Text(
                                      speaker + (isMe ? ' (You)' : ''),
                                      style: TextStyle(
                                        color: isMe ? Colors.lightBlueAccent : Colors.orangeAccent,
                                        fontWeight: FontWeight.bold,
                                        fontSize: 13,
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  text,
                                  style: const TextStyle(color: Colors.white, fontSize: 14, height: 1.4),
                                ),
                              ],
                            ),
                          );
                        },
                      );
                    },
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: noteController,
                        style: const TextStyle(color: Colors.white, fontSize: 14),
                        decoration: InputDecoration(
                          hintText: "Add note / key point to transcript...",
                          hintStyle: TextStyle(color: Colors.white.withOpacity(0.4), fontSize: 13),
                          filled: true,
                          fillColor: const Color(0xFF1E1E1E),
                          isDense: true,
                          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide.none),
                        ),
                        onSubmitted: (val) async {
                          if (val.trim().isNotEmpty) {
                            final speaker = widget.userName.isEmpty ? 'Speaker' : widget.userName;
                            await _firebaseService.addTranscriptSegment(widget.meetingId, {
                              'meetingId': widget.meetingId,
                              'speakerName': speaker,
                              'text': val.trim(),
                              'sequenceNumber': DateTime.now().millisecondsSinceEpoch,
                            });
                            noteController.clear();
                          }
                        },
                      ),
                    ),
                    const SizedBox(width: 8),
                    CircleAvatar(
                      backgroundColor: const Color(0xFF640D14),
                      child: IconButton(
                        icon: const Icon(Icons.send, color: Colors.white, size: 18),
                        onPressed: () async {
                          if (noteController.text.trim().isNotEmpty) {
                            final speaker = widget.userName.isEmpty ? 'Speaker' : widget.userName;
                            await _firebaseService.addTranscriptSegment(widget.meetingId, {
                              'meetingId': widget.meetingId,
                              'speakerName': speaker,
                              'text': noteController.text.trim(),
                              'sequenceNumber': DateTime.now().millisecondsSinceEpoch,
                            });
                            noteController.clear();
                          }
                        },
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  void _showReactions() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) {
        return Container(
          margin: const EdgeInsets.all(16),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: const Color(0xFF333333), borderRadius: BorderRadius.circular(30)),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: ['👏', '👍', '❤️', '😂', '😮', '🎉'].map((emoji) => GestureDetector(
              onTap: () {
                Navigator.pop(context);
                _spawnEmoji(emoji);
              },
              child: Text(emoji, style: const TextStyle(fontSize: 32)),
            )).toList(),
          ),
        );
      }
    );
  }

  void _spawnEmoji(String emoji) {
    final key = UniqueKey();
    final startX = 50.0 + Random().nextInt(MediaQuery.of(context).size.width.toInt() - 100);
    
    setState(() {
      _floatingEmojis.add(
        _FloatingEmoji(
          key: key,
          emoji: emoji,
          startX: startX,
          onComplete: () {
            setState(() {
              _floatingEmojis.removeWhere((e) => e.key == key);
            });
          },
        )
      );
    });
  }

  Future<void> _endMeeting() async {
    await _firebaseService.updateMeetingStatus(widget.meetingId, 'processing');
    _stopTranscriptionTimer();
    if (!_isMuted) {
      await _toggleMute(); 
    }
    try {
      final segments = await _firebaseService.getTranscriptSegments(widget.meetingId);
      final fullTranscript = segments
          .map((s) => '${s['speakerName'] ?? 'Speaker'}: ${s['text'] ?? ''}')
          .join('\n');

      final summaryData = await _hfAiService.generateSummary(fullTranscript);
      await _firebaseService.completeMeeting(widget.meetingId, summaryData, transcript: fullTranscript);
    } catch (e) {
      print("Error ending meeting: $e");
    }
    if (mounted) {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => MeetingLeaveScreen(
            meetingId: widget.meetingId,
            userName: widget.userName,
          ),
        ),
      );
    }
  }

  @override
  void dispose() {
    _filmstripScrollController.dispose();
    _peersDataSub?.cancel();
    _chatSub?.cancel();
    _chatPopupTimer?.cancel();
    _screenStream?.dispose();
    _stopTranscriptionTimer();
    _localRenderer.dispose();
    _webRTCService.dispose();
    try {
      FirebaseFirestore.instance
          .collection('meetings')
          .doc(widget.meetingId)
          .collection('peers')
          .doc(_myPeerId)
          .delete()
          .catchError((_) => null);
    } catch (_) {}
    super.dispose();
  }

  Widget _buildChatIconButton() {
    return InkWell(
      onTap: _showChat,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          _buildIconButton(icon: Icons.chat_bubble_outline, label: "Chat", onPressed: _showChat),
          if (_unreadChatCount > 0)
            Positioned(
              right: 6,
              top: -2,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                decoration: BoxDecoration(
                  color: Colors.redAccent,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  '$_unreadChatCount',
                  style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildIconButton({
    required IconData icon, 
    required String label, 
    Color color = Colors.white, 
    VoidCallback? onPressed,
  }) {
    return InkWell(
      onTap: onPressed,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: color, size: 24),
          const SizedBox(height: 4),
          Text(label, style: TextStyle(color: color, fontSize: 10)),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF1C1C1C), 
      body: SafeArea(
        child: Column(
          children: [
            // Top Bar (Images 1 & 2 Inspired: Title, Live Status, View Switcher)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
              decoration: BoxDecoration(
                color: const Color(0xFF161922),
                border: Border(bottom: BorderSide(color: Colors.white.withValues(alpha: 0.08))),
              ),
              child: Row(
                children: [
                  // Left: Info / Copy Link Dialog
                  IconButton(
                    icon: const Icon(Icons.info_outline, color: Colors.white70, size: 22),
                    tooltip: 'Meeting Info & Code',
                    onPressed: () {
                      String origin = 'https://minutes-maker-peach.vercel.app';
                      if (kIsWeb) {
                        try {
                          final o = Uri.base.origin;
                          if (o.isNotEmpty && !o.contains('localhost')) {
                            origin = o;
                          }
                        } catch (_) {}
                      }
                      final link = '$origin/#/join?code=${widget.meetingId}';
                      showDialog(
                        context: context,
                        builder: (context) => AlertDialog(
                          backgroundColor: const Color(0xFF1E222D),
                          title: const Row(
                            children: [
                              Icon(Icons.link, color: Color(0xFF0E72ED)),
                              SizedBox(width: 8),
                              Text('Meeting Info & Code', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                            ],
                          ),
                          content: Column(
                            mainAxisSize: MainAxisSize.min,
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Meeting ID / Code: ${widget.meetingId}', style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.white)),
                              const SizedBox(height: 12),
                              const Text('Share this link to invite others:', style: TextStyle(color: Colors.white70)),
                              const SizedBox(height: 8),
                              Container(
                                padding: const EdgeInsets.all(10),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF12151D),
                                  borderRadius: BorderRadius.circular(8),
                                  border: Border.all(color: Colors.white12),
                                ),
                                child: SelectableText(link, style: const TextStyle(color: Colors.lightBlueAccent, fontSize: 13)),
                              ),
                            ],
                          ),
                          actions: [
                            TextButton(
                              onPressed: () => Navigator.pop(context),
                              child: const Text('Close', style: TextStyle(color: Colors.white60)),
                            ),
                            ElevatedButton.icon(
                              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF0E72ED), foregroundColor: Colors.white),
                              onPressed: () {
                                Clipboard.setData(ClipboardData(text: link));
                                Navigator.pop(context);
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(content: Text('Link copied to clipboard!')),
                                );
                              },
                              icon: const Icon(Icons.copy, size: 16),
                              label: const Text('Copy Link'),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
                  const SizedBox(width: 8),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Text(
                        'Online Meeting',
                        style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14),
                      ),
                      Text(
                        'ID: ${widget.meetingId}',
                        style: TextStyle(color: Colors.white.withValues(alpha: 0.5), fontSize: 11),
                      ),
                    ],
                  ),

                  const Spacer(),

                  // Center: Logo & Live Status
                  Image.asset(
                    'assets/images/connect_horizontal.png',
                    height: 24,
                    color: Colors.white,
                    errorBuilder: (context, error, stackTrace) => const Text(
                      'MINUTES MAKER',
                      style: TextStyle(fontWeight: FontWeight.bold, color: Colors.white, fontSize: 14),
                    ),
                  ),

                  const Spacer(),

                  // Right: View Mode Toggle Buttons (Speaker View vs Gallery View - Image 2 Style)
                  Container(
                    padding: const EdgeInsets.all(3),
                    decoration: BoxDecoration(
                      color: const Color(0xFF10121A),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: Colors.white12),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        // Speaker / Filmstrip View Button
                        InkWell(
                          onTap: () => setState(() => _isGalleryView = false),
                          borderRadius: BorderRadius.circular(8),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                            decoration: BoxDecoration(
                              color: !_isGalleryView ? const Color(0xFF0E72ED) : Colors.transparent,
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: const Row(
                              children: [
                                Icon(Icons.view_sidebar_rounded, color: Colors.white, size: 16),
                                SizedBox(width: 6),
                                Text('Speaker', style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
                              ],
                            ),
                          ),
                        ),
                        // Gallery Grid View Button
                        InkWell(
                          onTap: () => setState(() => _isGalleryView = true),
                          borderRadius: BorderRadius.circular(8),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                            decoration: BoxDecoration(
                              color: _isGalleryView ? const Color(0xFF0E72ED) : Colors.transparent,
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: const Row(
                              children: [
                                Icon(Icons.grid_view_rounded, color: Colors.white, size: 16),
                                SizedBox(width: 6),
                                Text('Gallery', style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(width: 14),

                  // Leave Meeting Button
                  ElevatedButton.icon(
                    onPressed: _endMeeting,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.red.shade700,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                    icon: const Icon(Icons.call_end, size: 16),
                    label: const Text('Leave', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                  ),
                ],
              ),
            ),
// Waiting Lobby Real-time Admission Banner
            StreamBuilder<QuerySnapshot>(
              stream: _firebaseService.streamWaitingLobby(widget.meetingId),
              builder: (context, snapshot) {
                if (!snapshot.hasData || snapshot.data!.docs.isEmpty) {
                  return const SizedBox.shrink();
                }
                final pendingDocs = snapshot.data!.docs;
                return Column(
                  children: pendingDocs.map((doc) {
                    final data = doc.data() as Map<String, dynamic>;
                    final guestName = data['name'] ?? 'Guest';
                    final guestEmail = data['email'] ?? '';
                    return Container(
                      color: Colors.amber.shade800,
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      child: Row(
                        children: [
                          const Icon(Icons.person_add, color: Colors.white, size: 20),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              '$guestName ($guestEmail) requested to join',
                              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          ElevatedButton(
                            style: ElevatedButton.styleFrom(backgroundColor: Colors.green, foregroundColor: Colors.white, visualDensity: VisualDensity.compact),
                            onPressed: () async {
                              await _firebaseService.updateLobbyStatus(widget.meetingId, doc.id, 'admitted');
                            },
                            child: const Text('Admit'),
                          ),
                          const SizedBox(width: 8),
                          OutlinedButton(
                            style: OutlinedButton.styleFrom(foregroundColor: Colors.white, side: const BorderSide(color: Colors.white), visualDensity: VisualDensity.compact),
                            onPressed: () async {
                              await _firebaseService.updateLobbyStatus(widget.meetingId, doc.id, 'denied');
                            },
                            child: const Text('Deny'),
                          ),
                        ],
                      ),
                    );
                  }).toList(),
                );
              },
            ),
            
            // Video Area
            Expanded(
              child: Stack(
                children: [
                  if (_isCameraReady)
                    Container(
                      width: double.infinity,
                      height: double.infinity,
                      color: Colors.black,
                      child: _buildVideoGrid(),
                    )
                  else
                    const Center(child: CircularProgressIndicator()),
                    
                  // Incoming Chat Message Floating Popup Banner
                  if (_chatPopupMessage != null)
                    Positioned(
                      top: 16,
                      left: 16,
                      right: 16,
                      child: Center(
                        child: Material(
                          color: Colors.transparent,
                          child: InkWell(
                            onTap: () {
                              setState(() {
                                _chatPopupMessage = null;
                                _chatPopupSender = null;
                              });
                              _showChat();
                            },
                            borderRadius: BorderRadius.circular(12),
                            child: Container(
                              constraints: const BoxConstraints(maxWidth: 450),
                              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                              decoration: BoxDecoration(
                                color: const Color(0xFF1E293B).withOpacity(0.95),
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(color: Colors.blueAccent.withOpacity(0.7), width: 1.5),
                                boxShadow: [
                                  BoxShadow(
                                    color: Colors.black.withOpacity(0.6),
                                    blurRadius: 12,
                                    offset: const Offset(0, 4),
                                  ),
                                ],
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const CircleAvatar(
                                    radius: 14,
                                    backgroundColor: Colors.blueAccent,
                                    child: Icon(Icons.chat_bubble, color: Colors.white, size: 14),
                                  ),
                                  const SizedBox(width: 10),
                                  Flexible(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        Text(
                                          _chatPopupSender ?? 'New Message',
                                          style: const TextStyle(color: Colors.lightBlueAccent, fontWeight: FontWeight.bold, fontSize: 12),
                                        ),
                                        Text(
                                          _chatPopupMessage ?? '',
                                          style: const TextStyle(color: Colors.white, fontSize: 13),
                                          maxLines: 2,
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                      ],
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                    decoration: BoxDecoration(color: Colors.blueAccent, borderRadius: BorderRadius.circular(6)),
                                    child: const Text('Reply', style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),

                  if (_isUploadingChunk)
                    const Positioned(
                      top: 16,
                      left: 0,
                      right: 0,
                      child: Center(
                        child: Chip(
                          backgroundColor: Colors.black87,
                          label: Text("Uploading audio chunk...", style: TextStyle(color: Colors.white, fontSize: 12)),
                          avatar: SizedBox(width: 12, height: 12, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2)),
                        ),
                      ),
                    ),
                    

                  
                  // Closed Captions (CC) Overlay Banner
                  if (_showCaptionsOverlay && _latestTranscript.isNotEmpty)
                    Positioned(
                      bottom: 24,
                      left: 16,
                      right: 16,
                      child: Center(
                        child: GestureDetector(
                          onTap: _showTranscript,
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                            decoration: BoxDecoration(
                              color: Colors.black.withOpacity(0.85),
                              borderRadius: BorderRadius.circular(20),
                              border: Border.all(color: Colors.amber.withOpacity(0.5)),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(Icons.closed_caption, color: Colors.amber, size: 20),
                                const SizedBox(width: 8),
                                Flexible(
                                  child: Text(
                                    _latestTranscript,
                                    style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w500),
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                                const SizedBox(width: 8),
                                GestureDetector(
                                  onTap: () => setState(() => _showCaptionsOverlay = false),
                                  child: const Icon(Icons.close, color: Colors.white54, size: 16),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),

                  // Floating Emojis Stack
                  ..._floatingEmojis,
                ],
              ),
            ),
            
            // Bottom Floating Dock Bar (Images 1 & 2 Inspired)
            Container(
              padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
              color: const Color(0xFF10121A),
              child: Center(
                child: Container(
                  constraints: const BoxConstraints(maxWidth: 800),
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  decoration: BoxDecoration(
                    color: const Color(0xFF1E222D).withValues(alpha: 0.95),
                    borderRadius: BorderRadius.circular(28),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.5),
                        blurRadius: 16,
                        offset: const Offset(0, 6),
                      ),
                    ],
                  ),
                  child: SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        // Audio Toggle
                        _buildDockCircleButton(
                          icon: _isMuted ? Icons.mic_off : Icons.mic,
                          label: _isMuted ? 'Muted' : 'Unmute',
                          bgColor: _isMuted ? Colors.red.shade800 : Colors.white12,
                          iconColor: _isMuted ? Colors.white : Colors.greenAccent,
                          onPressed: _isCameraReady ? _toggleMute : null,
                        ),
                        const SizedBox(width: 12),

                        // Video Toggle
                        _buildDockCircleButton(
                          icon: _isVideoOn ? Icons.videocam : Icons.videocam_off,
                          label: _isVideoOn ? 'Video On' : 'Video Off',
                          bgColor: !_isVideoOn ? Colors.red.shade800 : Colors.white12,
                          iconColor: Colors.white,
                          onPressed: _isCameraReady ? _toggleVideo : null,
                        ),
                        const SizedBox(width: 16),

                        // PROMINENT CENTER SCREEN SHARE BUTTON (Images 1 & 2 Green Style)
                        InkWell(
                          onTap: _isCameraReady ? _toggleScreenShare : null,
                          borderRadius: BorderRadius.circular(20),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 8),
                            decoration: BoxDecoration(
                              gradient: LinearGradient(
                                colors: _isScreenSharing
                                    ? [Colors.red.shade600, Colors.red.shade800]
                                    : [const Color(0xFF00C853), const Color(0xFF009624)],
                              ),
                              borderRadius: BorderRadius.circular(20),
                              boxShadow: [
                                BoxShadow(
                                  color: (_isScreenSharing ? Colors.red : const Color(0xFF00C853)).withValues(alpha: 0.4),
                                  blurRadius: 10,
                                  offset: const Offset(0, 4),
                                ),
                              ],
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(
                                  _isScreenSharing ? Icons.stop_screen_share : Icons.screen_share,
                                  color: Colors.white,
                                  size: 20,
                                ),
                                const SizedBox(width: 8),
                                Text(
                                  _isScreenSharing ? 'Stop Share' : 'Share Screen',
                                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13),
                                ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(width: 16),

                        // Participants with Counter
                        _buildDockCircleButton(
                          icon: Icons.people_alt_rounded,
                          label: 'People',
                          bgColor: Colors.white12,
                          iconColor: Colors.white70,
                          badgeCount: _presentMembers.length,
                          onPressed: _showParticipants,
                        ),
                        const SizedBox(width: 12),

                        // Chat Button with Unread Badge
                        _buildDockCircleButton(
                          icon: Icons.chat_bubble_outline_rounded,
                          label: 'Chat',
                          bgColor: Colors.white12,
                          iconColor: Colors.white70,
                          badgeCount: _unreadChatCount > 0 ? _unreadChatCount : null,
                          onPressed: _showChat,
                        ),
                        const SizedBox(width: 12),

                        // AI Transcript / CC Button
                        _buildDockCircleButton(
                          icon: Icons.subtitles_rounded,
                          label: 'Captions',
                          bgColor: Colors.white12,
                          iconColor: Colors.amberAccent,
                          onPressed: _showTranscript,
                        ),
                        const SizedBox(width: 12),

                        // Reactions Button
                        _buildDockCircleButton(
                          icon: Icons.favorite_border_rounded,
                          label: 'React',
                          bgColor: Colors.white12,
                          iconColor: Colors.pinkAccent,
                          onPressed: _showReactions,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDockCircleButton({
    required IconData icon,
    required String label,
    required Color bgColor,
    required Color iconColor,
    int? badgeCount,
    VoidCallback? onPressed,
  }) {
    return InkWell(
      onTap: onPressed,
      borderRadius: BorderRadius.circular(16),
      child: Stack(
        clipBehavior: Clip.none,
        alignment: Alignment.center,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            decoration: BoxDecoration(
              color: bgColor,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, color: iconColor, size: 18),
                const SizedBox(width: 6),
                Text(
                  label,
                  style: TextStyle(color: iconColor, fontSize: 12, fontWeight: FontWeight.w600),
                ),
              ],
            ),
          ),
          if (badgeCount != null)
            Positioned(
              top: -4,
              right: -4,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                decoration: BoxDecoration(
                  color: const Color(0xFF0E72ED),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  '$badgeCount',
                  style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildVideoGrid() {
    final allRenderers = [
      {'id': _myPeerId, 'renderer': _localRenderer, 'isLocal': true},
      ..._remoteRenderers.entries.map((e) => {'id': e.key, 'renderer': e.value, 'isLocal': false})
    ];

    // Determine if anyone is screen sharing
    Map<String, dynamic>? screenShareTile;
    if (_isScreenSharing) {
      for (var r in allRenderers) {
        if (r['isLocal'] == true) {
          screenShareTile = r;
          break;
        }
      }
    } else {
      for (var r in allRenderers) {
        if (r['isLocal'] == true) continue;
        final pData = _peersData[r['id']];
        if (pData?['isScreenSharing'] == true) {
          screenShareTile = r;
          break;
        }
      }
    }

    // --- GALLERY GRID VIEW (Image 2 Style) ---
    if (_isGalleryView && screenShareTile == null) {
      return LayoutBuilder(
        builder: (context, constraints) {
          final isLandscape = constraints.maxWidth >= constraints.maxHeight;
          final crossAxisCount = (allRenderers.length <= 2)
              ? (isLandscape ? 2 : 1)
              : (allRenderers.length <= 4 ? 2 : (isLandscape ? 3 : 2));

          return Container(
            color: const Color(0xFF0F1117),
            padding: const EdgeInsets.all(12),
            child: GridView.builder(
              gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: crossAxisCount,
                crossAxisSpacing: 12,
                mainAxisSpacing: 12,
                childAspectRatio: isLandscape ? 16 / 9 : 4 / 3,
              ),
              itemCount: allRenderers.length,
              itemBuilder: (context, index) {
                return _buildVideoTile(
                  allRenderers[index],
                  onPinTap: () {
                    setState(() {
                      _pinnedPeerId = allRenderers[index]['id'] as String?;
                      _isGalleryView = false;
                    });
                  },
                );
              },
            ),
          );
        },
      );
    }

    // --- SPEAKER & FILMSTRIP VIEW (Image 1 Style / Screen Share Spotlight) ---
    Map<String, dynamic> spotlightTile;
    if (screenShareTile != null) {
      spotlightTile = screenShareTile;
    } else if (_pinnedPeerId != null) {
      spotlightTile = allRenderers.firstWhere(
        (r) => r['id'] == _pinnedPeerId,
        orElse: () => allRenderers[0],
      );
    } else {
      // Find active speaker (unmuted)
      spotlightTile = allRenderers.firstWhere(
        (r) {
          if (r['isLocal'] == true) return !_isMuted;
          final pData = _peersData[r['id']];
          return pData?['isMuted'] == false;
        },
        orElse: () => allRenderers.length > 1 ? allRenderers[1] : allRenderers[0],
      );
    }

    final filmstripTiles = allRenderers.where((r) => r['id'] != spotlightTile['id']).toList();

    return Container(
      color: const Color(0xFF0F1117),
      child: Column(
        children: [
          // 1. TOP FILMSTRIP CAROUSEL (Image 1 Style: < arrow, thumbnails, > arrow)
          if (filmstripTiles.isNotEmpty)
            Container(
              height: 120,
              padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 8),
              decoration: BoxDecoration(
                color: const Color(0xFF161922),
                border: Border(bottom: BorderSide(color: Colors.white.withValues(alpha: 0.08))),
              ),
              child: Row(
                children: [
                  // Left Scroll Arrow Button (<)
                  IconButton(
                    icon: const Icon(Icons.arrow_back_ios_rounded, color: Colors.white70, size: 16),
                    onPressed: () {
                      _filmstripScrollController.animateTo(
                        (_filmstripScrollController.offset - 160).clamp(0.0, _filmstripScrollController.position.maxScrollExtent),
                        duration: const Duration(milliseconds: 300),
                        curve: Curves.easeOut,
                      );
                    },
                  ),
                  // Horizontal Carousel of Participant Thumbnails
                  Expanded(
                    child: ListView.separated(
                      controller: _filmstripScrollController,
                      scrollDirection: Axis.horizontal,
                      itemCount: filmstripTiles.length,
                      separatorBuilder: (context, index) => const SizedBox(width: 8),
                      itemBuilder: (context, index) {
                        final tile = filmstripTiles[index];
                        return SizedBox(
                          width: 145,
                          child: _buildVideoTile(
                            tile,
                            isThumbnail: true,
                            onPinTap: () {
                              setState(() => _pinnedPeerId = tile['id'] as String?);
                            },
                          ),
                        );
                      },
                    ),
                  ),
                  // Right Scroll Arrow Button (>)
                  IconButton(
                    icon: const Icon(Icons.arrow_forward_ios_rounded, color: Colors.white70, size: 16),
                    onPressed: () {
                      _filmstripScrollController.animateTo(
                        (_filmstripScrollController.offset + 160).clamp(0.0, _filmstripScrollController.position.maxScrollExtent),
                        duration: const Duration(milliseconds: 300),
                        curve: Curves.easeOut,
                      );
                    },
                  ),
                ],
              ),
            ),

          // 2. MAIN STAGE SPOTLIGHT CARD (Image 1 & 2 Style with Golden Active Speaker Border)
          Expanded(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: _buildVideoTile(
                spotlightTile,
                isMainStageScreenShare: screenShareTile != null,
                isSpotlight: true,
                onPinTap: () {
                  setState(() {
                    if (_pinnedPeerId != null) {
                      _pinnedPeerId = null;
                    } else {
                      _pinnedPeerId = spotlightTile['id'] as String?;
                    }
                  });
                },
              ),
            ),
          ),
        ],
      ),
    );
  }

  // --- VIDEO TILE (Images 1 & 2 Inspired: Golden Speaker Border, Translucent Labels, Mic Status) ---
  Widget _buildVideoTile(
    Map<String, dynamic> data, {
    bool isMainStageScreenShare = false,
    bool isThumbnail = false,
    bool isSpotlight = false,
    VoidCallback? onPinTap,
  }) {
    final bool isLocal = data['isLocal'];
    final String peerId = data['id'] as String;
    final peerData = _peersData[peerId];

    final bool sharing = isLocal ? _isScreenSharing : (peerData?['isScreenSharing'] == true);
    final bool isMuted = isLocal ? _isMuted : (peerData?['isMuted'] == true);
    final bool isVideoOff = isLocal ? (!_isVideoOn && !_isScreenSharing) : (peerData?['isVideoOff'] == true);
    final bool hasVideo = !isVideoOff || sharing;

    final String baseName = isLocal ? widget.userName : (peerData?['displayName'] ?? _getDisplayName(peerId));
    final String cleanName = baseName.trim().isEmpty ? 'Guest' : baseName.trim();
    final String displayName = cleanName + (isLocal ? (sharing ? ' (Your Screen)' : ' (You)') : (sharing ? ' (Screen)' : ''));

    final bool isActiveSpeaker = !isMuted; // Speaking/Unmuted

    return AnimatedContainer(
      duration: const Duration(milliseconds: 250),
      decoration: BoxDecoration(
        color: const Color(0xFF1E222D),
        borderRadius: BorderRadius.circular(isThumbnail ? 12 : 16),
        // Active Speaker Golden / Amber Border (Image 1 & 2 Style)
        border: Border.all(
          color: isActiveSpeaker ? const Color(0xFFFFB703) : Colors.white.withValues(alpha: 0.1),
          width: isActiveSpeaker ? 2.5 : 1.0,
        ),
        boxShadow: isActiveSpeaker
            ? [
                BoxShadow(
                  color: const Color(0xFFFFB703).withValues(alpha: 0.4),
                  blurRadius: isThumbnail ? 8 : 16,
                  spreadRadius: isThumbnail ? 1 : 2,
                ),
              ]
            : [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.3),
                  blurRadius: 8,
                  offset: const Offset(0, 4),
                ),
              ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(isThumbnail ? 11 : 15),
        child: Stack(
          fit: StackFit.expand,
          children: [
            // Video Stream or Avatar Placeholder
            if (hasVideo)
              RTCVideoView(
                data['renderer'] as RTCVideoRenderer,
                mirror: isLocal && !sharing,
                objectFit: sharing || isMainStageScreenShare
                    ? RTCVideoViewObjectFit.RTCVideoViewObjectFitContain
                    : RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
              )
            else
              Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    CircleAvatar(
                      radius: isThumbnail ? 18 : 36,
                      backgroundColor: const Color(0xFF0E72ED),
                      child: Text(
                        cleanName.isNotEmpty ? cleanName[0].toUpperCase() : 'U',
                        style: TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                          fontSize: isThumbnail ? 14 : 26,
                        ),
                      ),
                    ),
                    if (!isThumbnail) ...[
                      const SizedBox(height: 10),
                      Text(
                        cleanName,
                        style: const TextStyle(color: Colors.white70, fontSize: 14, fontWeight: FontWeight.w600),
                      ),
                    ],
                  ],
                ),
              ),

            // Top-Left User Name Tag (Image 1 & 2 Style)
            Positioned(
              top: isThumbnail ? 6 : 10,
              left: isThumbnail ? 6 : 10,
              child: Container(
                padding: EdgeInsets.symmetric(horizontal: isThumbnail ? 6 : 10, vertical: isThumbnail ? 2 : 4),
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.75),
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(color: Colors.white12),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (sharing) ...[
                      Icon(Icons.screen_share, color: Colors.greenAccent, size: isThumbnail ? 10 : 13),
                      const SizedBox(width: 4),
                    ],
                    Text(
                      displayName,
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: isThumbnail ? 10 : 12,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
              ),
            ),

            // Bottom-Left Microphone Status (Image 2 Style: Green if talking, Red with slash if muted)
            Positioned(
              bottom: isThumbnail ? 6 : 10,
              left: isThumbnail ? 6 : 10,
              child: Container(
                padding: EdgeInsets.all(isThumbnail ? 3 : 5),
                decoration: BoxDecoration(
                  color: isMuted ? Colors.redAccent.withValues(alpha: 0.85) : Colors.greenAccent.shade700.withValues(alpha: 0.9),
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: isMuted ? Colors.red.withValues(alpha: 0.3) : Colors.green.withValues(alpha: 0.4),
                      blurRadius: 6,
                    ),
                  ],
                ),
                child: Icon(
                  isMuted ? Icons.mic_off : Icons.mic,
                  color: Colors.white,
                  size: isThumbnail ? 10 : 14,
                ),
              ),
            ),

            // Bottom-Right Fullscreen / Pin Button (Image 2 Style: Expand Icon)
            if (onPinTap != null)
              Positioned(
                bottom: isThumbnail ? 4 : 8,
                right: isThumbnail ? 4 : 8,
                child: InkWell(
                  onTap: onPinTap,
                  borderRadius: BorderRadius.circular(6),
                  child: Container(
                    padding: EdgeInsets.all(isThumbnail ? 3 : 6),
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.65),
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(color: Colors.white12),
                    ),
                    child: Icon(
                      _pinnedPeerId == peerId ? Icons.fullscreen_exit : Icons.fullscreen,
                      color: Colors.white70,
                      size: isThumbnail ? 12 : 16,
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

// Widget for animated floating emoji
class _FloatingEmoji extends StatefulWidget {
  final String emoji;
  final double startX;
  final VoidCallback onComplete;

  const _FloatingEmoji({super.key, required this.emoji, required this.startX, required this.onComplete});

  @override
  State<_FloatingEmoji> createState() => _FloatingEmojiState();
}

class _FloatingEmojiState extends State<_FloatingEmoji> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _yAnimation;
  late Animation<double> _opacityAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: const Duration(seconds: 3));
    _yAnimation = Tween<double>(begin: 0, end: -300).animate(CurvedAnimation(parent: _controller, curve: Curves.easeOut));
    _opacityAnimation = Tween<double>(begin: 1.0, end: 0.0).animate(CurvedAnimation(parent: _controller, curve: const Interval(0.5, 1.0)));
    
    _controller.forward().then((_) => widget.onComplete());
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return Positioned(
          bottom: 20 - _yAnimation.value,
          left: widget.startX,
          child: Opacity(
            opacity: _opacityAnimation.value,
            child: Text(widget.emoji, style: const TextStyle(fontSize: 40)),
          ),
        );
      }
    );
  }
}
