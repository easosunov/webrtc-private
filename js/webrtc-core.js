// js/webrtc-core.js
const WebRTCManager = {
    createPeerConnection() {
        console.log('🔗 Creating peer connection...');
        
        const config = {
            iceServers: [
                { urls: "stun:stun.l.google.com:19302" },
                { urls: "stun:stun1.l.google.com:19302" }
            ],
            iceCandidatePoolSize: 10,
            // Audio-specific optimizations
            sdpSemantics: 'unified-plan',
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require'
        };
        
        CONFIG.peerConnection = new RTCPeerConnection(config);
        
        // CRITICAL: Initialize remote stream - BUT DON'T ATTACH YET
        CONFIG.remoteStream = new MediaStream();
        
        // DO NOT set srcObject here - wait for user interaction
        // Just ensure the video elements exist
        console.log('🎬 Remote stream created, will attach after user interaction');
        
        // DEBUG: Check what tracks we have
        if (CONFIG.localStream) {
            const audioTracks = CONFIG.localStream.getAudioTracks();
            console.log(`🎤 Local audio tracks: ${audioTracks.length}`);
            
            audioTracks.forEach(track => {
                console.log(`  Audio track: enabled=${track.enabled}, readyState=${track.readyState}`);
            });
        }
        
        // Add local tracks to peer connection
        if (CONFIG.localStream && CONFIG.hasMediaPermissions) {
            const audioTracks = CONFIG.localStream.getAudioTracks();
            
            // Add audio tracks FIRST (most important)
            if (audioTracks.length > 0) {
                audioTracks.forEach(track => {
                    try {
                        // Ensure audio track is enabled
                        track.enabled = true;
                        CONFIG.peerConnection.addTrack(track, CONFIG.localStream);
                        console.log(`✅ Added AUDIO track: ${track.id.substring(0, 10)}...`);
                    } catch (error) {
                        console.error('❌ Failed to add audio track:', error);
                    }
                });
            } else {
                console.warn('⚠️ WARNING: No audio tracks found!');
            }
            
            // Add video tracks
            CONFIG.localStream.getVideoTracks().forEach(track => {
                try {
                    CONFIG.peerConnection.addTrack(track, CONFIG.localStream);
                    console.log(`✅ Added VIDEO track: ${track.id.substring(0, 10)}...`);
                } catch (error) {
                    console.error('❌ Failed to add video track:', error);
                }
            });
        }
        
        // Handle incoming tracks - WAIT FOR USER INTERACTION TO PLAY
        CONFIG.peerConnection.ontrack = (event) => {
            console.log('🎬 ontrack event:', event.track.kind);
            
            if (event.track) {
                // Add track to our remote stream
                CONFIG.remoteStream.addTrack(event.track);
                
                // Store that we have tracks ready to play
                CONFIG.hasRemoteTracks = true;
                
                // DEBUG: Log what we received
                console.log(`✅ Added ${event.track.kind} track to remote stream`);
                
                // Update UI to show we're ready to play
                if (event.track.kind === 'audio') {
                    CONFIG.hasRemoteAudio = true;
                    console.log('🔊 REMOTE AUDIO TRACK RECEIVED!');
                }
                
                // Just update status - don't play automatically
                const trackCount = CONFIG.remoteStream.getTracks().length;
                UIManager.showStatus(`Received ${trackCount} media track(s) - Click "Play Videos" to start`);
                
                // Update play button if function exists
                if (typeof updatePlayButton === 'function') {
                    updatePlayButton(true);
                }
            }
        };
        
        // ICE candidate handling
        CONFIG.peerConnection.onicecandidate = (event) => {
            if (event.candidate && CONFIG.targetSocketId) {
                console.log('🧊 Sending ICE candidate');
                WebSocketClient.sendToServer({
                    type: 'ice-candidate',
                    targetSocketId: CONFIG.targetSocketId,
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
                    UIManager.showStatus('Call connected - Click "Play Videos" to start');
                    UIManager.updateCallButtons();
                    
                    // Final audio check
                    setTimeout(() => {
                        const audioTracks = CONFIG.remoteStream.getAudioTracks();
                        console.log(`🔊 Connected! Remote audio tracks: ${audioTracks.length}`);
                    }, 500);
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
            console.log('📤 Creating offer...');
            
            const offer = await CONFIG.peerConnection.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });
            
            // Check SDP for audio
            if (offer.sdp) {
                const hasAudio = offer.sdp.includes('m=audio');
                console.log(`📄 SDP - Has audio: ${hasAudio ? '✅' : '❌'}`);
                
                // Log audio codecs
                if (offer.sdp.includes('opus')) console.log('  Using Opus codec');
                if (offer.sdp.includes('ISAC')) console.log('  Using ISAC codec');
            }
            
            await CONFIG.peerConnection.setLocalDescription(offer);
            console.log('✅ Local description set');
            
            WebSocketClient.sendToServer({
                type: 'offer',
                targetSocketId: CONFIG.targetSocketId,
                offer: offer,
                sender: CONFIG.myUsername
            });
            
            console.log('✅ Offer sent');
            
        } catch (error) {
            console.error('❌ Error creating/sending offer:', error);
            UIManager.showError('Failed to start call: ' + error.message);
            CallManager.cleanupCall();
        }
    },
    
    async handleOffer(data) {
        console.log('📥 Received offer from:', data.sender || 'unknown');
        console.log('📥 Offer data:', data);
        
        // Store the caller's socket ID
        if (data.senderSocketId) {
            CONFIG.targetSocketId = data.senderSocketId;
            console.log(`🎯 Set target socket ID: ${CONFIG.targetSocketId}`);
        }
        
        // Create peer connection if it doesn't exist
        if (!CONFIG.peerConnection) {
            this.createPeerConnection();
        }
        
        try {
            console.log('🔧 Setting remote description...');
            await CONFIG.peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
            console.log('✅ Remote description set');
            
            console.log('🔧 Creating answer...');
            const answer = await CONFIG.peerConnection.createAnswer();
            await CONFIG.peerConnection.setLocalDescription(answer);
            console.log('✅ Local description set for answer');
            
            // Send answer back to caller
            WebSocketClient.sendToServer({
                type: 'answer',
                targetSocketId: CONFIG.targetSocketId,
                answer: answer,
                sender: CONFIG.myUsername,
                senderSocketId: CONFIG.mySocketId
            });
            
            console.log('✅ Answer sent back to caller');
            this.processIceCandidateQueue();
            
        } catch (error) {
            console.error('❌ Error handling offer:', error);
            UIManager.showError('Call setup failed: ' + error.message);
            CallManager.cleanupCall();
        }
    },
    
    async handleAnswer(data) {
        console.log('📥 Received answer from:', data.sender || 'unknown');
        
        if (!CONFIG.peerConnection) {
            console.error('No peer connection for answer');
            return;
        }
        
        try {
            console.log('🔧 Setting remote description (answer)...');
            await CONFIG.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
            console.log('✅ Remote description set from answer');
            this.processIceCandidateQueue();
            
        } catch (error) {
            console.error('❌ Error handling answer:', error);
            UIManager.showError('Call setup failed: ' + error.message);
            CallManager.cleanupCall();
        }
    },
    
    handleIceCandidate(data) {
        if (!data.candidate) return;
        
        console.log('🧊 Received ICE candidate');
        
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
    
    // Keep your existing debug function
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
