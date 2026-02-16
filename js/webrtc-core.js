// js/webrtc-core.js - COMPLETE WITH DISCONNECT HANDLING AND CAMERA SWITCHING
// MODIFIED: Forces both admin and user to use identical TURN servers
const WebRTCManager = {
    // Camera properties
    hasMultipleCameras: false,
    currentFacingMode: 'user', // 'user' = front, 'environment' = rear
    cameraInitialized: false,
    cameraSwitchInProgress: false,
    
    createPeerConnection() {
        console.log('🔗 Creating peer connection...');
        DebugConsole?.info('WebRTC', 'Creating peer connection');
        
        // ===== MODIFIED: Use ICE servers from CONFIG.peerConfig (loaded by main.js) =====
        // This ensures admin and user get the EXACT SAME TURN servers
        let iceServers = CONFIG.peerConfig?.iceServers || [
            // Fallback to STUN only if config fails
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" }
        ];
        
        // CRITICAL: Extract and prioritize TURN servers to ensure they're used
        const turnServers = iceServers.filter(s => 
            s.urls && (s.urls.includes('turn:') || s.urls.includes('turns:'))
        );
        
        const stunServers = iceServers.filter(s => 
            s.urls && s.urls.includes('stun:')
        );
        
        // Force TURN servers to be first in the list (highest priority)
        if (turnServers.length > 0) {
            console.log(`🔄 TURN servers available: ${turnServers.length}`);
            // Put TURN servers first, then STUN as fallback
            iceServers = [...turnServers, ...stunServers];
            
            // Log the TURN servers being used
            turnServers.forEach((server, index) => {
                console.log(`   TURN ${index + 1}: ${server.urls}`);
            });
        } else {
            console.log('⚠️ No TURN servers available - using STUN only');
        }
        
        // Log what servers we're using (for debugging)
        console.log('🔧 Final ICE servers:', iceServers.map(s => s.urls).join(', '));
        DebugConsole?.info('WebRTC', `ICE servers: ${iceServers.length} configured (${turnServers.length} TURN)`);
        
        const config = {
            iceServers: iceServers,  // Use the configured servers with TURN prioritized
            iceCandidatePoolSize: 10,
            // Audio-specific optimizations
            sdpSemantics: 'unified-plan',
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require'
        };
        // ===== END MODIFICATION =====
        
        CONFIG.peerConnection = new RTCPeerConnection(config);
        DebugConsole?.info('WebRTC', 'Peer connection created');
        
        // CRITICAL: Initialize remote stream
        CONFIG.remoteStream = new MediaStream();
        DebugConsole?.info('WebRTC', 'Remote stream initialized');
        
        // Set up remote video element - ENSURE AUDIO IS NOT MUTED
        if (CONFIG.elements.remoteVideo) {
            CONFIG.elements.remoteVideo.srcObject = CONFIG.remoteStream;
            CONFIG.elements.remoteVideo.muted = false;  // THIS IS KEY FOR AUDIO
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
                        // Ensure audio track is enabled
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
        
        // Handle incoming tracks - FIXED VERSION
        CONFIG.peerConnection.ontrack = (event) => {
            console.log('🎬 ontrack event:', event.track.kind);
            DebugConsole?.success('WebRTC', `Received remote ${event.track.kind} track`);
            
            if (event.track) {
                // Add track to our remote stream
                CONFIG.remoteStream.addTrack(event.track);
                DebugConsole?.info('WebRTC', `Added ${event.track.kind} to remote stream`);
                
                // CRITICAL: Update the remote video element
                if (CONFIG.elements.remoteVideo) {
                    // Ensure we're using the correct stream
                    CONFIG.elements.remoteVideo.srcObject = CONFIG.remoteStream;
                    // ENSURE AUDIO IS NOT MUTED
                    CONFIG.elements.remoteVideo.muted = false;
                    
                    // Try to play
                    CONFIG.elements.remoteVideo.play()
                        .then(() => {
                            console.log(`▶️ Remote ${event.track.kind} playing`);
                            DebugConsole?.success('WebRTC', `Remote ${event.track.kind} playing`);
                            
                            // Check audio state
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
        
        // ICE candidate handling - MODIFIED to log relay candidates
        CONFIG.peerConnection.onicecandidate = (event) => {
            if (event.candidate && CONFIG.targetSocketId) {
                // Log candidate type for debugging
                const candidateStr = event.candidate.candidate;
                const isRelay = candidateStr.includes('relay');
                const isSrflx = candidateStr.includes('srflx');
                const isHost = candidateStr.includes('host');
                
                if (isRelay) {
                    console.log('🔄 RELAY candidate generated (TURN server working)');
                    DebugConsole?.success('WebRTC', 'Relay candidate available');
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
        
        // ===== FIXED: Connection state monitoring with disconnect handling =====
        CONFIG.peerConnection.onconnectionstatechange = () => {
            console.log('🔗 Connection state:', CONFIG.peerConnection.connectionState);
            DebugConsole?.info('WebRTC', `Connection state: ${CONFIG.peerConnection.connectionState}`);
            
            switch (CONFIG.peerConnection.connectionState) {
                case 'connected':
                    console.log('✅ PEER CONNECTION CONNECTED!');
                    DebugConsole?.success('WebRTC', 'Peer connection connected');
                    
                    // Check which type of connection was established
                    CONFIG.peerConnection.getStats().then(stats => {
                        stats.forEach(report => {
                            if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                                if (report.localCandidateType === 'relay' || report.remoteCandidateType === 'relay') {
                                    console.log('🔄 Connected via TURN relay (good for VPN)');
                                    DebugConsole?.success('WebRTC', 'Using TURN relay');
                                } else if (report.localCandidateType === 'srflx' || report.remoteCandidateType === 'srflx') {
                                    console.log('🌐 Connected via STUN (direct connection)');
                                }
                            }
                        });
                    }).catch(err => console.log('Could not get stats:', err));
                    
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
                    
                    // Don't clean up immediately - give it a chance to recover
                    setTimeout(() => {
                        if (CONFIG.peerConnection && 
                            (CONFIG.peerConnection.connectionState === 'disconnected' || 
                             CONFIG.peerConnection.connectionState === 'failed')) {
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
                    }, 3000); // Wait 3 seconds for possible recovery
                    break;
                    
                case 'closed':
                    console.log('❌ Peer connection closed');
                    DebugConsole?.info('WebRTC', 'Peer connection closed');
                    CallManager.cleanupCall();
                    break;
            }
        };
        
        // ===== ADDED: ICE connection state monitoring =====
        CONFIG.peerConnection.oniceconnectionstatechange = () => {
            console.log('🧊 ICE connection state:', CONFIG.peerConnection.iceConnectionState);
            DebugConsole?.network('WebRTC', `ICE connection state: ${CONFIG.peerConnection.iceConnectionState}`);
            
            if (CONFIG.peerConnection.iceConnectionState === 'connected') {
                console.log('✅ ICE connected - network path established');
            }
            
            if (CONFIG.peerConnection.iceConnectionState === 'disconnected') {
                console.log('⚠️ ICE disconnected, waiting for recovery...');
            }
            
            if (CONFIG.peerConnection.iceConnectionState === 'failed') {
                console.log('❌ ICE failed - connection dead');
                DebugConsole?.error('WebRTC', 'ICE connection failed');
                
                // Force cleanup after ICE failure
                setTimeout(() => {
                    if (CONFIG.peerConnection && 
                        CONFIG.peerConnection.iceConnectionState === 'failed') {
                        CallManager.cleanupCall();
                        UIManager.showStatus('Call disconnected (network error)');
                    }
                }, 1000);
            }
        };
        
        console.log('✅ Peer connection created');
        DebugConsole?.success('WebRTC', 'Peer connection created successfully');
    },
    
    // ... rest of your code continues exactly as is ...
    // (all your existing methods: createAndSendOffer, handleOffer, handleAnswer, 
    // handleIceCandidate, processIceCandidateQueue, initCameras, etc.)
    
    // ===== ADDED: Test method to verify TURN servers =====
    testTurnServers() {
        console.log('🔍 Testing TURN server connectivity...');
        
        const iceServers = CONFIG.peerConfig?.iceServers || [];
        const turnServers = iceServers.filter(s => 
            s.urls && (s.urls.includes('turn:') || s.urls.includes('turns:'))
        );
        
        if (turnServers.length === 0) {
            console.log('⚠️ No TURN servers configured');
            return;
        }
        
        console.log(`Testing ${turnServers.length} TURN servers...`);
        
        turnServers.forEach((server, index) => {
            const testPC = new RTCPeerConnection({ iceServers: [server] });
            testPC.createDataChannel('test');
            
            let relayFound = false;
            let testTimeout = setTimeout(() => {
                if (!relayFound) {
                    console.log(`❌ TURN server ${index + 1} timeout: ${server.urls}`);
                }
                testPC.close();
            }, 3000);
            
            testPC.onicecandidate = (e) => {
                if (e.candidate && e.candidate.candidate.includes('relay')) {
                    relayFound = true;
                    console.log(`✅ TURN server ${index + 1} working: ${server.urls}`);
                    clearTimeout(testTimeout);
                    testPC.close();
                }
            };
            
            testPC.createOffer().then(offer => testPC.setLocalDescription(offer));
        });
    }
};

window.WebRTCManager = WebRTCManager;
