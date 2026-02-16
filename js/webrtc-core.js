// js/webrtc-core.js - COMPLETE WITH CONNECTION TIMEOUT (15 SECONDS)
const WebRTCManager = {
    // Camera properties
    hasMultipleCameras: false,
    currentFacingMode: 'user', // 'user' = front, 'environment' = rear
    cameraInitialized: false,
    cameraSwitchInProgress: false,
    
    createPeerConnection() {
        console.log('🔗 Creating peer connection with Trickle ICE...');
        DebugConsole?.info('WebRTC', 'Creating peer connection');
        
        // ===== NEW: Clear any existing timeout =====
        if (CONFIG.connectionTimeout) {
            clearTimeout(CONFIG.connectionTimeout);
            CONFIG.connectionTimeout = null;
        }
        
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
        
        // ===== NEW: 15-second connection timeout =====
        CONFIG.connectionTimeout = setTimeout(() => {
            if (CONFIG.peerConnection && 
                (CONFIG.peerConnection.connectionState === 'connecting' || 
                 CONFIG.peerConnection.iceConnectionState === 'checking')) {
                console.log('⏰ Connection timeout after 15s - forcing cleanup');
                DebugConsole?.warning('WebRTC', 'Connection timeout');
                
                UIManager.showStatus('Connection timed out');
                
                // Force cleanup
                if (CallManager) {
                    CallManager.cleanupCall();
                }
            }
        }, 15000); // 15 seconds
        
        // Track ICE gathering start time
        CONFIG.iceStartTime = Date.now();
        
        // CRITICAL: Initialize remote stream
        CONFIG.remoteStream = new MediaStream();
        DebugConsole?.info('WebRTC', 'Remote stream initialized');
        
        // Set up remote video element
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
            
            // Add audio tracks FIRST
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
                
                const serializedCandidate = {
                    candidate: event.candidate.candidate,
                    sdpMid: event.candidate.sdpMid,
                    sdpMLineIndex: event.candidate.sdpMLineIndex,
                    usernameFragment: event.candidate.usernameFragment
                };
                
                WebSocketClient.sendToServer({
                    type: 'ice-candidate',
                    targetSocketId: CONFIG.targetSocketId,
                    candidate: serializedCandidate
                });
            }
        };
        
        // ===== ICE CONNECTION STATE MONITORING =====
        CONFIG.peerConnection.oniceconnectionstatechange = () => {
            const state = CONFIG.peerConnection.iceConnectionState;
            console.log('🧊 ICE connection state:', state);
            DebugConsole?.network('WebRTC', `ICE state: ${state}`);
            
            // ===== NEW: Clear timeout if we connect =====
            if (state === 'connected' || state === 'completed') {
                if (CONFIG.connectionTimeout) {
                    clearTimeout(CONFIG.connectionTimeout);
                    CONFIG.connectionTimeout = null;
                }
            }
            
            if (state === 'checking') {
                CONFIG.iceStartTime = Date.now();
                console.log('⏳ ICE checking started...');
                setTimeout(() => this.testTurnServers(), 100);
            }
            
            if (state === 'connected' || state === 'completed') {
                const connectTime = Date.now() - (CONFIG.iceStartTime || Date.now());
                console.log(`✅ ICE connected in ${connectTime}ms`);
                
                CONFIG.peerConnection.getStats().then(stats => {
                    stats.forEach(report => {
                        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                            const localType = report.localCandidateType;
                            const remoteType = report.remoteCandidateType;
                            console.log(`📡 Connection using: local=${localType}, remote=${remoteType}`);
                            
                            if (localType === 'relay' || remoteType === 'relay') {
                                DebugConsole?.info('WebRTC', 'Using TURN relay');
                            } else if (localType === 'srflx' || remoteType === 'srflx') {
                                DebugConsole?.info('WebRTC', 'Using STUN');
                            }
                        }
                    });
                });
            }
            
            if (state === 'failed') {
                const failTime = Date.now() - (CONFIG.iceStartTime || Date.now());
                console.error(`❌ ICE failed after ${failTime}ms`);
                DebugConsole?.error('ICE', `ICE failed after ${failTime}ms`);
                
                // ===== NEW: Clear timeout on failure =====
                if (CONFIG.connectionTimeout) {
                    clearTimeout(CONFIG.connectionTimeout);
                    CONFIG.connectionTimeout = null;
                }
                
                this.analyzeIceFailure();
                
                console.log('📊 Candidate stats:', CONFIG.iceCandidateGathering);
                
                if (CONFIG.iceCandidateGathering.relayCandidates === 0) {
                    console.error('❌ No relay candidates - TURN servers may be unreachable');
                    DebugConsole?.error('ICE', 'No relay candidates');
                    CONFIG.iceFailureReasons.push('No relay candidates');
                }
                
                if (CONFIG.iceCandidateGathering.srflxCandidates === 0) {
                    console.error('❌ No server reflexive candidates - STUN may be blocked');
                    DebugConsole?.error('ICE', 'No STUN candidates');
                    CONFIG.iceFailureReasons.push('No STUN candidates');
                }
                
                setTimeout(() => this.restartIce(), 2000);
            }
            
            if (state === 'disconnected') {
                console.log('⚠️ ICE disconnected, waiting for recovery...');
                DebugConsole?.warning('WebRTC', 'ICE disconnected');
                
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
            
            // ===== NEW: Clear timeout if we connect =====
            if (CONFIG.peerConnection.connectionState === 'connected') {
                if (CONFIG.connectionTimeout) {
                    clearTimeout(CONFIG.connectionTimeout);
                    CONFIG.connectionTimeout = null;
                }
            }
            
            // ===== NEW: Clear timeout on failure =====
            if (CONFIG.peerConnection.connectionState === 'failed') {
                if (CONFIG.connectionTimeout) {
                    clearTimeout(CONFIG.connectionTimeout);
                    CONFIG.connectionTimeout = null;
                }
            }
            
            switch (CONFIG.peerConnection.connectionState) {
                case 'connected':
                    console.log('✅ PEER CONNECTION CONNECTED!');
                    DebugConsole?.success('WebRTC', 'Peer connection connected');
                    CONFIG.isInCall = true;
                    CONFIG.isProcessingAnswer = false;
                    UIManager.showStatus('Call connected');
                    UIManager.updateCallButtons();
                    
                    if (UIManager.updateWebRTCIndicator) {
                        UIManager.updateWebRTCIndicator('connected-no-rtt');
                    }
                    
                    try {
                        CONFIG.peerConnection.getStats().then(stats => {
                            stats.forEach(report => {
                                if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                                    if (report.currentRoundTripTime) {
                                        const rtt = Math.round(report.currentRoundTripTime * 1000);
                                        if (UIManager.updateWebRTCIndicator) {
                                            UIManager.updateWebRTCIndicator('connected', rtt);
                                        }
                                    }
                                }
                            });
                        }).catch(err => console.log('Could not get stats:', err));
                    } catch (statsError) {
                        console.log('Stats error:', statsError);
                    }
                    
                    setTimeout(() => {
                        const audioTracks = CONFIG.remoteStream.getAudioTracks();
                        console.log(`🔊 Connected! Remote audio tracks: ${audioTracks.length}`);
                        DebugConsole?.info('WebRTC', `Remote audio tracks: ${audioTracks.length}`);
                        DebugConsole?.success('Call', 'Call connected successfully');
                    }, 500);
                    break;
                    
                case 'connecting':
                    console.log('⏳ Peer connection connecting...');
                    DebugConsole?.info('WebRTC', 'Peer connection connecting');
                    if (UIManager.updateWebRTCIndicator) {
                        UIManager.updateWebRTCIndicator('connecting');
                    }
                    break;
                    
                case 'disconnected':
                    console.log('⚠️ Peer connection disconnected');
                    DebugConsole?.warning('WebRTC', 'Peer connection disconnected');
                    if (UIManager.updateWebRTCIndicator) {
                        UIManager.updateWebRTCIndicator('disconnected');
                    }
                    break;
                    
                case 'failed':
                    console.log('❌ Peer connection failed');
                    DebugConsole?.error('WebRTC', 'Peer connection failed');
                    if (UIManager.updateWebRTCIndicator) {
                        UIManager.updateWebRTCIndicator('failed');
                    }
                    break;
                    
                case 'closed':
                    console.log('❌ Peer connection closed');
                    DebugConsole?.info('WebRTC', 'Peer connection closed');
                    if (UIManager.updateWebRTCIndicator) {
                        UIManager.updateWebRTCIndicator('closed');
                    }
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
    
    // ===== RESTART ICE METHOD =====
    async restartIce() {
        if (!CONFIG.peerConnection) {
            console.warn('No peer connection to restart ICE');
            return false;
        }
        
        console.log('🔄 Attempting ICE restart');
        DebugConsole?.info('WebRTC', 'ICE restart initiated');
        
        try {
            await CONFIG.peerConnection.restartIce();
            
            if (CONFIG.isInitiator && CONFIG.targetSocketId) {
                console.log('📤 Creating new offer with ICE restart');
                
                const offer = await CONFIG.peerConnection.createOffer({ 
                    iceRestart: true 
                });
                
                await CONFIG.peerConnection.setLocalDescription(offer);
                
                WebSocketClient.sendToServer({
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
            
            if (CONFIG.targetSocketId && CONFIG.isInitiator) {
                console.log('⚠️ ICE restart failed, recreating peer connection');
                
                const targetId = CONFIG.targetSocketId;
                const targetName = CONFIG.targetUsername;
                
                CallManager.cleanupCall();
                this.createPeerConnection();
                
                if (CallManager.callUser) {
                    await CallManager.callUser(targetName, targetId);
                }
            }
            
            return false;
        }
    },
    
    // ===== TURN SERVER TEST =====
    async testTurnServers() {
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
            if (CONFIG.isInCall && CONFIG.peerConnection?.iceConnectionState === 'connected') {
                return;
            }
            
            const testPC = new RTCPeerConnection({ iceServers: [server] });
            testPC.createDataChannel('test');
            
            let relayFound = false;
            let testTimeout = setTimeout(() => {
                if (!relayFound && !CONFIG.isInCall) {
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
        
        if (!RTCPeerConnection) {
            console.error('❌ WebRTC not supported in this browser');
            CONFIG.iceFailureReasons.push('WebRTC not supported');
        }
        
        if (!CONFIG.peerConfig?.iceServers || CONFIG.peerConfig.iceServers.length === 0) {
            console.error('❌ No ICE servers configured');
            CONFIG.iceFailureReasons.push('No ICE servers');
        }
        
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
            console.log('✅ Local description set');
            DebugConsole?.network('WebRTC', 'Local description set');
            
            WebSocketClient.sendToServer({
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
            const offerDescription = new RTCSessionDescription({
                type: data.offer.type,
                sdp: data.offer.sdp
            });
            
            await CONFIG.peerConnection.setRemoteDescription(offerDescription);
            console.log('✅ Remote description set');
            DebugConsole?.network('WebRTC', 'Remote description set');
            
            const answer = await CONFIG.peerConnection.createAnswer();
            await CONFIG.peerConnection.setLocalDescription(answer);
            
            WebSocketClient.sendToServer({
                type: 'answer',
                targetSocketId: CONFIG.targetSocketId,
                answer: {
                    type: answer.type,
                    sdp: answer.sdp
                },
                sender: CONFIG.myUsername
            });
            
            console.log('✅ Answer sent');
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
            console.log('Queueing ICE candidate');
            DebugConsole?.info('WebRTC', 'Queueing ICE candidate');
            CONFIG.iceCandidatesQueue.push(data.candidate);
            return;
        }
        
        try {
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
        
        console.log(`Processing ${CONFIG.iceCandidatesQueue.length} queued ICE candidates`);
        DebugConsole?.info('WebRTC', `Processing ${CONFIG.iceCandidatesQueue.length} queued ICE candidates`);
        
        CONFIG.iceCandidatesQueue.forEach(candidate => {
            try {
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
    
    // ===== CAMERA METHODS (keep your existing camera methods) =====
    async initCameras() {
        // Your existing camera initialization code
    },
    
    // ... rest of your camera methods
    
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
