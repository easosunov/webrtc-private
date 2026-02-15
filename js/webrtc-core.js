// js/webrtc-core.js - FIRESTORE VERSION WITH CAMERA SWITCHING AND PROPER SERIALIZATION
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
            iceCandidatePoolSize: 5,
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
        
        // ===== ENHANCED ICE CONNECTION STATE MONITORING =====
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
        
        // Handle incoming tracks - FIXED for play interruption warning
        CONFIG.peerConnection.ontrack = (event) => {
            console.log('🎬 ontrack event:', event.track.kind);
            DebugConsole?.success('WebRTC', `Received remote ${event.track.kind} track`);
            
            if (event.track) {
                CONFIG.remoteStream.addTrack(event.track);
                DebugConsole?.info('WebRTC', `Added ${event.track.kind} to remote stream`);
                
                if (CONFIG.elements.remoteVideo) {
                    CONFIG.elements.remoteVideo.srcObject = CONFIG.remoteStream;
                    CONFIG.elements.remoteVideo.muted = false;
                    
                    // FIX: Only call play if video is not already playing
                    if (CONFIG.elements.remoteVideo.paused) {
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
                                // FIX: Only log if it's not the interruption error
                                if (error.name !== 'AbortError' && error.message && !error.message.includes('interrupted')) {
                                    console.log(`Play failed for ${event.track.kind}:`, error);
                                    DebugConsole?.warning('WebRTC', `Play failed for ${event.track.kind}: ${error.message}`);
                                }
                            });
                    }
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
    
    // ===== TURN SERVER CONNECTIVITY TEST - FIXED to reduce noise =====
    async testTurnServers() {
        // Don't test if call is already connected
        if (CONFIG.isInCall && CONFIG.peerConnection?.iceConnectionState === 'connected') {
            return;
        }
        
        console.log('🔍 Testing TURN server connectivity...');
        
        const servers = CONFIG.peerConfig?.iceServers || [];
        const turnServers = servers.filter(s => s.urls?.includes('turn:'));
        
        if (turnServers.length === 0) {
            console.log('⚠️ No TURN servers configured');
            return;
        }
        
        for (const server of turnServers) {
            // Don't test if call is already connected
            if (CONFIG.isInCall && CONFIG.peerConnection?.iceConnectionState === 'connected') {
                return;
            }
            
            const testPC = new RTCPeerConnection({ iceServers: [server] });
            testPC.createDataChannel('test');
            
            let relayFound = false;
            let testTimeout = setTimeout(() => {
                if (!relayFound && !CONFIG.isInCall) {
                    // FIX: Only log as info, not error, since TURN is optional
                    console.log(`ℹ️ TURN server timeout (normal if direct connection works): ${server.urls}`);
                    DebugConsole?.info('ICE', `TURN timeout (normal): ${server.urls}`);
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
    
    // Initialize camera detection - called AFTER stream exists
    async initCameras() {
        // Don't initialize twice
        if (this.cameraInitialized) {
            console.log('Camera already initialized');
            return;
        }
        
        console.log('📱 Initializing camera system...');
        DebugConsole?.info('Camera', 'Initializing camera system');
        
        // Wait for local stream to be available (but don't modify it)
        const streamReady = await this.waitForStream();
        if (!streamReady) {
            console.warn('No local stream available for camera initialization');
            return;
        }
        
        // Detect available cameras (this doesn't affect the stream)
        await this.detectCameras();
        
        // Setup click handlers (these just add event listeners)
        this.setupCameraClickHandlers();
        
        // Show camera indicator
        this.updateCameraIndicator();
        
        // Ensure video is actually playing
        this.ensureVideoDisplay();
        
        this.cameraInitialized = true;
        console.log('✅ Camera system initialized');
        DebugConsole?.success('Camera', 'Camera system initialized');
    },
    
    // Ensure video is displayed properly
    ensureVideoDisplay() {
        console.log('🔍 Ensuring video display...');
        
        if (!CONFIG.localStream) {
            console.warn('No local stream to display');
            return;
        }
        
        const localVideo = document.getElementById('localVideo');
        if (!localVideo) {
            console.warn('Local video element not found');
            return;
        }
        
        // Force the video element to use the stream
        localVideo.srcObject = CONFIG.localStream;
        localVideo.muted = true;
        
        // Try to play
        localVideo.play()
            .then(() => {
                console.log('✅ Local video playing');
                DebugConsole?.success('Video', 'Local video playing');
            })
            .catch(e => {
                console.log('Local video play error:', e);
                // Retry after a delay
                setTimeout(() => {
                    localVideo.play().catch(console.log);
                }, 500);
            });
    },
    
    // Wait for stream to be available
    waitForStream() {
        return new Promise((resolve) => {
            if (CONFIG.localStream && CONFIG.localStream.getVideoTracks().length > 0) {
                console.log('Stream already available');
                resolve(true);
                return;
            }
            
            console.log('Waiting for local stream...');
            let attempts = 0;
            const maxAttempts = 20; // 10 seconds total (500ms * 20)
            
            const checkInterval = setInterval(() => {
                attempts++;
                if (CONFIG.localStream && CONFIG.localStream.getVideoTracks().length > 0) {
                    console.log('Stream detected after', attempts * 0.5, 'seconds');
                    clearInterval(checkInterval);
                    resolve(true);
                } else if (attempts >= maxAttempts) {
                    console.warn('Stream timeout after', maxAttempts * 0.5, 'seconds');
                    clearInterval(checkInterval);
                    resolve(false);
                }
            }, 500);
        });
    },
    
    // Detect available cameras
    async detectCameras() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(device => device.kind === 'videoinput');
            
            this.hasMultipleCameras = videoDevices.length > 1;
            
            console.log(`📷 Detected ${videoDevices.length} camera(s)`);
            DebugConsole?.info('Camera', `Detected ${videoDevices.length} camera(s)`);
            
            videoDevices.forEach((device, index) => {
                console.log(`  Camera ${index + 1}: ${device.label || 'Unnamed'}`);
            });
            
            this.updateCameraButtonVisibility();
            return videoDevices;
        } catch (error) {
            console.error('Failed to detect cameras:', error);
            return [];
        }
    },
    
    // Setup click handlers for camera switching
    setupCameraClickHandlers() {
        const localVideo = document.getElementById('localVideo');
        if (!localVideo) {
            console.warn('Local video element not found');
            return;
        }
        
        // Remove any existing listeners by cloning
        const newLocalVideo = localVideo.cloneNode(true);
        if (localVideo.parentNode) {
            localVideo.parentNode.replaceChild(newLocalVideo, localVideo);
            
            // Add click handler to new video
            newLocalVideo.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleCameraClick();
            });
            
            // Visual indicator
            newLocalVideo.style.cursor = 'pointer';
            newLocalVideo.title = 'Click to switch camera';
            
            // Re-attach drag handlers after a delay
            setTimeout(() => {
                if (typeof initDraggableVideo === 'function') {
                    initDraggableVideo();
                }
            }, 100);
        }
        
        // Also setup button click handler
        const switchBtn = document.getElementById('switchCameraBtn');
        if (switchBtn) {
            // Remove old listeners by cloning
            const newBtn = switchBtn.cloneNode(true);
            if (switchBtn.parentNode) {
                switchBtn.parentNode.replaceChild(newBtn, switchBtn);
                
                newBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.handleCameraClick();
                });
            }
        }
        
        console.log('Camera click handlers setup complete');
    },
    
    // Handle camera click (from video or button)
    async handleCameraClick() {
        if (this.cameraSwitchInProgress) {
            console.log('Camera switch already in progress');
            return;
        }
        
        if (!this.hasMultipleCameras) {
            DebugConsole?.info('Camera', 'No alternative camera available');
            UIManager.showStatus('Only one camera detected');
            return;
        }
        
        if (!CONFIG.localStream) {
            console.warn('No local stream for camera switch');
            return;
        }
        
        await this.switchCamera();
    },
    
    // Update camera button visibility
    updateCameraButtonVisibility() {
        const switchBtn = document.getElementById('switchCameraBtn');
        if (switchBtn) {
            switchBtn.style.display = this.hasMultipleCameras ? 'inline-block' : 'none';
            console.log(`Camera button ${this.hasMultipleCameras ? 'shown' : 'hidden'}`);
        }
    },
    
    // Update camera indicator
    updateCameraIndicator() {
        let indicator = document.getElementById('cameraIndicator');
        
        // Create indicator if it doesn't exist
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'cameraIndicator';
            indicator.style.cssText = `
                position: fixed;
                bottom: 20px;
                left: 20px;
                background: rgba(0,0,0,0.7);
                color: white;
                padding: 8px 16px;
                border-radius: 30px;
                font-size: 16px;
                font-weight: bold;
                z-index: 10001;
                pointer-events: none;
                box-shadow: 0 2px 10px rgba(0,0,0,0.3);
                backdrop-filter: blur(5px);
                border: 1px solid rgba(255,255,255,0.2);
            `;
            document.body.appendChild(indicator);
            console.log('Created camera indicator');
        }
        
        if (CONFIG.localStream && CONFIG.localStream.getVideoTracks().length > 0) {
            indicator.style.display = 'block';
            indicator.innerHTML = this.currentFacingMode === 'user' ? '🤳 FRONT CAMERA' : '📷 REAR CAMERA';
        } else {
            indicator.style.display = 'none';
        }
    },
    
    // Recover video if it disappears
    recoverVideo() {
        console.log('🔄 Attempting to recover video...');
        
        if (!CONFIG.localStream) {
            console.warn('No stream to recover');
            return false;
        }
        
        const localVideo = document.getElementById('localVideo');
        if (!localVideo) {
            console.warn('Local video element not found');
            return false;
        }
        
        // Check if stream has video tracks
        const videoTracks = CONFIG.localStream.getVideoTracks();
        if (videoTracks.length === 0) {
            console.warn('No video tracks in stream');
            return false;
        }
        
        console.log('Video track readyState:', videoTracks[0].readyState);
        console.log('Video track enabled:', videoTracks[0].enabled);
        
        // Reattach the stream
        localVideo.srcObject = CONFIG.localStream;
        localVideo.muted = true;
        
        // Try to play with promise handling
        const playPromise = localVideo.play();
        if (playPromise !== undefined) {
            playPromise
                .then(() => {
                    console.log('✅ Video recovered successfully');
                    DebugConsole?.success('Video', 'Video recovered');
                    return true;
                })
                .catch(error => {
                    console.log('Recovery play failed:', error);
                    // Try one more time with user interaction
                    document.addEventListener('click', function onClick() {
                        localVideo.play().catch(console.log);
                        document.removeEventListener('click', onClick);
                    }, { once: true });
                    UIManager.showStatus('Click screen to restore video');
                    return false;
                });
        }
        return true;
    },
    
    // Switch camera during active call - SIMPLIFIED AND RELIABLE
    async switchCamera() {
        if (this.cameraSwitchInProgress) {
            console.log('Camera switch already in progress, skipping');
            return false;
        }
        
        if (!CONFIG.localStream) {
            console.warn('No local stream to switch camera');
            UIManager.showError('No camera active');
            return false;
        }
        
        this.cameraSwitchInProgress = true;
        console.log('🔄 Attempting to switch camera from', this.currentFacingMode);
        DebugConsole?.info('Camera', 'Switching camera...');
        
        // Show feedback
        UIManager.showStatus('Switching camera...');
        
        // Toggle facing mode
        const newFacingMode = this.currentFacingMode === 'user' ? 'environment' : 'user';
        
        try {
            // Get current audio tracks
            const audioTracks = CONFIG.localStream.getAudioTracks();
            
            // Get the local video element
            const localVideo = document.getElementById('localVideo');
            
            // Stop all tracks in the current stream
            CONFIG.localStream.getTracks().forEach(track => {
                track.stop();
            });
            
            // Clear the video element
            if (localVideo) {
                localVideo.srcObject = null;
            }
            
            // Small delay to let hardware reset
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // Create new constraints
            const constraints = {
                audio: true,
                video: {
                    facingMode: newFacingMode,
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                }
            };
            
            console.log('📷 Requesting camera with facing mode:', newFacingMode);
            
            // Get brand new stream
            const newStream = await navigator.mediaDevices.getUserMedia(constraints);
            
            // Update CONFIG with new stream
            CONFIG.localStream = newStream;
            
            // Set the new stream to video element
            if (localVideo) {
                localVideo.srcObject = newStream;
                localVideo.muted = true;
                
                // Play
                try {
                    await localVideo.play();
                    console.log('✅ Local video playing after switch');
                } catch (playError) {
                    console.log('Play error after switch:', playError);
                    // Retry once
                    setTimeout(async () => {
                        try {
                            await localVideo.play();
                            console.log('✅ Local video playing after retry');
                        } catch (e) {
                            console.log('Final play failed:', e);
                        }
                    }, 200);
                }
            }
            
            // If in a call, we need to renegotiate
            if (CONFIG.peerConnection && CONFIG.isInCall) {
                console.log('In call, need to renegotiate after camera switch');
                
                // Get the new video track
                const newVideoTrack = newStream.getVideoTracks()[0];
                
                // Replace the track in peer connection
                const senders = CONFIG.peerConnection.getSenders();
                const videoSender = senders.find(sender => 
                    sender.track && sender.track.kind === 'video'
                );
                
                if (videoSender) {
                    await videoSender.replaceTrack(newVideoTrack);
                    console.log('✅ Video track replaced in peer connection');
                }
                
                // Also need to update audio tracks if they changed
                const audioSender = senders.find(sender => 
                    sender.track && sender.track.kind === 'audio'
                );
                
                if (audioSender) {
                    const newAudioTrack = newStream.getAudioTracks()[0];
                    if (newAudioTrack) {
                        await audioSender.replaceTrack(newAudioTrack);
                        console.log('✅ Audio track replaced in peer connection');
                    }
                }
            }
            
            // Update facing mode
            this.currentFacingMode = newFacingMode;
            
            // Update indicator
            this.updateCameraIndicator();
            
            // Show success message
            const cameraIcon = newFacingMode === 'user' ? '🤳' : '📷';
            UIManager.showStatus(`${cameraIcon} ${newFacingMode === 'user' ? 'Front' : 'Rear'} camera`);
            
            this.cameraSwitchInProgress = false;
            return true;
            
        } catch (error) {
            console.error('Failed to switch camera:', error);
            DebugConsole?.error('Camera', `Switch failed: ${error.message}`);
            UIManager.showError('Could not switch camera');
            
            // Try to recover by requesting original camera
            try {
                console.log('Attempting to recover original camera...');
                const fallbackConstraints = {
                    audio: true,
                    video: {
                        facingMode: this.currentFacingMode,
                        width: { ideal: 640 },
                        height: { ideal: 480 }
                    }
                };
                const fallbackStream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
                CONFIG.localStream = fallbackStream;
                
                const localVideo = document.getElementById('localVideo');
                if (localVideo) {
                    localVideo.srcObject = fallbackStream;
                    localVideo.play().catch(console.log);
                }
                UIManager.showStatus('Reverted to original camera');
            } catch (fallbackError) {
                console.error('Recovery failed:', fallbackError);
            }
            
            this.cameraSwitchInProgress = false;
            return false;
        }
    },
    
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
