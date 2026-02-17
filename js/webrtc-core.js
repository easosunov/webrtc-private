// js/webrtc-core.js - COMPLETE WITH DISCONNECT HANDLING AND CAMERA SWITCHING
// MODIFIED: Aggressive TURN prioritization for VPN connections
const WebRTCManager = {
    // Camera properties
    hasMultipleCameras: false,
    currentFacingMode: 'user', // 'user' = front, 'environment' = rear
    cameraInitialized: false,
    cameraSwitchInProgress: false,
    
    createPeerConnection() {
        console.log('🔗 Creating peer connection...');
        DebugConsole?.info('WebRTC', 'Creating peer connection');
        
        // ===== MODIFIED: Use ICE servers from CONFIG.peerConfig =====
        let iceServers = CONFIG.peerConfig?.iceServers || [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" }
        ];
        
        // ===== ADDED: Separate TURN and STUN servers =====
        const turnServers = iceServers.filter(s => 
            s.urls && (s.urls.includes('turn:') || s.urls.includes('turns:'))
        );
        
        const stunServers = iceServers.filter(s => 
            s.urls && s.urls.includes('stun:')
        );
        
        // ===== ADDED: Prioritize TURN servers by putting them first =====
        // This makes WebRTC try TURN before STUN
        const prioritizedServers = [...turnServers, ...stunServers];
        
        console.log('🔧 TURN servers:', turnServers.length);
        console.log('🔧 STUN servers:', stunServers.length);
        console.log('🔧 Total ICE servers:', prioritizedServers.map(s => s.urls).join(', '));
        
        const config = {
            iceServers: prioritizedServers,
            iceCandidatePoolSize: 10,
            // ===== ADDED: Set ICE transport policy to prioritize relay =====
            iceTransportPolicy: "all", // Keep as "all" but TURN is first in list
            // Audio-specific optimizations
            sdpSemantics: 'unified-plan',
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require'
        };
        // ===== END MODIFICATION =====
        
        CONFIG.peerConnection = new RTCPeerConnection(config);
        DebugConsole?.info('WebRTC', 'Peer connection created');
        
        // ===== ADDED: Aggressive connection monitoring =====
        if (CONFIG.connectionTimeout) {
            clearTimeout(CONFIG.connectionTimeout);
        }
        if (CONFIG.iceTimeout) {
            clearTimeout(CONFIG.iceTimeout);
        }
        
        // Track connection state
        CONFIG.hasRelayCandidates = false;
        CONFIG.iceRestartAttempted = false;
        
        // Start a 5-second timer to check if we have any relay candidates
        CONFIG.relayCheckTimeout = setTimeout(() => {
            if (!CONFIG.hasRelayCandidates && turnServers.length > 0) {
                console.log('⚠️ No relay candidates generated - TURN servers may be unreachable');
                DebugConsole?.warning('WebRTC', 'No relay candidates - TURN may be blocked');
            }
        }, 5000);
        
        // Start a 8-second timer to check if we're stuck in ICE checking
        CONFIG.iceTimeout = setTimeout(() => {
            if (CONFIG.peerConnection && 
                CONFIG.peerConnection.iceConnectionState === 'checking' &&
                !CONFIG.iceRestartAttempted) {
                
                console.log('⏰ ICE stuck in checking - attempting restart with relay priority');
                DebugConsole?.warning('WebRTC', 'ICE stuck, forcing restart');
                
                CONFIG.iceRestartAttempted = true;
                this.restartIceWithRelay();
            }
        }, 8000);
        
        // Start a 12-second timer for full connection timeout
        CONFIG.connectionTimeout = setTimeout(() => {
            if (CONFIG.peerConnection && 
                CONFIG.peerConnection.connectionState !== 'connected' &&
                CONFIG.peerConnection.iceConnectionState !== 'connected') {
                
                console.log('⏰ Connection timeout - attempting TURN-only fallback...');
                DebugConsole?.warning('WebRTC', 'Connection timeout, switching to TURN-only');
                
                this.fallbackToTurnOnly(turnServers);
            }
        }, 12000);
        // ===== END ADDITION =====
        
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
        
        // Set up all peer connection handlers
        this.setupPeerConnectionHandlers(turnServers);
        
        console.log('✅ Peer connection created');
        DebugConsole?.success('WebRTC', 'Peer connection created successfully');
    },
    
    // ===== ADDED: Setup handlers with turnServers parameter =====
    setupPeerConnectionHandlers(turnServers) {
        if (!CONFIG.peerConnection) return;
        
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
        
        // ICE candidate handling with enhanced logging
        CONFIG.peerConnection.onicecandidate = (event) => {
            if (event.candidate && CONFIG.targetSocketId) {
                const candidateStr = event.candidate.candidate;
                const isRelay = candidateStr.includes('relay');
                const isSrflx = candidateStr.includes('srflx');
                const isHost = candidateStr.includes('host');
                
                if (isRelay) {
                    console.log('🔄 RELAY candidate generated (TURN)');
                    CONFIG.hasRelayCandidates = true;
                    
                    // Clear the relay check timeout since we got one
                    if (CONFIG.relayCheckTimeout) {
                        clearTimeout(CONFIG.relayCheckTimeout);
                        CONFIG.relayCheckTimeout = null;
                    }
                } else if (isSrflx) {
                    console.log('🌐 STUN candidate generated');
                } else if (isHost) {
                    console.log('🏠 Host candidate generated');
                }
                
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
            DebugConsole?.info('WebRTC', `Connection state: ${CONFIG.peerConnection.connectionState}`);
            
            // Clear all timeouts on successful connection
            if (CONFIG.peerConnection.connectionState === 'connected') {
                if (CONFIG.connectionTimeout) {
                    clearTimeout(CONFIG.connectionTimeout);
                    CONFIG.connectionTimeout = null;
                }
                if (CONFIG.iceTimeout) {
                    clearTimeout(CONFIG.iceTimeout);
                    CONFIG.iceTimeout = null;
                }
                if (CONFIG.relayCheckTimeout) {
                    clearTimeout(CONFIG.relayCheckTimeout);
                    CONFIG.relayCheckTimeout = null;
                }
            }
            
            switch (CONFIG.peerConnection.connectionState) {
                case 'connected':
                    console.log('✅ PEER CONNECTION CONNECTED!');
                    
                    // Check connection type
                    CONFIG.peerConnection.getStats().then(stats => {
                        stats.forEach(report => {
                            if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                                if (report.localCandidateType === 'relay' || report.remoteCandidateType === 'relay') {
                                    console.log('🔄 Connected via TURN relay (VPN friendly)');
                                } else if (report.localCandidateType === 'srflx' || report.remoteCandidateType === 'srflx') {
                                    console.log('🌐 Connected via STUN');
                                } else if (report.localCandidateType === 'host' || report.remoteCandidateType === 'host') {
                                    console.log('🏠 Connected via host (same network)');
                                }
                            }
                        });
                    }).catch(err => console.log('Could not get stats:', err));
                    
                    DebugConsole?.success('WebRTC', 'Peer connection connected');
                    CONFIG.isInCall = true;
                    CONFIG.isProcessingAnswer = false;
                    UIManager.showStatus('Call connected');
                    UIManager.updateCallButtons();
                    
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
                    
                    setTimeout(() => {
                        if (CONFIG.peerConnection && 
                            (CONFIG.peerConnection.connectionState === 'disconnected' || 
                             CONFIG.peerConnection.connectionState === 'failed')) {
                            console.log('❌ Connection not recovered, cleaning up');
                            DebugConsole?.call('Call', 'Call ended unexpectedly');
                            
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
                    }, 3000);
                    break;
                    
                case 'closed':
                    console.log('❌ Peer connection closed');
                    DebugConsole?.info('WebRTC', 'Peer connection closed');
                    CallManager.cleanupCall();
                    break;
            }
        };
        
        // ICE connection state monitoring
        CONFIG.peerConnection.oniceconnectionstatechange = () => {
            console.log('🧊 ICE connection state:', CONFIG.peerConnection.iceConnectionState);
            DebugConsole?.network('WebRTC', `ICE connection state: ${CONFIG.peerConnection.iceConnectionState}`);
            
            if (CONFIG.peerConnection.iceConnectionState === 'connected') {
                console.log('✅ ICE connected - network path established');
                if (CONFIG.connectionTimeout) {
                    clearTimeout(CONFIG.connectionTimeout);
                    CONFIG.connectionTimeout = null;
                }
                if (CONFIG.iceTimeout) {
                    clearTimeout(CONFIG.iceTimeout);
                    CONFIG.iceTimeout = null;
                }
            }
            
            if (CONFIG.peerConnection.iceConnectionState === 'disconnected') {
                console.log('⚠️ ICE disconnected, waiting for recovery...');
            }
            
            if (CONFIG.peerConnection.iceConnectionState === 'failed') {
                console.log('❌ ICE failed - connection dead');
                DebugConsole?.error('WebRTC', 'ICE connection failed');
                
                setTimeout(() => {
                    if (CONFIG.peerConnection && 
                        CONFIG.peerConnection.iceConnectionState === 'failed') {
                        CallManager.cleanupCall();
                        UIManager.showStatus('Call disconnected (network error)');
                    }
                }, 1000);
            }
        };
    },
    
    // ===== ADDED: Restart ICE with relay priority =====
    async restartIceWithRelay() {
        if (!CONFIG.peerConnection) return;
        
        try {
            console.log('🔄 Attempting ICE restart with relay priority');
            
            // Create new offer with ICE restart
            const offer = await CONFIG.peerConnection.createOffer({ 
                iceRestart: true 
            });
            
            await CONFIG.peerConnection.setLocalDescription(offer);
            
            // Send the new offer
            if (CONFIG.targetSocketId) {
                WebSocketClient.sendToServer({
                    type: 'offer',
                    targetSocketId: CONFIG.targetSocketId,
                    offer: offer,
                    sender: CONFIG.myUsername
                });
                console.log('✅ ICE restart offer sent');
            }
        } catch (error) {
            console.error('❌ ICE restart failed:', error);
        }
    },
    
    // ===== ADDED: Fallback to TURN-only mode =====
    async fallbackToTurnOnly(turnServers) {
        if (turnServers.length === 0) {
            console.log('❌ No TURN servers available for fallback');
            CallManager.cleanupCall();
            UIManager.showError('Connection failed - no relay available');
            return;
        }
        
        // Store current call info
        const targetId = CONFIG.targetSocketId;
        const targetName = CONFIG.targetUsername;
        const wasInitiator = CONFIG.isInitiator;
        
        // Clean up current connection
        if (CONFIG.peerConnection) {
            CONFIG.peerConnection.close();
            CONFIG.peerConnection = null;
        }
        
        console.log('🔄 Falling back to TURN-only servers:', turnServers.map(s => s.urls).join(', '));
        
        const turnConfig = {
            iceServers: turnServers,
            iceTransportPolicy: "relay", // Force TURN only
            iceCandidatePoolSize: 10,
            sdpSemantics: 'unified-plan',
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require'
        };
        
        // Create new connection with TURN only
        CONFIG.peerConnection = new RTCPeerConnection(turnConfig);
        CONFIG.forceRelay = true;
        
        // Re-add tracks
        if (CONFIG.localStream && CONFIG.hasMediaPermissions) {
            CONFIG.localStream.getTracks().forEach(track => {
                CONFIG.peerConnection.addTrack(track, CONFIG.localStream);
            });
        }
        
        // Set up handlers again
        this.setupPeerConnectionHandlers(turnServers);
        
        UIManager.showStatus('Switching to relay mode...');
        
        // Restart the call
        if (wasInitiator && targetId) {
            setTimeout(() => {
                this.createAndSendOffer();
            }, 500);
        }
    },
    
    async createAndSendOffer() {
        if (!CONFIG.peerConnection || !CONFIG.targetSocketId) {
            console.error('No peer connection or target');
            DebugConsole?.error('WebRTC', 'No peer connection or target for offer');
            return;
        }
        
        try {
            console.log('📤 Creating offer...');
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
                offer: offer,
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
            await CONFIG.peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
            console.log('✅ Remote description set');
            DebugConsole?.network('WebRTC', 'Remote description set');
            
            const answer = await CONFIG.peerConnection.createAnswer();
            await CONFIG.peerConnection.setLocalDescription(answer);
            
            WebSocketClient.sendToServer({
                type: 'answer',
                targetSocketId: CONFIG.targetSocketId,
                answer: answer,
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
            await CONFIG.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
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
            DebugConsole?.info('WebRTC', 'Queueing ICE candidate (no peer connection)');
            CONFIG.iceCandidatesQueue.push(data.candidate);
            return;
        }
        
        try {
            const iceCandidate = new RTCIceCandidate(data.candidate);
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
                const iceCandidate = new RTCIceCandidate(candidate);
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

async initCameras() {
    if (this.cameraInitialized) {
        console.log('Camera already initialized');
        return;
    }
    
    console.log('📱 Initializing camera system...');
    DebugConsole?.info('Camera', 'Initializing camera system');
    
    const streamReady = await this.waitForStream();
    if (!streamReady) {
        console.warn('No local stream available for camera initialization');
        return;
    }
    
    await this.detectCameras();
    this.setupCameraClickHandlers();
    this.updateCameraIndicator();
    this.ensureVideoDisplay();
    
    this.cameraInitialized = true;
    console.log('✅ Camera system initialized');
    DebugConsole?.success('Camera', 'Camera system initialized');
},

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
    
    localVideo.srcObject = CONFIG.localStream;
    localVideo.muted = true;
    
    localVideo.play()
        .then(() => {
            console.log('✅ Local video playing');
            DebugConsole?.success('Video', 'Local video playing');
        })
        .catch(e => {
            console.log('Local video play error:', e);
            setTimeout(() => {
                localVideo.play().catch(console.log);
            }, 500);
        });
},

waitForStream() {
    return new Promise((resolve) => {
        if (CONFIG.localStream && CONFIG.localStream.getVideoTracks().length > 0) {
            console.log('Stream already available');
            resolve(true);
            return;
        }
        
        console.log('Waiting for local stream...');
        let attempts = 0;
        const maxAttempts = 20;
        
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

setupCameraClickHandlers() {
    const localVideo = document.getElementById('localVideo');
    if (!localVideo) {
        console.warn('Local video element not found');
        return;
    }
    
    const newLocalVideo = localVideo.cloneNode(true);
    if (localVideo.parentNode) {
        localVideo.parentNode.replaceChild(newLocalVideo, localVideo);
        
        newLocalVideo.addEventListener('click', (e) => {
            e.stopPropagation();
            this.handleCameraClick();
        });
        
        newLocalVideo.style.cursor = 'pointer';
        newLocalVideo.title = 'Click to switch camera';
        
        setTimeout(() => {
            if (typeof initDraggableVideo === 'function') {
                initDraggableVideo();
            }
        }, 100);
    }
    
    const switchBtn = document.getElementById('switchCameraBtn');
    if (switchBtn) {
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

updateCameraButtonVisibility() {
    const switchBtn = document.getElementById('switchCameraBtn');
    if (switchBtn) {
        switchBtn.style.display = this.hasMultipleCameras ? 'inline-block' : 'none';
        console.log(`Camera button ${this.hasMultipleCameras ? 'shown' : 'hidden'}`);
    }
},

updateCameraIndicator() {
    let indicator = document.getElementById('cameraIndicator');
    
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
    
    const videoTracks = CONFIG.localStream.getVideoTracks();
    if (videoTracks.length === 0) {
        console.warn('No video tracks in stream');
        return false;
    }
    
    console.log('Video track readyState:', videoTracks[0].readyState);
    console.log('Video track enabled:', videoTracks[0].enabled);
    
    localVideo.srcObject = CONFIG.localStream;
    localVideo.muted = true;
    
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
    
    UIManager.showStatus('Switching camera...');
    
    const newFacingMode = this.currentFacingMode === 'user' ? 'environment' : 'user';
    
    try {
        const audioTracks = CONFIG.localStream.getAudioTracks();
        const localVideo = document.getElementById('localVideo');
        
        CONFIG.localStream.getTracks().forEach(track => {
            track.stop();
        });
        
        if (localVideo) {
            localVideo.srcObject = null;
        }
        
        await new Promise(resolve => setTimeout(resolve, 300));
        
        const constraints = {
            audio: true,
            video: {
                facingMode: newFacingMode,
                width: { ideal: 640 },
                height: { ideal: 480 }
            }
        };
        
        console.log('📷 Requesting camera with facing mode:', newFacingMode);
        
        const newStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        CONFIG.localStream = newStream;
        
        if (localVideo) {
            localVideo.srcObject = newStream;
            localVideo.muted = true;
            
            try {
                await localVideo.play();
                console.log('✅ Local video playing after switch');
            } catch (playError) {
                console.log('Play error after switch:', playError);
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
        
        if (CONFIG.peerConnection && CONFIG.isInCall) {
            console.log('In call, need to renegotiate after camera switch');
            
            const newVideoTrack = newStream.getVideoTracks()[0];
            const senders = CONFIG.peerConnection.getSenders();
            const videoSender = senders.find(sender => 
                sender.track && sender.track.kind === 'video'
            );
            
            if (videoSender) {
                await videoSender.replaceTrack(newVideoTrack);
                console.log('✅ Video track replaced in peer connection');
            }
            
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
        
        this.currentFacingMode = newFacingMode;
        this.updateCameraIndicator();
        
        const cameraIcon = newFacingMode === 'user' ? '🤳' : '📷';
        UIManager.showStatus(`${cameraIcon} ${newFacingMode === 'user' ? 'Front' : 'Rear'} camera`);
        
        this.cameraSwitchInProgress = false;
        return true;
        
    } catch (error) {
        console.error('Failed to switch camera:', error);
        DebugConsole?.error('Camera', `Switch failed: ${error.message}`);
        UIManager.showError('Could not switch camera');
        
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
