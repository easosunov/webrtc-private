// js/resolution-manager.js - Manages video resolution changes
const ResolutionManager = {
    // Initialize resolution manager
    async init() {
        console.log('Resolution Manager initializing...');
        
        // Set default resolution if not set
        if (!RESOLUTION_CONFIG.current) {
            RESOLUTION_CONFIG.current = RESOLUTION_CONFIG.default;
        }
        
        // Initialize CONFIG with resolution settings if they don't exist
        if (!CONFIG.mediaConstraints) {
            CONFIG.mediaConstraints = RESOLUTION_CONFIG.getCurrentConstraints();
        }
        
        if (!CONFIG.currentResolution) {
            CONFIG.currentResolution = RESOLUTION_CONFIG.current;
        }
        
        console.log(`Resolution initialized: ${RESOLUTION_CONFIG.current} (${RESOLUTION_CONFIG.options[RESOLUTION_CONFIG.current].label})`);
    },
    
    // Change to a new resolution
    async changeResolution(newResolutionKey) {
        console.log(`Requesting resolution change to: ${newResolutionKey}`);
        
        // Validate resolution exists
        if (!RESOLUTION_CONFIG.options[newResolutionKey]) {
            console.error(`Resolution ${newResolutionKey} not found`);
            return { success: false, error: `Resolution ${newResolutionKey} not available` };
        }
        
        // Don't do anything if it's the same resolution
        if (newResolutionKey === RESOLUTION_CONFIG.current) {
            console.log(`Already at ${newResolutionKey} resolution`);
            return { success: true, same: true };
        }
        
        const oldResolution = RESOLUTION_CONFIG.current;
        const newConstraints = RESOLUTION_CONFIG.options[newResolutionKey].constraints;
        
        try {
            // Update configuration
            RESOLUTION_CONFIG.setResolution(newResolutionKey);
            CONFIG.currentResolution = newResolutionKey;
            CONFIG.mediaConstraints = newConstraints;
            
            // If we have an active stream, we need to update it
            if (CONFIG.localStream && CONFIG.localStream.active) {
                return await this.updateActiveStream(newConstraints);
            } else {
                // Just update configuration for next stream
                console.log(`Resolution updated to ${newResolutionKey}. Will use for next call.`);
                return { 
                    success: true, 
                    message: `Resolution set to ${RESOLUTION_CONFIG.options[newResolutionKey].label}`
                };
            }
            
        } catch (error) {
            // Revert on error
            RESOLUTION_CONFIG.setResolution(oldResolution);
            CONFIG.currentResolution = oldResolution;
            CONFIG.mediaConstraints = RESOLUTION_CONFIG.options[oldResolution].constraints;
            
            console.error('Resolution change failed:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Update active stream with new constraints
    async updateActiveStream(newConstraints) {
        console.log('Updating active stream with new constraints');
        
        if (!CONFIG.localStream || !CONFIG.localStream.active) {
            throw new Error('No active local stream');
        }
        
        // Stop old tracks
        const oldTracks = CONFIG.localStream.getTracks();
        oldTracks.forEach(track => track.stop());
        
        try {
            // Get new stream with new constraints
            const newStream = await navigator.mediaDevices.getUserMedia(newConstraints);
            
            // Update CONFIG
            CONFIG.localStream = newStream;
            
            // Update video element
            if (CONFIG.elements.localVideo) {
                CONFIG.elements.localVideo.srcObject = newStream;
            }
            
            // If in a call, replace tracks in peer connection
            if (CONFIG.isInCall && CONFIG.peerConnection) {
                await this.replacePeerConnectionTracks(newStream);
            }
            
            console.log('Active stream updated successfully');
            return { 
                success: true, 
                message: `Resolution changed to ${RESOLUTION_CONFIG.options[RESOLUTION_CONFIG.current].label}`,
                updatedDuringCall: CONFIG.isInCall
            };
            
        } catch (error) {
            console.error('Failed to update active stream:', error);
            
            // Try to get back the old resolution
            try {
                const fallbackConstraints = RESOLUTION_CONFIG.options[RESOLUTION_CONFIG.default].constraints;
                const fallbackStream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
                CONFIG.localStream = fallbackStream;
                
                if (CONFIG.elements.localVideo) {
                    CONFIG.elements.localVideo.srcObject = fallbackStream;
                }
                
                // Update config to default
                RESOLUTION_CONFIG.current = RESOLUTION_CONFIG.default;
                CONFIG.currentResolution = RESOLUTION_CONFIG.default;
                CONFIG.mediaConstraints = fallbackConstraints;
                
            } catch (fallbackError) {
                console.error('Failed to restore fallback stream:', fallbackError);
                CONFIG.localStream = null;
                CONFIG.hasMediaPermissions = false;
            }
            
            throw error;
        }
    },
    
    // Replace tracks in active peer connection
    async replacePeerConnectionTracks(newStream) {
        if (!CONFIG.peerConnection || CONFIG.peerConnection.connectionState !== 'connected') {
            console.log('Not in active peer connection, skipping track replacement');
            return;
        }
        
        console.log('Replacing tracks in active peer connection');
        
        const newAudioTrack = newStream.getAudioTracks()[0];
        const newVideoTrack = newStream.getVideoTracks()[0];
        
        // Get current senders
        const senders = CONFIG.peerConnection.getSenders();
        
        for (const sender of senders) {
            if (sender.track) {
                if (sender.track.kind === 'audio' && newAudioTrack) {
                    await sender.replaceTrack(newAudioTrack);
                    console.log('Audio track replaced');
                } else if (sender.track.kind === 'video' && newVideoTrack) {
                    await sender.replaceTrack(newVideoTrack);
                    console.log('Video track replaced');
                }
            }
        }
        
        // Note: In WebRTC, track replacement doesn't require renegotiation
        // The new track will automatically be transmitted to the remote peer
    },
    
	
	// Helper to determine if new resolution is higher
isHigherResolution(newKey, oldKey) {
    const resolutionOrder = ['audio-only', 'low', 'medium', 'high', 'hd', 'full-hd'];
    const newIndex = resolutionOrder.indexOf(newKey);
    const oldIndex = resolutionOrder.indexOf(oldKey);
    
    if (newIndex === -1 || oldIndex === -1) {
        console.warn('Unknown resolution keys:', newKey, oldKey);
        return false;
    }
    return newIndex > oldIndex;
},

// Renegotiate for higher resolution
async renegotiateForHigherResolution(newStream, newResolutionKey) {
    console.log('Renegotiating for higher resolution');
    DebugConsole?.info('Resolution', 'Renegotiating for higher resolution');
    
    if (!CONFIG.peerConnection || !CONFIG.isInCall) {
        console.log('Not in call, skipping renegotiation');
        return;
    }
    
    try {
        // First replace the tracks
        await this.replacePeerConnectionTracks(newStream);
        
        // For higher resolutions, trigger renegotiation
        if (CONFIG.isInitiator) {
            console.log('Creating new offer for higher resolution');
            UIManager.showStatus('Adjusting video quality...');
            
            // Create and send new offer
            const offer = await CONFIG.peerConnection.createOffer();
            await CONFIG.peerConnection.setLocalDescription(offer);
            
            WebSocketClient.sendToServer({
                type: 'offer',
                targetSocketId: CONFIG.targetSocketId,
                offer: offer,
                sender: CONFIG.myUsername
            });
            
            console.log('✅ New offer sent for higher resolution');
            DebugConsole?.success('Resolution', 'Renegotiation offer sent');
            UIManager.showStatus(`Quality: ${RESOLUTION_CONFIG.options[newResolutionKey]?.label || newResolutionKey}`);
        } else {
            console.log('Waiting for initiator to renegotiate');
            UIManager.showStatus('Peer adjusting quality...');
        }
        
    } catch (error) {
        console.error('Renegotiation failed:', error);
        DebugConsole?.error('Resolution', `Renegotiation failed: ${error.message}`);
        UIManager.showError('Failed to increase resolution');
        throw error;
    }
},
	
	
    // Get current resolution info
    getCurrentResolutionInfo() {
        const current = RESOLUTION_CONFIG.current;
        const option = RESOLUTION_CONFIG.options[current];
        return {
            key: current,
            label: option.label,
            constraints: option.constraints,
            isAudioOnly: current === 'audio-only'
        };
    },
    
    // Get all available resolutions for UI
    getAvailableResolutions() {
        return RESOLUTION_CONFIG.getResolutionOptions();
    },
    
    // Check if device supports a specific resolution
    async checkResolutionSupport(resolutionKey) {
        if (!RESOLUTION_CONFIG.options[resolutionKey]) {
            return { supported: false, error: 'Resolution not defined' };
        }
        
        const constraints = RESOLUTION_CONFIG.options[resolutionKey].constraints;
        
        try {
            // Test if we can get this resolution
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            
            // Check if we got video (if requested)
            if (constraints.video && stream.getVideoTracks().length > 0) {
                const videoTrack = stream.getVideoTracks()[0];
                const settings = videoTrack.getSettings();
                
                // Stop the test stream
                stream.getTracks().forEach(track => track.stop());
                
                return {
                    supported: true,
                    actualWidth: settings.width,
                    actualHeight: settings.height,
                    actualFrameRate: settings.frameRate
                };
            } else if (!constraints.video && stream.getAudioTracks().length > 0) {
                // Audio only
                stream.getTracks().forEach(track => track.stop());
                return { supported: true, audioOnly: true };
            } else {
                stream.getTracks().forEach(track => track.stop());
                return { supported: false, error: 'No tracks obtained' };
            }
            
        } catch (error) {
            return { supported: false, error: error.message };
        }
    },
    
    // Apply current resolution to a new stream (for initial stream creation)
    async getStreamWithCurrentResolution() {
        try {
            const constraints = RESOLUTION_CONFIG.getCurrentConstraints();
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            
            // Store in CONFIG
            CONFIG.mediaConstraints = constraints;
            CONFIG.currentResolution = RESOLUTION_CONFIG.current;
            
            return stream;
        } catch (error) {
            console.error('Failed to get stream with current resolution:', error);
            
            // Fallback to default
            RESOLUTION_CONFIG.current = RESOLUTION_CONFIG.default;
            const fallbackConstraints = RESOLUTION_CONFIG.options[RESOLUTION_CONFIG.default].constraints;
            
            try {
                const fallbackStream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
                CONFIG.mediaConstraints = fallbackConstraints;
                CONFIG.currentResolution = RESOLUTION_CONFIG.default;
                return fallbackStream;
            } catch (fallbackError) {
                throw new Error(`Failed to get media stream: ${fallbackError.message}`);
            }
        }
    }
};

// Export for other modules
window.ResolutionManager = ResolutionManager;
