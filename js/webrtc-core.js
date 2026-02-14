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
