import 'dart:async';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

class WebRTCService {
  MediaStream? localStream;
  String? currentMeetingId;
  String? currentUserId;
  
  final Map<String, RTCPeerConnection> peerConnections = {};
  final Map<String, RTCVideoRenderer> remoteRenderers = {};
  final Map<String, List<RTCIceCandidate>> earlyCandidates = {};
  final Set<String> _remoteDescSet = {};
  MediaStreamTrack? activeVideoTrack;
  
  StreamSubscription? _signalsSub;
  StreamSubscription? _peersSub;
  
  Function(String, RTCVideoRenderer)? onRemoteStreamAdded;
  Function(String)? onRemoteStreamRemoved;
  Function(String)? onPeerJoined;
  Function(String)? onPeerLeft;

  final Map<String, dynamic> configuration = {
    'iceServers': [
      {'urls': 'stun:stun.l.google.com:19302'},
      {'urls': 'stun:stun1.l.google.com:19302'},
      {'urls': 'stun:stun2.l.google.com:19302'},
      {'urls': 'stun:stun3.l.google.com:19302'},
      {'urls': 'stun:stun4.l.google.com:19302'},
      {'urls': 'stun:stun.services.mozilla.com'},
      {
        'urls': [
          'turn:openrelay.metered.ca:80',
          'turn:openrelay.metered.ca:443',
          'turn:openrelay.metered.ca:443?transport=tcp'
        ],
        'username': 'openrelay',
        'credential': 'openrelay'
      },
    ],
    'sdpSemantics': 'unified-plan',
  };

  Future<MediaStream> startLocalStream() async {
    if (localStream != null) return localStream!;
    
    final mediaConstraints = {
      'audio': true,
      'video': {
        'facingMode': 'user',
        'width': {'ideal': 1280},
        'height': {'ideal': 720},
      },
    };
    try {
      localStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
      activeVideoTrack = localStream?.getVideoTracks().firstOrNull;
      return localStream!;
    } catch (e) {
      print("[WebRTC] Fallback to simple constraints due to: $e");
      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          'audio': true,
          'video': true,
        });
        activeVideoTrack = localStream?.getVideoTracks().firstOrNull;
        return localStream!;
      } catch (e2) {
        print("[WebRTC] Error starting local stream: $e2");
        rethrow;
      }
    }
  }

  Future<void> joinMeeting(String meetingId, String userId) async {
    currentMeetingId = meetingId;
    currentUserId = userId;

    if (localStream == null) {
      await startLocalStream();
    }

    // 1. Listen for incoming signals for this user FIRST so early offers are never lost
    _signalsSub = FirebaseFirestore.instance
        .collection('meetings')
        .doc(meetingId)
        .collection('signals')
        .where('receiver', isEqualTo: userId)
        .snapshots()
        .listen((snapshot) async {
      for (var change in snapshot.docChanges) {
        if (change.type == DocumentChangeType.added) {
          final data = change.doc.data();
          if (data != null) {
            // Remove signal after reading so it isn't reprocessed
            change.doc.reference.delete().catchError((_) => null);
            await _handleSignal(data);
          }
        }
      }
    });

    // 2. Register presence in peers collection
    await FirebaseFirestore.instance
        .collection('meetings')
        .doc(meetingId)
        .collection('peers')
        .doc(userId)
        .set({
          'joinedAt': FieldValue.serverTimestamp(),
          'peerId': userId,
        }, SetOptions(merge: true));

    // 3. Listen for peers in this meeting
    _peersSub = FirebaseFirestore.instance
        .collection('meetings')
        .doc(meetingId)
        .collection('peers')
        .snapshots()
        .listen((snapshot) {
      for (var change in snapshot.docChanges) {
        final peerId = change.doc.id;
        if (change.type == DocumentChangeType.added) {
          if (peerId != userId) {
            onPeerJoined?.call(peerId);
            // Deterministic offerer: lexically smaller initiates
            if (userId.compareTo(peerId) < 0) {
              print("[WebRTC] $userId initiating offer to $peerId");
              _createOffer(peerId);
            }
          }
        } else if (change.type == DocumentChangeType.removed) {
          if (peerId != userId) {
            onPeerLeft?.call(peerId);
            _removePeer(peerId);
          }
        }
      }
    });
  }

  Future<RTCPeerConnection> _createPeerConnection(String peerId) async {
    if (peerConnections.containsKey(peerId)) {
      return peerConnections[peerId]!;
    }

    final pc = await createPeerConnection(configuration);
    peerConnections[peerId] = pc;
    
    pc.onIceCandidate = (RTCIceCandidate candidate) {
      if (candidate.candidate != null && candidate.candidate!.isNotEmpty) {
        _sendSignal(peerId, 'candidate', candidate.toMap());
      }
    };

    // Modern WebRTC track handling
    pc.onTrack = (RTCTrackEvent event) async {
      print("[WebRTC] onTrack from $peerId: kind=${event.track.kind}, streams=${event.streams.length}");
      MediaStream stream;
      if (event.streams.isNotEmpty) {
        stream = event.streams[0];
      } else {
        final existingRenderer = remoteRenderers[peerId];
        if (existingRenderer != null && existingRenderer.srcObject != null) {
          stream = existingRenderer.srcObject!;
          stream.addTrack(event.track);
        } else {
          stream = await createLocalMediaStream('remote_stream_$peerId');
          stream.addTrack(event.track);
        }
      }
      
      RTCVideoRenderer renderer;
      if (!remoteRenderers.containsKey(peerId)) {
        renderer = RTCVideoRenderer();
        remoteRenderers[peerId] = renderer;
        await renderer.initialize();
      } else {
        renderer = remoteRenderers[peerId]!;
      }
      renderer.srcObject = stream;
      onRemoteStreamAdded?.call(peerId, renderer);
    };

    // Fallback stream handling
    pc.onAddStream = (MediaStream stream) async {
      print("[WebRTC] onAddStream from $peerId");
      RTCVideoRenderer renderer;
      if (!remoteRenderers.containsKey(peerId)) {
        renderer = RTCVideoRenderer();
        remoteRenderers[peerId] = renderer;
        await renderer.initialize();
      } else {
        renderer = remoteRenderers[peerId]!;
      }
      renderer.srcObject = stream;
      onRemoteStreamAdded?.call(peerId, renderer);
    };

    pc.onIceConnectionState = (RTCIceConnectionState state) {
      print("[WebRTC] ICE connection state with $peerId: $state");
      if (state == RTCIceConnectionState.RTCIceConnectionStateFailed) {
        print("[WebRTC] ICE failed for $peerId, restarting ICE");
        pc.restartIce();
      }
    };

    // Attach local audio & video tracks
    if (localStream != null) {
      for (var track in localStream!.getTracks()) {
        if (track.kind == 'video' && activeVideoTrack != null) {
          await pc.addTrack(activeVideoTrack!, localStream!);
        } else {
          await pc.addTrack(track, localStream!);
        }
      }
    }
    
    return pc;
  }

  Future<void> replaceVideoTrack(MediaStreamTrack newTrack) async {
    activeVideoTrack = newTrack;
    for (var pc in peerConnections.values) {
      try {
        final senders = await pc.getSenders();
        for (var sender in senders) {
          if (sender.track?.kind == 'video') {
            await sender.replaceTrack(newTrack);
          }
        }
      } catch (e) {
        print("[WebRTC] Error replacing video track: $e");
      }
    }
  }

  Future<void> revertToCameraTrack() async {
    if (localStream != null) {
      final cameraTrack = localStream!.getVideoTracks().firstOrNull;
      if (cameraTrack != null) {
        activeVideoTrack = cameraTrack;
        await replaceVideoTrack(cameraTrack);
      }
    }
  }

  Future<void> _createOffer(String peerId) async {
    try {
      final pc = await _createPeerConnection(peerId);
      final offer = await pc.createOffer({
        'offerToReceiveAudio': 1,
        'offerToReceiveVideo': 1,
      });
      await pc.setLocalDescription(offer);
      _sendSignal(peerId, 'offer', offer.toMap());
    } catch (e) {
      print("[WebRTC] Error creating offer to $peerId: $e");
    }
  }

  Future<void> _handleSignal(Map<String, dynamic> data) async {
    final senderId = data['sender'];
    final type = data['type'];
    final payload = data['payload'];

    if (senderId == null || senderId == currentUserId) return;

    try {
      if (type == 'offer') {
        final pc = await _createPeerConnection(senderId);
        await pc.setRemoteDescription(RTCSessionDescription(payload['sdp'], payload['type']));
        _remoteDescSet.add(senderId);
        
        // Flush any early candidates queued before offer arrived
        if (earlyCandidates.containsKey(senderId)) {
          for (var c in earlyCandidates[senderId]!) {
            try {
              await pc.addCandidate(c);
            } catch (e) {
              print("[WebRTC] Error adding early candidate: $e");
            }
          }
          earlyCandidates.remove(senderId);
        }

        final answer = await pc.createAnswer({
          'offerToReceiveAudio': 1,
          'offerToReceiveVideo': 1,
        });
        await pc.setLocalDescription(answer);
        _sendSignal(senderId, 'answer', answer.toMap());
      } else if (type == 'answer') {
        final pc = peerConnections[senderId];
        if (pc != null) {
          await pc.setRemoteDescription(RTCSessionDescription(payload['sdp'], payload['type']));
          _remoteDescSet.add(senderId);
          
          // Flush any early candidates queued before answer arrived
          if (earlyCandidates.containsKey(senderId)) {
            for (var c in earlyCandidates[senderId]!) {
              try {
                await pc.addCandidate(c);
              } catch (e) {
                print("[WebRTC] Error adding early candidate: $e");
              }
            }
            earlyCandidates.remove(senderId);
          }
        }
      } else if (type == 'candidate') {
        if (payload['candidate'] == null || (payload['candidate'] as String).isEmpty) return;
        final candidate = RTCIceCandidate(
          payload['candidate'],
          payload['sdpMid'],
          payload['sdpMLineIndex'],
        );
        final pc = peerConnections[senderId];
        if (pc != null && _remoteDescSet.contains(senderId)) {
          try {
            await pc.addCandidate(candidate);
          } catch (e) {
            print("[WebRTC] Error adding candidate: $e");
          }
        } else {
          earlyCandidates.putIfAbsent(senderId, () => []).add(candidate);
        }
      }
    } catch (e) {
      print("[WebRTC] Error handling signal $type from $senderId: $e");
    }
  }

  void _sendSignal(String receiverId, String type, Map<String, dynamic> payload) {
    if (currentMeetingId == null || currentUserId == null) return;
    FirebaseFirestore.instance
        .collection('meetings')
        .doc(currentMeetingId)
        .collection('signals')
        .add({
      'sender': currentUserId,
      'receiver': receiverId,
      'type': type,
      'payload': payload,
      'timestamp': FieldValue.serverTimestamp(),
    }).catchError((e) {
      print("[WebRTC] Error sending signal $type to $receiverId: $e");
      return FirebaseFirestore.instance.collection('dummy').doc();
    });
  }

  void _removePeer(String peerId) {
    _remoteDescSet.remove(peerId);
    earlyCandidates.remove(peerId);
    final renderer = remoteRenderers.remove(peerId);
    if (renderer != null) {
      renderer.srcObject = null;
      renderer.dispose();
      onRemoteStreamRemoved?.call(peerId);
    }
    final pc = peerConnections.remove(peerId);
    pc?.close();
  }

  Future<void> dispose() async {
    activeVideoTrack = null;
    await _signalsSub?.cancel();
    await _peersSub?.cancel();
    _signalsSub = null;
    _peersSub = null;

    if (currentMeetingId != null && currentUserId != null) {
      try {
        await FirebaseFirestore.instance
            .collection('meetings')
            .doc(currentMeetingId)
            .collection('peers')
            .doc(currentUserId)
            .delete();
      } catch (_) {}
    }
    
    for (var peerId in peerConnections.keys.toList()) {
      _removePeer(peerId);
    }
    
    localStream?.getTracks().forEach((track) => track.stop());
    await localStream?.dispose();
    localStream = null;
  }
}
