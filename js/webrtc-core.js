// js/webrtc-core.js - COMPLETE WITH DISCONNECT HANDLING
const WebRTCManager = {
    createPeerConnection() {
        console.log('🔗 Creating peer connection...');
        DebugConsole?.info('WebRTC', 'Creating peer connection');
        
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
        
        // ICE candidate handling
        CONFIG.peerConnection.onicecandidate = (event) => {
            if (event.candidate && CONFIG.targetSocketId) {
                console.log('🧊 Sending ICE candidate');
                DebugConsole?.network('WebRTC', 'Generated ICE candidate');
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
            
            // Check SDP for audio
            if (offer.sdp) {
                const hasAudio = offer.sdp.includes('m=audio');
                console.log(`📄 SDP - Has audio: ${hasAudio ? '✅' : '❌'}`);
                DebugConsole?.info('WebRTC', `Offer SDP - Audio: ${hasAudio ? 'Yes' : 'No'}`);
                
                // Log audio codecs
                if (offer.sdp.includes('opus')) {
                    console.log('  Using Opus codec');
                    DebugConsole?.info('WebRTC', 'Using Opus audio codec');
                }
                if (offer.sdp.includes('ISAC')) {
                    console.log('  Using ISAC codec');
                    DebugConsole?.info('WebRTC', 'Using ISAC audio codec');
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
    
	// Add these methods to webrtc-core.js

// Check if device has multiple cameras
hasMultipleCameras: false,

// Current camera facing mode
currentFacingMode: 'user', // 'user' = front, 'environment' = rear

// Initialize camera detection
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


updateCameraButtonVisibility() {
    const switchBtn = document.getElementById('switchCameraBtn');
    if (switchBtn) {
        switchBtn.style.display = this.hasMultipleCameras ? 'inline-block' : 'none';
        console.log(`Camera button ${this.hasMultipleCameras ? 'shown' : 'hidden'}`);
    }
},


// Switch camera during active call - FIXED VERSION
updateCameraIndicator() {
    const indicator = document.getElementById('cameraIndicator');
    if (!indicator) {
        // Create indicator if it doesn't exist
        const newIndicator = document.createElement('div');
        newIndicator.id = 'cameraIndicator';
        newIndicator.style.cssText = `
            position: fixed;
            bottom: 10px;
            left: 10px;
            background: rgba(0,0,0,0.7);
            color: white;
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 16px;
            z-index: 10001;
            pointer-events: none;
            font-weight: bold;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        `;
        document.body.appendChild(newIndicator);
    }
    
    const camIndicator = document.getElementById('cameraIndicator');
    if (camIndicator) {
        if (CONFIG.localStream && CONFIG.localStream.getVideoTracks().length > 0) {
            camIndicator.style.display = 'block';
            camIndicator.innerHTML = this.currentFacingMode === 'user' ? '🤳 FRONT CAMERA' : '📷 REAR CAMERA';
            console.log('Camera indicator updated:', camIndicator.innerHTML);
        } else {
            camIndicator.style.display = 'none';
        }
    }
},


// Switch camera during active call - COMPLETELY REWRITTEN
async switchCamera() {
    if (!CONFIG.localStream) {
        console.warn('No local stream to switch camera');
        UIManager.showError('No camera active');
        return false;
    }
    
    console.log('🔄 Attempting to switch camera');
    DebugConsole?.info('Camera', 'Switching camera...');
    
    // Show feedback immediately
    UIManager.showStatus('Switching camera...');
    
    // Toggle facing mode
    const newFacingMode = this.currentFacingMode === 'user' ? 'environment' : 'user';
    
    try {
        // Get current video track settings
        const currentVideoTrack = CONFIG.localStream.getVideoTracks()[0];
        const currentSettings = currentVideoTrack?.getSettings() || {};
        
        // Get current audio tracks
        const audioTracks = CONFIG.localStream.getAudioTracks();
        
        // Create a temporary video element to show "switching" state
        if (CONFIG.elements.localVideo) {
            CONFIG.elements.localVideo.poster = ''; // Clear any poster
        }
        
        // Request new camera with proper constraints
        const constraints = {
            audio: false,
            video: {
                facingMode: newFacingMode,
                width: currentSettings.width || { ideal: 640 },
                height: currentSettings.height || { ideal: 480 }
            }
        };
        
        console.log('📷 Requesting camera:', constraints);
        
        // Get new video track
        const newStream = await navigator.mediaDevices.getUserMedia(constraints);
        const newVideoTrack = newStream.getVideoTracks()[0];
        
        // Create brand new stream
        const freshStream = new MediaStream();
        
        // Add existing audio tracks
        audioTracks.forEach(track => {
            // Clone audio tracks to avoid issues
            const audioTrack = track.clone();
            freshStream.addTrack(audioTrack);
        });
        
        // Add new video track
        freshStream.addTrack(newVideoTrack);
        
        // Get the old video track before stopping
        const oldVideoTrack = currentVideoTrack;
        
        // Update CONFIG.localStream to the new stream
        CONFIG.localStream = freshStream;
        
        // Update local video element
        if (CONFIG.elements.localVideo) {
            CONFIG.elements.localVideo.srcObject = CONFIG.localStream;
            // Force play with a small delay to allow camera to initialize
            setTimeout(() => {
                CONFIG.elements.localVideo.play()
                    .then(() => {
                        console.log('✅ Local video playing after switch');
                        
                        // Update indicator after successful play
                        this.currentFacingMode = newFacingMode;
                        this.updateCameraIndicator();
                        
                        const cameraIcon = newFacingMode === 'user' ? '🤳' : '📷';
                        UIManager.showStatus(`${cameraIcon} ${newFacingMode === 'user' ? 'Front' : 'Rear'} camera`);
                    })
                    .catch(e => console.log('Local video play after switch:', e));
            }, 300);
        }
        
        // If in a call, replace the track in peer connection
        if (CONFIG.peerConnection && CONFIG.isInCall) {
            const senders = CONFIG.peerConnection.getSenders();
            const videoSender = senders.find(sender => 
                sender.track && sender.track.kind === 'video'
            );
            
            if (videoSender) {
                await videoSender.replaceTrack(newVideoTrack);
                console.log('✅ Video track replaced in peer connection');
                DebugConsole?.success('Camera', 'Switched camera successfully');
            }
        }
        
        // Stop old video track after a delay to ensure smooth transition
        setTimeout(() => {
            if (oldVideoTrack && oldVideoTrack.readyState === 'live') {
                oldVideoTrack.stop();
                console.log('Stopped old video track');
            }
        }, 500);
        
        return true;
        
    } catch (error) {
        console.error('Failed to switch camera:', error);
        DebugConsole?.error('Camera', `Switch failed: ${error.message}`);
        UIManager.showError('Could not switch camera');
        
        // Revert to previous camera on error
        this.currentFacingMode = this.currentFacingMode;
        this.updateCameraIndicator();
        return false;
    }
},


// Call this during initialization - MODIFIED TO WAIT FOR STREAM
async initCameras() {
    console.log('Initializing camera detection...');
    
    // Wait for local stream to be available
    const waitForStream = () => {
        return new Promise((resolve) => {
            if (CONFIG.localStream && CONFIG.localStream.getVideoTracks().length > 0) {
                resolve();
            } else {
                // Check every 500ms for stream
                const interval = setInterval(() => {
                    if (CONFIG.localStream && CONFIG.localStream.getVideoTracks().length > 0) {
                        clearInterval(interval);
                        resolve();
                    }
                }, 500);
                // Timeout after 10 seconds
                setTimeout(() => {
                    clearInterval(interval);
                    resolve(); // Continue anyway
                }, 10000);
            }
        });
    };
    
    await waitForStream();
    
    // Now detect cameras
    await this.detectCameras();
    
    // Add click handler to local video for camera switching
    const localVideo = document.getElementById('localVideo');
    if (localVideo) {
        // Remove any existing listeners to avoid duplicates
        const newLocalVideo = localVideo.cloneNode(true);
        if (localVideo.parentNode) {
            localVideo.parentNode.replaceChild(newLocalVideo, localVideo);
        }
        
        newLocalVideo.addEventListener('click', async (e) => {
            // Prevent click during drag
            if (window.isDragging) return;
            
            if (this.hasMultipleCameras && CONFIG.localStream) {
                await this.switchCamera();
            } else if (!this.hasMultipleCameras) {
                DebugConsole?.info('Camera', 'No alternative camera available');
                UIManager.showStatus('Only one camera detected');
            }
        });
        
        // Visual indicator that video is clickable
        newLocalVideo.style.cursor = 'pointer';
        newLocalVideo.title = 'Click to switch camera';
        
        // Re-attach drag handlers
        if (typeof initDraggableVideo === 'function') {
            setTimeout(initDraggableVideo, 100);
        }
    }
    
    // Force button visibility check after a delay
    setTimeout(() => {
        this.updateCameraButtonVisibility();
    }, 2000);
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
