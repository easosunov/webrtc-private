// In ui-manager.js, REPLACE the changeVideoResolution function with this:

// NEW: Change video resolution
async changeVideoResolution() {
    if (!CONFIG.elements.resolutionSelect) return;
    
    const resolution = CONFIG.elements.resolutionSelect.value;
    console.log(`Changing resolution to: ${resolution}`);
    
    // Define constraints based on selection
    let newConstraints = {};
    let videoEnabled = true;
    
    switch (resolution) {
        case 'audio-only':
            videoEnabled = false;
            newConstraints = { 
                audio: true,
                video: false 
            };
            break;
            
        case 'low':
            videoEnabled = true;
            newConstraints = { 
                audio: true,
                video: { 
                    width: { ideal: 320, max: 320 },
                    height: { ideal: 240, max: 240 },
                    frameRate: { ideal: 15, max: 20 },
                    facingMode: 'user'
                }
            };
            break;
            
        case 'medium':
            videoEnabled = true;
            newConstraints = { 
                audio: true,
                video: { 
                    width: { ideal: 640, max: 640 },
                    height: { ideal: 480, max: 480 },
                    frameRate: { ideal: 30, max: 30 },
                    facingMode: 'user'
                }
            };
            break;
            
        case 'high':
            videoEnabled = true;
            newConstraints = { 
                audio: true,
                video: { 
                    width: { ideal: 1280, max: 1280 },
                    height: { ideal: 720, max: 720 },
                    frameRate: { ideal: 30, max: 30 },
                    facingMode: 'user'
                }
            };
            break;
            
        case 'full-hd':
            videoEnabled = true;
            newConstraints = { 
                audio: true,
                video: { 
                    width: { ideal: 1920, max: 1920 },
                    height: { ideal: 1080, max: 1080 },
                    frameRate: { ideal: 30, max: 30 },
                    facingMode: 'user'
                }
            };
            break;
    }
    
    // Store the constraints
    CONFIG.videoEnabled = videoEnabled;
    CONFIG.videoConstraints = newConstraints.video || false;
    
    try {
        // If in a call, we need to renegotiate
        if (CONFIG.inCall && CONFIG.peerConnection) {
            console.log('Active call detected, renegotiating media...');
            
            // Get new media stream
            const newStream = await navigator.mediaDevices.getUserMedia(newConstraints);
            console.log('New stream obtained:', newStream.getTracks().map(t => `${t.kind}:${t.enabled}`));
            
            // Stop old tracks
            if (CONFIG.localStream) {
                CONFIG.localStream.getTracks().forEach(track => {
                    track.stop();
                    console.log(`Stopped old ${track.kind} track`);
                });
            }
            
            // Replace local stream
            CONFIG.localStream = newStream;
            
            // Update local video element
            if (CONFIG.elements.localVideo) {
                CONFIG.elements.localVideo.srcObject = newStream;
                CONFIG.elements.localVideo.style.display = videoEnabled ? 'block' : 'none';
            }
            
            // Replace tracks in peer connection
            const senders = CONFIG.peerConnection.getSenders();
            console.log('Current senders:', senders.map(s => s.track?.kind));
            
            // For each track in new stream
            newStream.getTracks().forEach(track => {
                const sender = senders.find(s => s.track && s.track.kind === track.kind);
                if (sender) {
                    console.log(`Replacing ${track.kind} track`);
                    sender.replaceTrack(track);
                } else {
                    // Add new track if not present
                    console.log(`Adding new ${track.kind} track`);
                    CONFIG.peerConnection.addTrack(track, newStream);
                }
            });
            
            // If switching to audio-only, remove video sender if it exists
            if (!videoEnabled) {
                const videoSender = senders.find(s => s.track && s.track.kind === 'video');
                if (videoSender) {
                    console.log('Removing video sender for audio-only mode');
                    videoSender.replaceTrack(null);
                }
            }
            
            console.log(`✅ Resolution changed to: ${resolution} during active call`);
            this.showStatus(`Quality changed to: ${this.getResolutionName(resolution)}`);
            
        } else {
            // Not in a call, update local preview
            if (CONFIG.localStream) {
                // Stop old tracks
                CONFIG.localStream.getTracks().forEach(track => track.stop());
                
                // Get new stream
                const newStream = await navigator.mediaDevices.getUserMedia(newConstraints);
                CONFIG.localStream = newStream;
                
                // Update local video element
                if (CONFIG.elements.localVideo) {
                    CONFIG.elements.localVideo.srcObject = newStream;
                    CONFIG.elements.localVideo.style.display = videoEnabled ? 'block' : 'none';
                }
            }
            
            console.log(`✅ Resolution settings updated to: ${resolution}`);
            this.showStatus(`Quality set to: ${this.getResolutionName(resolution)}`);
        }
    } catch (error) {
        console.error('Error changing resolution:', error);
        this.showError(`Failed to change resolution: ${error.message}`);
        
        // Revert selection on error
        if (CONFIG.elements.resolutionSelect) {
            const currentResolution = CONFIG.videoEnabled ? 
                (CONFIG.videoConstraints?.width?.ideal === 320 ? 'low' : 
                 CONFIG.videoConstraints?.width?.ideal === 640 ? 'medium' :
                 CONFIG.videoConstraints?.width?.ideal === 1280 ? 'high' :
                 CONFIG.videoConstraints?.width?.ideal === 1920 ? 'full-hd' : 'medium') : 'audio-only';
            CONFIG.elements.resolutionSelect.value = currentResolution;
        }
    }
},
