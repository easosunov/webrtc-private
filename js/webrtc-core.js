// js/webrtc-core.js - COMPLETE FIXED VERSION
const WebRTCManager = {
    createPeerConnection() {
        console.log('🔗 Creating peer connection...');
        
        const config = {
            iceServers: CONFIG.peerConfig?.iceServers || [
                { urls: "stun:stun.l.google.com:19302" },
                { urls: "stun:stun1.l.google.com:19302" }
            ],
            iceCandidatePoolSize: 10,
            sdpSemantics: 'unified-plan',
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require'
        };
        
        CONFIG.peerConnection = new RTCPeerConnection(config);
        
        // Initialize remote stream
        CONFIG.remoteStream = new MediaStream();
        
        // CRITICAL FIX: Attach EMPTY stream NOW (during user interaction)
        if (CONFIG.elements.remoteVideo) {
            CONFIG.elements.remoteVideo.srcObject = CONFIG.remoteStream;
            CONFIG.elements.remoteVideo.muted = false;
            CONFIG.elements.remoteVideo.volume = 1.0;
            console.log('✅ Pre-attached empty stream to remote video');
        }
        
        // Add local tracks
        if (CONFIG.localStream && CONFIG.hasMediaPermissions) {
            const audioTracks = CONFIG.localStream.getAudioTracks();
            const videoTracks = CONFIG.localStream.getVideoTracks();
            
            console.log(`🎤 Local audio tracks: ${audioTracks.length}`);
            console.log(`🎥 Local video tracks: ${videoTracks.length}`);
            
            // Add audio
            audioTracks.forEach(track => {
                try {
                    track.enabled = true;
                    CONFIG.peerConnection.addTrack(track, CONFIG.localStream);
                    console.log(`✅ Added AUDIO track: ${track.id.substring(0, 10)}...`);
                } catch (error) {
                    console.error('❌ Failed to add audio:', error);
                }
            });
            
            // Add video
            videoTracks.forEach(track => {
                try {
                    CONFIG.peerConnection.addTrack(track, CONFIG.localStream);
                    console.log(`✅ Added VIDEO track: ${track.id.substring(0, 10)}...`);
                } catch (error) {
                    console.error('❌ Failed to add video:', error);
                }
            });
        }
        
        // Handle incoming tracks - SIMPLIFIED
        CONFIG.peerConnection.ontrack = (event) => {
            console.log('🎬 ontrack event:', event.track.kind);
            
            if (event.track) {
                // Add track to pre-attached stream
                CONFIG.remoteStream.addTrack(event.track);
                
                // Update call state
                CONFIG.isInCall = true;
                CONFIG.isProcessingAnswer = false;
                
                // Update UI
                setTimeout(() => {
                    UIManager.showStatus('Call connected');
                    UIManager.updateCallButtons();
                }, 100);
                
                console.log(`✅ Added ${event.track.kind} track to stream`);
                
                // Try to play if user already interacted
                if (window.userAlreadyClicked && CONFIG.elements.remoteVideo) {
                    setTimeout(() => {
                        CONFIG.elements.remoteVideo.play()
                            .then(() => console.log('✅ Auto-playing after previous click'))
                            .catch(e => console.log('Auto-play still blocked:', e));
                    }, 500);
                }
            }
        };
        
        // ICE candidate handling
        CONFIG.peerConnection.onicecandidate = (event) => {
            if (event.candidate && CONFIG.targetSocketId) {
                console.log('🧊 Sending ICE candidate to', CONFIG.targetSocketId);
                WebSocketClient.sendToServer({
                    type: 'ice-candidate',
                    target: CONFIG.targetSocketId,
                    from: CONFIG.myId,
                    candidate: event.candidate
                });
            }
        };
        
        // Connection state
        CONFIG.peerConnection.onconnectionstatechange = () => {
            console.log('🔗 Connection state:', CONFIG.peerConnection.connectionState);
            
            switch (CONFIG.peerConnection.connectionState) {
                case 'connected':
                    console.log('✅ PEER CONNECTION CONNECTED!');
                    CONFIG.isInCall = true;
                    CONFIG.isProcessingAnswer = false;
                    UIManager.showStatus('Call connected');
                    UIManager.updateCallButtons();
                    break;
                    
                case 'disconnected':
                case 'failed':
                case 'closed':
                    console.log('❌ Peer connection ended');
                    if (CONFIG.peerConnection.connectionState === 'closed') {
                        CallManager.cleanupCall();
                    }
                    break;
            }
        };
        
        // Track ended event
        CONFIG.peerConnection.onsignalingstatechange = () => {
            console.log('📡 Signaling state:', CONFIG.peerConnection.signalingState);
        };
        
        console.log('✅ Peer connection created');
    },
    
    async createAndSendOffer() {
        if (!CONFIG.peerConnection || !CONFIG.targetSocketId) {
            console.error('No peer connection or target');
            return;
        }
        
        try {
            console.log('📤 Creating offer for', CONFIG.targetSocketId);
            
            const offer = await CONFIG.peerConnection.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });
            
            if (offer.sdp) {
                const hasAudio = offer.sdp.includes('m=audio');
                const hasVideo = offer.sdp.includes('m=video');
                console.log(`📄 SDP - Audio: ${hasAudio ? '✅' : '❌'}, Video: ${hasVideo ? '✅' : '❌'}`);
            }
            
            await CONFIG.peerConnection.setLocalDescription(offer);
            console.log('✅ Local description set');
            
            WebSocketClient.sendToServer({
                type: 'offer',
                target: CONFIG.targetSocketId,
                from: CONFIG.myId,
                offer: offer
            });
            
            console.log('✅ Offer sent');
            
        } catch (error) {
            console.error('❌ Error creating/sending offer:', error);
            UIManager.showError('Failed to start call: ' + error.message);
            CallManager.cleanupCall();
        }
    },
    
    async handleOffer(data) {
        console.log('📥 Received offer from:', data.from || 'unknown');
        
        // Set target
        if (data.from && !CONFIG.targetSocketId) {
            CONFIG.targetSocketId = data.from;
            console.log('Set target to:', CONFIG.targetSocketId);
        }
        
        if (!CONFIG.peerConnection) {
            this.createPeerConnection();
        }
        
        try {
            await CONFIG.peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
            console.log('✅ Remote description set');
            
            const answer = await CONFIG.peerConnection.createAnswer();
            await CONFIG.peerConnection.setLocalDescription(answer);
            
            WebSocketClient.sendToServer({
                type: 'answer',
                target: data.from,
                from: CONFIG.myId,
                answer: answer
            });
            
            console.log('✅ Answer sent to', data.from);
            this.processIceCandidateQueue();
            
        } catch (error) {
            console.error('❌ Error handling offer:', error);
            UIManager.showError('Call setup failed: ' + error.message);
            CallManager.cleanupCall();
        }
    },
    
    async handleAnswer(data) {
        console.log('📥 Received answer from:', data.from || 'unknown');
        
        if (!CONFIG.peerConnection) {
            console.error('No peer connection for answer');
            return;
        }
        
        try {
            await CONFIG.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
            console.log('✅ Remote description set');
            this.processIceCandidateQueue();
            
        } catch (error) {
            console.error('❌ Error handling answer:', error);
            UIManager.showError('Call setup failed: ' + error.message);
            CallManager.cleanupCall();
        }
    },
    
    handleIceCandidate(data) {
        if (!data.candidate) return;
        
        console.log('🧊 Received ICE candidate from', data.from || 'unknown');
        
        if (!CONFIG.peerConnection) {
            console.log('Queueing ICE candidate');
            CONFIG.iceCandidatesQueue.push(data.candidate);
            return;
        }
        
        try {
            const iceCandidate = new RTCIceCandidate(data.candidate);
            CONFIG.peerConnection.addIceCandidate(iceCandidate)
                .then(() => console.log('✅ ICE candidate added'))
                .catch(e => console.error('❌ Failed to add ICE candidate:', e));
        } catch (error) {
            console.error('❌ Error creating ICE candidate:', error);
        }
    },
    
    processIceCandidateQueue() {
        if (!CONFIG.peerConnection || CONFIG.iceCandidatesQueue.length === 0) return;
        
        console.log(`Processing ${CONFIG.iceCandidatesQueue.length} queued ICE candidates`);
        
        CONFIG.iceCandidatesQueue.forEach(candidate => {
            try {
                const iceCandidate = new RTCIceCandidate(candidate);
                CONFIG.peerConnection.addIceCandidate(iceCandidate)
                    .catch(e => console.error('❌ Failed to add queued ICE candidate:', e));
            } catch (error) {
                console.error('❌ Error processing queued ICE candidate:', error);
            }
        });
        
        CONFIG.iceCandidatesQueue = [];
    },
    
    // Debug function
    checkMediaState() {
        console.log('🔍 MEDIA STATE:');
        
        if (CONFIG.localStream) {
            console.log(`Local - Audio: ${CONFIG.localStream.getAudioTracks().length}, Video: ${CONFIG.localStream.getVideoTracks().length}`);
        }
        
        if (CONFIG.remoteStream) {
            console.log(`Remote - Audio: ${CONFIG.remoteStream.getAudioTracks().length}, Video: ${CONFIG.remoteStream.getVideoTracks().length}`);
        }
        
        if (CONFIG.elements.remoteVideo) {
            console.log(`Remote video srcObject: ${!!CONFIG.elements.remoteVideo.srcObject}`);
            console.log(`Remote video muted: ${CONFIG.elements.remoteVideo.muted}`);
        }
    }
};

window.WebRTCManager = WebRTCManager;
