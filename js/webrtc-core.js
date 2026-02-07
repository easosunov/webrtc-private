// js/webrtc-core.js - FIXED AUTOPLAY VERSION
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
        
        // CRITICAL: Initialize remote stream immediately
        CONFIG.remoteStream = new MediaStream();
        
        // Set up remote video element IMMEDIATELY
        if (CONFIG.elements.remoteVideo) {
            CONFIG.elements.remoteVideo.srcObject = CONFIG.remoteStream;
            CONFIG.elements.remoteVideo.muted = false;  // THIS IS KEY FOR AUDIO
            CONFIG.elements.remoteVideo.volume = 1.0;
            console.log('🎬 Remote video element prepared for autoplay');
        }
        
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
        
        // Handle incoming tracks - FIXED AUTOPLAY VERSION
        CONFIG.peerConnection.ontrack = (event) => {
            console.log('🎬 ontrack event:', event.track.kind);
            
            if (event.track) {
                // Add track to our remote stream
                CONFIG.remoteStream.addTrack(event.track);
                
                // CRITICAL: Update the remote video element
                if (CONFIG.elements.remoteVideo) {
                    // Ensure we're using the correct stream
                    CONFIG.elements.remoteVideo.srcObject = CONFIG.remoteStream;
                    // ENSURE AUDIO IS NOT MUTED
                    CONFIG.elements.remoteVideo.muted = false;
                    
                    // TRY TO PLAY IMMEDIATELY
                    const playPromise = CONFIG.elements.remoteVideo.play();
                    
                    if (playPromise !== undefined) {
                        playPromise
                            .then(() => {
                                console.log(`▶️ Remote ${event.track.kind} playing AUTOMATICALLY`);
                                
                                // Check audio state
                                if (event.track.kind === 'audio') {
                                    console.log('🔊 AUDIO TRACK AUTOPLAY SUCCESS!');
                                    setTimeout(() => {
                                        const audioTracks = CONFIG.remoteStream.getAudioTracks();
                                        console.log(`Remote audio tracks: ${audioTracks.length}`);
                                    }, 100);
                                }
                            })
                            .catch(error => {
                                console.log(`⚠️ Autoplay failed for ${event.track.kind}:`, error);
                                console.log('ℹ️ This is normal in Chrome without user gesture');
                                
                                // Store that we need user interaction
                                CONFIG.needsUserInteraction = true;
                                
                                // Update UI to inform user
                                if (UIManager && UIManager.showStatus) {
                                    UIManager.showStatus('Media ready - click "Play Videos" button');
                                }
                            });
                    }
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
                    UIManager.showStatus('Call connected');
                    UIManager.updateCallButtons();
                    
                    // Try to play remote video if not already playing
                    if (CONFIG.elements.remoteVideo && CONFIG.remoteStream) {
                        setTimeout(() => {
                            const playPromise = CONFIG.elements.remoteVideo.play();
                            if (playPromise !== undefined) {
                                playPromise.catch(e => {
                                    console.log('⚠️ Post-connection autoplay attempt failed:', e);
                                });
                            }
                        }, 500);
                    }
                    
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
        
        if (!CONFIG.peerConnection) {
            this.createPeerConnection();
        }
        
        if (data.senderSocketId && !CONFIG.targetSocketId) {
            CONFIG.targetSocketId = data.senderSocketId;
        }
        
        try {
            await CONFIG.peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
            console.log('✅ Remote description set');
            
            const answer = await CONFIG.peerConnection.createAnswer();
            await CONFIG.peerConnection.setLocalDescription(answer);
            
            WebSocketClient.sendToServer({
                type: 'answer',
                targetSocketId: CONFIG.targetSocketId,
                answer: answer,
                sender: CONFIG.myUsername
            });
            
            console.log('✅ Answer sent');
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
