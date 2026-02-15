// js/webrtc-core.js - FIRESTORE VERSION WITH PROPER SERIALIZATION
const WebRTCManager = {
    // Camera properties
    hasMultipleCameras: false,
    currentFacingMode: 'user', // 'user' = front, 'environment' = rear
    cameraInitialized: false,
    cameraSwitchInProgress: false,
    
    createPeerConnection() {
        console.log('🔗 Creating peer connection with Trickle ICE...');
        DebugConsole?.info('WebRTC', 'Creating peer connection');
        
        // Initialize failure tracking
        CONFIG.iceFailureReasons = [];
        CONFIG.iceCandidateGathering = {
            startTime: Date.now(),
            hostCandidates: 0,
            srflxCandidates: 0,
            relayCandidates: 0,
            failedServers: []
        };
        
        const config = {
            iceServers: CONFIG.peerConfig?.iceServers || [
                { urls: "stun:stun.l.google.com:19302" }
            ],
            iceCandidatePoolSize: 5, // Reduced - Trickle ICE sends candidates immediately
            sdpSemantics: 'unified-plan',
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require'
        };
        
        CONFIG.peerConnection = new RTCPeerConnection(config);
        DebugConsole?.info('WebRTC', 'Peer connection created');
        
        // Track ICE gathering start time
        CONFIG.iceStartTime = Date.now();
        
        // CRITICAL: Initialize remote stream
        CONFIG.remoteStream = new MediaStream();
        DebugConsole?.info('WebRTC', 'Remote stream initialized');
        
        // Set up remote video element - ENSURE AUDIO IS NOT MUTED
        if (CONFIG.elements.remoteVideo) {
            CONFIG.elements.remoteVideo.srcObject = CONFIG.remoteStream;
            CONFIG.elements.remoteVideo.muted = false;
            CONFIG.elements.remoteVideo.volume = 1.0;
            DebugConsole?.info('WebRTC', 'Remote video element configured');
        }
        
        // DEBUG: Check what tracks we have
        if (CONFIG.localStream) {
            const audioTracks = CONFIG.localStream.getAudioTracks();
            console.log(`🎤 Local audio tracks: ${audioTracks.length}`);
            DebugConsole?.info('WebRTC', `Local audio tracks: ${audioTracks.length}`);
            
            audioTracks.forEach(track => {
                console.log(`  Audio track: enabled=${track.enabled}, readyState=${track.readyState}`);
                DebugConsole?.info('WebRTC', `Audio track: ${track.id.substring(0,8)}... enabled=${track.enabled}`);
            });
        }
        
        // Add local tracks to peer connection
        if (CONFIG.localStream && CONFIG.hasMediaPermissions) {
            const audioTracks = CONFIG.localStream.getAudioTracks();
            
            // Add audio tracks FIRST (most important)
            if (audioTracks.length > 0) {
                audioTracks.forEach(track => {
                    try {
                        track.enabled = true;
                        CONFIG.peerConnection.addTrack(track, CONFIG.localStream);
                        console.log(`✅ Added AUDIO track: ${track.id.substring(0, 10)}...`);
                        DebugConsole?.success('WebRTC', `Added audio track`);
                    } catch (error) {
                        console.error('❌ Failed to add audio track:', error);
                        DebugConsole?.error('WebRTC', `Failed to add audio track: ${error.message}`);
                    }
                });
            } else {
                console.warn('⚠️ WARNING: No audio tracks found!');
                DebugConsole?.warning('WebRTC', 'No audio tracks found!');
            }
            
            // Add video tracks
            CONFIG.localStream.getVideoTracks().forEach(track => {
                try {
                    CONFIG.peerConnection.addTrack(track, CONFIG.localStream);
                    console.log(`✅ Added VIDEO track: ${track.id.substring(0, 10)}...`);
                    DebugConsole?.success('WebRTC', `Added video track`);
                } catch (error) {
                    console.error('❌ Failed to add video track:', error);
                    DebugConsole?.error('WebRTC', `Failed to add video track: ${error.message}`);
                }
            });
        }
        
        // ===== TRICKLE ICE: Send candidates as soon as they're generated =====
        CONFIG.peerConnection.onicecandidate = (event) => {
            if (event.candidate && CONFIG.targetSocketId) {
                const candidateStr = event.candidate.candidate;
                const candidateType = candidateStr.includes('srflx') ? 'server-reflexive' :
                                     candidateStr.includes('relay') ? 'relay' :
                                     candidateStr.includes('host') ? 'host' : 'unknown';
                
                // Track candidate types for failure analysis
                if (candidateType === 'host') CONFIG.iceCandidateGathering.hostCandidates++;
                if (candidateType === 'server-reflexive') CONFIG.iceCandidateGathering.srflxCandidates++;
                if (candidateType === 'relay') CONFIG.iceCandidateGathering.relayCandidates++;
                
                console.log(`🧊 ${candidateType} candidate:`, {
                    protocol: event.candidate.protocol || 'udp',
                    address: event.candidate.address,
                    port: event.candidate.port,
                    priority: event.candidate.priority
                });
                
                DebugConsole?.network('ICE', `${candidateType} candidate generated`);
                
                // FIX: Serialize the ICE candidate properly
                const serializedCandidate = {
                    candidate: event.candidate.candidate,
                    sdpMid: event.candidate.sdpMid,
                    sdpMLineIndex: event.candidate.sdpMLineIndex,
                    usernameFragment: event.candidate.usernameFragment
                };
                
                FirestoreClient.sendToServer({
                    type: 'ice-candidate',
                    targetSocketId: CONFIG.targetSocketId,
                    candidate: serializedCandidate
                });
            }
        };
        
        // ===== ENHANCED ICE CONNECTION STATE MONITORING WITH FAILURE ANALYSIS =====
        CONFIG.peerConnection.oniceconnectionstatechange = () => {
            const state = CONFIG.peerConnection.iceConnectionState;
            console.log('🧊 ICE connection state:', state);
            DebugConsole?.network('WebRTC', `ICE state: ${state}`);
            
            if (state === 'checking') {
                CONFIG.iceStartTime = Date.now();
                console.log('⏳ ICE checking started...');
                
                // Test TURN servers in background
                setTimeout(() => this.testTurnServers(), 100);
            }
            
            if (state === 'connected' || state === 'completed') {
                const connectTime = Date.now() - (CONFIG.iceStartTime || Date.now());
                console.log(`✅ ICE connected in ${connectTime}ms`);
                
                // Log which candidate type succeeded
                CONFIG.peerConnection.getStats().then(stats => {
                    stats.forEach(report => {
                        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                            const localType = report.localCandidateType;
                            const remoteType = report.remoteCandidateType;
                            console.log(`📡 Connection using: local=${localType}, remote=${remoteType}`);
                            
                            if (localType === 'relay' || remoteType === 'relay') {
                                DebugConsole?.info('WebRTC', 'Using TURN relay (firewall friendly)');
                            } else if (localType === 'srflx' || remoteType === 'srflx') {
                                DebugConsole?.info('WebRTC', 'Using STUN (server reflexive)');
                            }
                        }
                    });
                });
            }
            
            if (state === 'failed') {
                const failTime = Date.now() - (CONFIG.iceStartTime || Date.now());
                console.error(`❌ ICE failed after ${failTime}ms`);
                DebugConsole?.error('ICE', `ICE failed after ${failTime}ms`);
                
                // Analyze why it failed
                this.analyzeIceFailure();
                
                // Log candidate statistics
                console.log('📊 Candidate stats:', CONFIG.iceCandidateGathering);
                
                if (CONFIG.iceCandidateGathering.relayCandidates === 0) {
                    console.error('❌ No relay candidates - TURN servers may be unreachable');
                    DebugConsole?.error('ICE', 'No relay candidates - TURN servers unreachable');
                    CONFIG.iceFailureReasons.push('No relay candidates - TURN unreachable');
                }
                
                if (CONFIG.iceCandidateGathering.srflxCandidates === 0) {
                    console.error('❌ No server reflexive candidates - STUN may be blocked');
                    DebugConsole?.error('ICE', 'No server reflexive candidates - STUN blocked');
                    CONFIG.iceFailureReasons.push('No STUN candidates - STUN blocked');
                }
                
                if (CONFIG.iceCandidateGathering.hostCandidates === 0) {
                    console.error('❌ No host candidates - network interface issue');
                    DebugConsole?.error('ICE', 'No host candidates - network issue');
                    CONFIG.iceFailureReasons.push('No host candidates - network down');
                }
                
                // Attempt ICE restart
                setTimeout(() => this.restartIce(), 2000);
            }
            
            if (state === 'disconnected') {
                console.log('⚠️ ICE disconnected - network change detected, waiting for recovery...');
                DebugConsole?.warning('WebRTC', 'ICE disconnected');
                
                // Give it a chance to recover (might be temporary)
                setTimeout(() => {
                    if (CONFIG.peerConnection?.iceConnectionState === 'disconnected' ||
                        CONFIG.peerConnection?.iceConnectionState === 'failed') {
                        console.log('🔄 ICE not recovered, initiating restart');
                        this.restartIce();
                    }
                }, 3000);
            }
        };
        
        // ===== PEER CONNECTION STATE MONITORING =====
        CONFIG.peerConnection.onconnectionstatechange = () => {
            console.log('🔗 Connection state:', CONFIG.peerConnection.connectionState);
            DebugConsole?.info('WebRTC', `Connection state: ${CONFIG.peerConnection.connectionState}`);
            
            switch (CONFIG.peerConnection.connectionState) {
                case 'connected':
                    console.log('✅ PEER CONNECTION CONNECTED!');
                    DebugConsole?.success('WebRTC', 'Peer connection connected');
                    CONFIG.isInCall = true;
                    CONFIG.isProcessingAnswer = false;
                    UIManager.showStatus('Call connected');
                    UIManager.updateCallButtons();
                    
                    // Final audio check
                    setTimeout(() => {
                        const audioTracks = CONFIG.remoteStream.getAudioTracks();
                        console.log(`🔊 Connected! Remote audio tracks: ${audioTracks.length}`);
                        DebugConsole?.info('WebRTC', `Connected! Remote audio tracks: ${audioTracks.length}`);
                        DebugConsole?.success('Call', 'Call connected successfully');
                    }, 500);
                    break;
                    
                case 'disconnected':
                case 'failed':
                    console.log(`⚠️ Peer connection ${CONFIG.peerConnection.connectionState}`);
                    DebugConsole?.warning('WebRTC', `Peer connection ${CONFIG.peerConnection.connectionState}`);
                    
                    // Don't clean up immediately - give ICE restart a chance
                    setTimeout(() => {
                        if (CONFIG.peerConnection && 
                            (CONFIG.peerConnection.connectionState === 'disconnected' || 
                             CONFIG.peerConnection.connectionState === 'failed')) {
                            
                            // Check if ICE restart is already handling it
                            if (CONFIG.peerConnection.iceConnectionState === 'failed' ||
                                CONFIG.peerConnection.iceConnectionState === 'disconnected') {
                                console.log('❌ Connection not recovered, cleaning up');
                                DebugConsole?.call('Call', 'Call ended unexpectedly');
                                
                                // Force UI update
                                if (CONFIG.isAdmin) {
                                    const adminHangupBtn = document.getElementById('adminHangupBtn');
                                    if (adminHangupBtn) {
                                        adminHangupBtn.disabled = true;
                                        adminHangupBtn.className = 'btn-hangup';
                                    }
                                } else {
                                    const userHangupBtn = document.querySelector('.btn-hangup');
                                    if (userHangupBtn) {
                                        userHangupBtn.disabled = true;
                                        userHangupBtn.className = 'btn-hangup';
                                    }
                                }
                                
                                CallManager.cleanupCall();
                                UIManager.showStatus('Call disconnected');
                            }
                        }
                    }, 5000);
                    break;
                    
                case 'closed':
                    console.log('❌ Peer connection closed');
                    DebugConsole?.info('WebRTC', 'Peer connection closed');
                    CallManager.cleanupCall();
                    break;
            }
        };
        
        // Handle incoming tracks
        CONFIG.peerConnection.ontrack = (event) => {
            console.log('🎬 ontrack event:', event.track.kind);
            DebugConsole?.success('WebRTC', `Received remote ${event.track.kind} track`);
            
            if (event.track) {
                CONFIG.remoteStream.addTrack(event.track);
                DebugConsole?.info('WebRTC', `Added ${event.track.kind} to remote stream`);
                
                if (CONFIG.elements.remoteVideo) {
                    CONFIG.elements.remoteVideo.srcObject = CONFIG.remoteStream;
                    CONFIG.elements.remoteVideo.muted = false;
                    
                    CONFIG.elements.remoteVideo.play()
                        .then(() => {
                            console.log(`▶️ Remote ${event.track.kind} playing`);
                            DebugConsole?.success('WebRTC', `Remote ${event.track.kind} playing`);
                            
                            if (event.track.kind === 'audio') {
                                console.log('🔊 AUDIO TRACK CONNECTED!');
                                DebugConsole?.success('WebRTC', 'Audio track connected');
                                setTimeout(() => {
                                    const audioTracks = CONFIG.remoteStream.getAudioTracks();
                                    console.log(`Remote audio tracks: ${audioTracks.length}`);
                                    DebugConsole?.info('WebRTC', `Remote audio tracks: ${audioTracks.length}`);
                                }, 100);
                            }
                        })
                        .catch(error => {
                            console.log(`Play failed for ${event.track.kind}:`, error);
                            DebugConsole?.warning('WebRTC', `Play failed for ${event.track.kind}: ${error.message}`);
                        });
                }
            }
        };
        
        console.log('✅ Peer connection created with Trickle ICE enabled');
        DebugConsole?.success('WebRTC', 'Peer connection created successfully');
    },
    
    // ===== ICE RESTART METHOD =====
    async restartIce() {
        if (!CONFIG.peerConnection) {
            console.warn('No peer connection to restart ICE');
            return false;
        }
        
        console.log('🔄 Attempting ICE restart');
        DebugConsole?.info('WebRTC', 'ICE restart initiated');
        
        try {
            // Restart ICE on the connection
            await CONFIG.peerConnection.restartIce();
            
            // If we're the initiator, create a new offer
            if (CONFIG.isInitiator && CONFIG.targetSocketId) {
                console.log('📤 Creating new offer with ICE restart');
                
                const offer = await CONFIG.peerConnection.createOffer({ 
                    iceRestart: true 
                });
                
                await CONFIG.peerConnection.setLocalDescription(offer);
                
                // SEND VIA FIRESTORE - WITH SERIALIZATION
                FirestoreClient.sendToServer({
                    type: 'offer',
                    targetSocketId: CONFIG.targetSocketId,
                    offer: {
                        type: offer.type,
                        sdp: offer.sdp
                    },
                    sender: CONFIG.myUsername
                });
                
                console.log('✅ New offer sent with ICE restart');
                DebugConsole?.success('WebRTC', 'ICE restart offer sent');
            }
            
            return true;
            
        } catch (error) {
            console.error('❌ ICE restart failed:', error);
            DebugConsole?.error('WebRTC', `ICE restart failed: ${error.message}`);
            
            // If restart fails, we need to recreate the connection
            if (CONFIG.targetSocketId && CONFIG.isInitiator) {
                console.log('⚠️ ICE restart failed, recreating peer connection');
                
                // Save call info
                const targetId = CONFIG.targetSocketId;
                const targetName = CONFIG.targetUsername;
                
                // Clean up old connection
                CallManager.cleanupCall();
                
                // Create new connection and re-initiate
                this.createPeerConnection();
                
                if (CallManager.callUser) {
                    await CallManager.callUser(targetName, targetId);
                }
            }
            
            return false;
        }
    },
    
    // ===== TURN SERVER CONNECTIVITY TEST =====
    async testTurnServers() {
        console.log('🔍 Testing TURN server connectivity...');
        
        const servers = CONFIG.peerConfig?.iceServers || [];
        const turnServers = servers.filter(s => s.urls?.includes('turn:'));
        
        if (turnServers.length === 0) {
            console.log('⚠️ No TURN servers configured');
            return;
        }
        
        for (const server of turnServers) {
            const testPC = new RTCPeerConnection({ iceServers: [server] });
            testPC.createDataChannel('test');
            
            let relayFound = false;
            let testTimeout = setTimeout(() => {
                if (!relayFound) {
                    console.error(`❌ TURN server unreachable: ${server.urls}`);
                    CONFIG.iceFailureReasons.push(`TURN timeout: ${server.urls}`);
                    DebugConsole?.error('ICE', `TURN timeout: ${server.urls}`);
                }
                testPC.close();
            }, 3000);
            
            testPC.onicecandidate = (e) => {
                if (e.candidate && e.candidate.candidate.includes('relay')) {
                    relayFound = true;
                    console.log(`✅ TURN server working: ${server.urls}`);
                    clearTimeout(testTimeout);
                    testPC.close();
                }
            };
            
            await testPC.createOffer();
            await testPC.setLocalDescription(testPC.localDescription);
        }
    },
    
    // ===== ICE FAILURE ANALYSIS =====
    analyzeIceFailure() {
        console.log('🔍 Analyzing ICE failure...');
        
        // Check browser compatibility
        if (!RTCPeerConnection) {
            console.error('❌ WebRTC not supported in this browser');
            CONFIG.iceFailureReasons.push('WebRTC not supported');
        }
        
        // Check if we have any ICE servers configured
        if (!CONFIG.peerConfig?.iceServers || CONFIG.peerConfig.iceServers.length === 0) {
            console.error('❌ No ICE servers configured');
            CONFIG.iceFailureReasons.push('No ICE servers');
        }
        
        // Log all collected reasons
        if (CONFIG.iceFailureReasons.length > 0) {
            console.log('📋 Failure reasons:', CONFIG.iceFailureReasons);
            DebugConsole?.error('ICE', `Failure: ${CONFIG.iceFailureReasons.join(', ')}`);
        }
    },
    
    async createAndSendOffer() {
        if (!CONFIG.peerConnection || !CONFIG.targetSocketId) {
            console.error('No peer connection or target');
            DebugConsole?.error('WebRTC', 'No peer connection or target for offer');
            return;
        }
        
        try {
            console.log('📤 Creating offer with Trickle ICE...');
            DebugConsole?.network('WebRTC', 'Creating offer');
            
            const offer = await CONFIG.peerConnection.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });
            
            // Check SDP for audio
            if (offer.sdp) {
                const hasAudio = offer.sdp.includes('m=audio');
                console.log(`📄 SDP - Has audio: ${hasAudio ? '✅' : '❌'}`);
                DebugConsole?.info('WebRTC', `Offer SDP - Audio: ${hasAudio ? 'Yes' : 'No'}`);
                
                if (offer.sdp.includes('opus')) {
                    console.log('  Using Opus codec');
                    DebugConsole?.info('WebRTC', 'Using Opus audio codec');
                }
            }
            
            await CONFIG.peerConnection.setLocalDescription(offer);
            console.log('✅ Local description set - Trickle ICE will send candidates as they arrive');
            DebugConsole?.network('WebRTC', 'Local description set');
            
            // SEND VIA FIRESTORE - WITH SERIALIZATION
            FirestoreClient.sendToServer({
                type: 'offer',
                targetSocketId: CONFIG.targetSocketId,
                offer: {
                    type: offer.type,
                    sdp: offer.sdp
                },
                sender: CONFIG.myUsername
            });
            
            console.log('✅ Offer sent');
            DebugConsole?.network('WebRTC', 'Offer sent to peer');
            
        } catch (error) {
            console.error('❌ Error creating/sending offer:', error);
            DebugConsole?.error('WebRTC', `Error creating offer: ${error.message}`);
            UIManager.showError('Failed to start call: ' + error.message);
            CallManager.cleanupCall();
        }
    },
    
    async handleOffer(data) {
        console.log('📥 Received offer from:', data.sender || 'unknown');
        DebugConsole?.network('WebRTC', `Received offer from ${data.sender || 'unknown'}`);
        
        if (!CONFIG.peerConnection) {
            DebugConsole?.info('WebRTC', 'No peer connection, creating one');
            this.createPeerConnection();
        }
        
        if (data.senderSocketId && !CONFIG.targetSocketId) {
            CONFIG.targetSocketId = data.senderSocketId;
            DebugConsole?.info('WebRTC', `Set target socket to ${data.senderSocketId}`);
        }
        
        try {
            // Reconstruct RTCSessionDescription from serialized data
            const offerDescription = new RTCSessionDescription({
                type: data.offer.type,
                sdp: data.offer.sdp
            });
            
            await CONFIG.peerConnection.setRemoteDescription(offerDescription);
            console.log('✅ Remote description set');
            DebugConsole?.network('WebRTC', 'Remote description set');
            
            const answer = await CONFIG.peerConnection.createAnswer();
            await CONFIG.peerConnection.setLocalDescription(answer);
            
            // SEND VIA FIRESTORE - WITH SERIALIZATION
            FirestoreClient.sendToServer({
                type: 'answer',
                targetSocketId: CONFIG.targetSocketId,
                answer: {
                    type: answer.type,
                    sdp: answer.sdp
                },
                sender: CONFIG.myUsername
            });
            
            console.log('✅ Answer sent - Trickle ICE will send candidates as they arrive');
            DebugConsole?.network('WebRTC', 'Answer sent to peer');
            this.processIceCandidateQueue();
            
        } catch (error) {
            console.error('❌ Error handling offer:', error);
            DebugConsole?.error('WebRTC', `Error handling offer: ${error.message}`);
            UIManager.showError('Call setup failed: ' + error.message);
            CallManager.cleanupCall();
        }
    },
    
    async handleAnswer(data) {
        console.log('📥 Received answer from:', data.sender || 'unknown');
        DebugConsole?.network('WebRTC', `Received answer from ${data.sender || 'unknown'}`);
        
        if (!CONFIG.peerConnection) {
            console.error('No peer connection for answer');
            DebugConsole?.error('WebRTC', 'No peer connection for answer');
            return;
        }
        
        try {
            // Reconstruct RTCSessionDescription from serialized data
            const answerDescription = new RTCSessionDescription({
                type: data.answer.type,
                sdp: data.answer.sdp
            });
            
            await CONFIG.peerConnection.setRemoteDescription(answerDescription);
            console.log('✅ Remote description set');
            DebugConsole?.network('WebRTC', 'Remote description set from answer');
            this.processIceCandidateQueue();
            
        } catch (error) {
            console.error('❌ Error handling answer:', error);
            DebugConsole?.error('WebRTC', `Error handling answer: ${error.message}`);
            UIManager.showError('Call setup failed: ' + error.message);
            CallManager.cleanupCall();
        }
    },
    
    handleIceCandidate(data) {
        if (!data.candidate) return;
        
        console.log('🧊 Received ICE candidate');
        DebugConsole?.network('WebRTC', 'Received ICE candidate from peer');
        
        if (!CONFIG.peerConnection) {
            console.log('Queueing ICE candidate (Trickle ICE ready)');
            DebugConsole?.info('WebRTC', 'Queueing ICE candidate (no peer connection)');
            CONFIG.iceCandidatesQueue.push(data.candidate);
            return;
        }
        
        try {
            // Reconstruct RTCIceCandidate from serialized data
            const iceCandidate = new RTCIceCandidate({
                candidate: data.candidate.candidate,
                sdpMid: data.candidate.sdpMid,
                sdpMLineIndex: data.candidate.sdpMLineIndex,
                usernameFragment: data.candidate.usernameFragment
            });
            
            CONFIG.peerConnection.addIceCandidate(iceCandidate)
                .then(() => {
                    console.log('✅ ICE candidate added');
                    DebugConsole?.network('WebRTC', 'ICE candidate added');
                })
                .catch(e => {
                    console.error('❌ Failed to add ICE candidate:', e);
                    DebugConsole?.error('WebRTC', `Failed to add ICE candidate: ${e.message}`);
                });
        } catch (error) {
            console.error('❌ Error creating ICE candidate:', error);
            DebugConsole?.error('WebRTC', `Error creating ICE candidate: ${error.message}`);
        }
    },
    
    processIceCandidateQueue() {
        if (!CONFIG.peerConnection || CONFIG.iceCandidatesQueue.length === 0) return;
        
        console.log(`Processing ${CONFIG.iceCandidatesQueue.length} queued ICE candidates (Trickle ICE)`);
        DebugConsole?.info('WebRTC', `Processing ${CONFIG.iceCandidatesQueue.length} queued ICE candidates`);
        
        CONFIG.iceCandidatesQueue.forEach(candidate => {
            try {
                // Reconstruct RTCIceCandidate from serialized data
                const iceCandidate = new RTCIceCandidate({
                    candidate: candidate.candidate,
                    sdpMid: candidate.sdpMid,
                    sdpMLineIndex: candidate.sdpMLineIndex,
                    usernameFragment: candidate.usernameFragment
                });
                
                CONFIG.peerConnection.addIceCandidate(iceCandidate)
                    .catch(e => {
                        console.error('❌ Failed to add queued ICE candidate:', e);
                        DebugConsole?.error('WebRTC', `Failed to add queued ICE candidate: ${e.message}`);
                    });
            } catch (error) {
                console.error('❌ Error processing queued ICE candidate:', error);
                DebugConsole?.error('WebRTC', `Error processing queued ICE candidate: ${error.message}`);
            }
        });
        
        CONFIG.iceCandidatesQueue = [];
        DebugConsole?.info('WebRTC', 'ICE candidate queue cleared');
    },
    
    // ========== CAMERA DETECTION AND SWITCHING ==========
    // (Keep all your existing camera methods here - they remain unchanged)
    
    checkAudioState() {
        console.log('🔍 AUDIO STATE CHECK:');
        DebugConsole?.info('WebRTC', 'Audio state check');
        
        if (CONFIG.localStream) {
            const localAudio = CONFIG.localStream.getAudioTracks();
            console.log(`Local audio tracks: ${localAudio.length}`);
            DebugConsole?.info('WebRTC', `Local audio tracks: ${localAudio.length}`);
        }
        
        if (CONFIG.remoteStream) {
            const remoteAudio = CONFIG.remoteStream.getAudioTracks();
            console.log(`Remote audio tracks: ${remoteAudio.length}`);
            DebugConsole?.info('WebRTC', `Remote audio tracks: ${remoteAudio.length}`);
        }
        
        if (CONFIG.elements.remoteVideo) {
            console.log(`Remote video muted: ${CONFIG.elements.remoteVideo.muted}`);
            DebugConsole?.info('WebRTC', `Remote video muted: ${CONFIG.elements.remoteVideo.muted}`);
        }
    }
};

window.WebRTCManager = WebRTCManager;
