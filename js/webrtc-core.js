// js/webrtc-core.js - FIXED VERSION
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
        
        // Set up remote video element
        if (CONFIG.elements.remoteVideo) {
            CONFIG.elements.remoteVideo.srcObject = CONFIG.remoteStream;
            CONFIG.elements.remoteVideo.muted = false;
            CONFIG.elements.remoteVideo.volume = 1.0;
        }
        
        // Add local tracks to peer connection
        if (CONFIG.localStream && CONFIG.hasMediaPermissions) {
            const audioTracks = CONFIG.localStream.getAudioTracks();
            const videoTracks = CONFIG.localStream.getVideoTracks();
            
            console.log(`🎤 Local audio tracks: ${audioTracks.length}`);
            console.log(`🎥 Local video tracks: ${videoTracks.length}`);
            
            // Add audio tracks
            audioTracks.forEach(track => {
                try {
                    track.enabled = true;
                    CONFIG.peerConnection.addTrack(track, CONFIG.localStream);
                    console.log(`✅ Added AUDIO track: ${track.id.substring(0, 10)}...`);
                } catch (error) {
                    console.error('❌ Failed to add audio track:', error);
                }
            });
            
            // Add video tracks
            videoTracks.forEach(track => {
                try {
                    CONFIG.peerConnection.addTrack(track, CONFIG.localStream);
                    console.log(`✅ Added VIDEO track: ${track.id.substring(0, 10)}...`);
                } catch (error) {
                    console.error('❌ Failed to add video track:', error);
                }
            });
        }
		
        
        // Handle incoming tracks
CONFIG.peerConnection.ontrack = (event) => {
    console.log('🎬 ontrack event:', event.track.kind);
    
    if (event.track) {
        CONFIG.remoteStream.addTrack(event.track);
        
        // Mark as in call
        CONFIG.isInCall = true;
        CONFIG.isProcessingAnswer = false;
        
        // Update UI
        setTimeout(() => {
            UIManager.showStatus('Call connected - click to play');
            UIManager.updateCallButtons();
        }, 100);
        
        // CRITICAL FIX: Don't try to play automatically
        // Just attach the stream
        if (CONFIG.elements.remoteVideo) {
            CONFIG.elements.remoteVideo.srcObject = CONFIG.remoteStream;
            CONFIG.elements.remoteVideo.muted = false;
            
            // Show instruction to user
            UIManager.showStatus('Click anywhere to play audio/video');
        }
    }
};
        
CONFIG.peerConnection.onconnectionstatechange = () => {
    console.log('🔗 Connection state:', CONFIG.peerConnection.connectionState);
    
    switch (CONFIG.peerConnection.connectionState) {
        case 'connected':
            console.log('✅ PEER CONNECTION CONNECTED!');
            CONFIG.isInCall = true;  // SET THIS
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
        // ICE candidate handling - FIXED: include target and from
        CONFIG.peerConnection.onicecandidate = (event) => {
            if (event.candidate && CONFIG.targetSocketId) {
                console.log('🧊 Sending ICE candidate to', CONFIG.targetSocketId);
                WebSocketClient.sendToServer({
                    type: 'ice-candidate',
                    target: CONFIG.targetSocketId,  // Changed from targetSocketId
                    from: CONFIG.myId,              // Added from
                    candidate: event.candidate
                });
            }
        };
        
        // Connection state monitoring
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
            
            // Check SDP
            if (offer.sdp) {
                const hasAudio = offer.sdp.includes('m=audio');
                const hasVideo = offer.sdp.includes('m=video');
                console.log(`📄 SDP - Audio: ${hasAudio ? '✅' : '❌'}, Video: ${hasVideo ? '✅' : '❌'}`);
            }
            
            await CONFIG.peerConnection.setLocalDescription(offer);
            console.log('✅ Local description set');
            
            // FIXED: Include target and from fields
            WebSocketClient.sendToServer({
                type: 'offer',
                target: CONFIG.targetSocketId,  // Changed from targetSocketId
                from: CONFIG.myId,              // Added from
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
        
        // Set target if not already set
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
            
            // FIXED: Include target and from fields
            WebSocketClient.sendToServer({
                type: 'answer',
                target: data.from,      // Send back to the offer sender
                from: CONFIG.myId,      // Our ID
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
    
    checkAudioState() {
        console.log('🔍 AUDIO STATE CHECK:');
        
        if (CONFIG.localStream) {
            const localAudio = CONFIG.localStream.getAudioTracks();
            console.log(`Local audio tracks: ${localAudio.length}`);
        }
        
        if (CONFIG.remoteStream) {
            const remoteAudio = CONFIG.remoteStream.getAudioTracks();
            console.log(`Remote audio tracks: ${remoteAudio.length}`);
        }
        
        if (CONFIG.elements.remoteVideo) {
            console.log(`Remote video muted: ${CONFIG.elements.remoteVideo.muted}`);
        }
    }
};

window.WebRTCManager = WebRTCManager;
