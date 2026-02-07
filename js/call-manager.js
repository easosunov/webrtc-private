// js/call-manager.js - COMPLETE VERSION
const CallManager = {
    async callUser(userToCall, socketToCall) {
        if (CONFIG.isInCall || CONFIG.isProcessingAnswer) {
            UIManager.showError('Already in a call');
            return;
        }
        
        if (!socketToCall) {
            UIManager.showError('User not available');
            return;
        }
        
        console.log(`Calling ${userToCall} (${socketToCall})...`);
        UIManager.showStatus(`Calling ${userToCall}...`);
        
        // Set call parameters
        CONFIG.targetUsername = userToCall;
        CONFIG.targetSocketId = socketToCall;
        CONFIG.isInitiator = true;
        
        // Update UI buttons
        UIManager.updateCallButtons();
        
        // FIX: Ensure we have the correct media stream based on current resolution
        await this.ensureCorrectMediaStream();
        
        // Create peer connection
        WebRTCManager.createPeerConnection();
        
        // Send call initiation
        WebSocketClient.sendToServer({
            type: 'call-initiate',
            targetSocketId: socketToCall,
            callerId: CONFIG.myId,
            callerName: CONFIG.myUsername
        });
        
        console.log('Waiting for user to accept call...');
    },
    
    // FIX: New method to ensure correct media stream
    async ensureCorrectMediaStream() {
        try {
            const hasPerms = await AuthManager.ensureMediaPermissions();
            if (!hasPerms) {
                throw new Error('Need camera/mic permissions to call');
            }
            
            // Get current resolution constraints
            const constraints = UIManager.getCurrentResolutionConstraints();
            
            // Check if current stream matches requirements
            const needsNewStream = !CONFIG.localStream || 
                                  this.streamNeedsUpdate(CONFIG.localStream, constraints);
            
            if (needsNewStream) {
                console.log('Getting new media stream with current resolution settings...');
                
                // Stop old tracks if they exist
                if (CONFIG.localStream) {
                    CONFIG.localStream.getTracks().forEach(track => track.stop());
                }
                
                // Get new stream
                const stream = await navigator.mediaDevices.getUserMedia(constraints);
                CONFIG.localStream = stream;
                
                // Update local video display
                if (CONFIG.elements.localVideo) {
                    CONFIG.elements.localVideo.srcObject = stream;
                    CONFIG.elements.localVideo.muted = true;
                    CONFIG.elements.localVideo.style.display = constraints.video ? 'block' : 'none';
                }
                
                console.log('✅ Media stream updated with current resolution');
            }
            
            return true;
            
        } catch (error) {
            console.error('Failed to ensure media stream:', error);
            throw error;
        }
    },
    
    // Helper to check if stream needs update
    streamNeedsUpdate(stream, constraints) {
        const hasAudio = stream.getAudioTracks().length > 0;
        const hasVideo = stream.getVideoTracks().length > 0;
        const needsVideo = constraints.video !== false;
        
        // Check if audio/video presence matches requirements
        if (!hasAudio || (needsVideo && !hasVideo) || (!needsVideo && hasVideo)) {
            return true;
        }
        
        // For video, check if resolution matches
        if (needsVideo && hasVideo) {
            const videoTrack = stream.getVideoTracks()[0];
            const settings = videoTrack.getSettings();
            const targetWidth = constraints.video.width?.ideal || constraints.video.width?.max;
            const targetHeight = constraints.video.height?.ideal || constraints.video.height?.max;
            
            if (targetWidth && targetHeight) {
                return settings.width !== targetWidth || settings.height !== targetHeight;
            }
        }
        
        return false;
    },
    
    handleCallInitiated(data) {
        console.log(`📞 Incoming call from ${data.callerName}`);
        
        if (CONFIG.isInCall || CONFIG.isProcessingAnswer) {
            console.log('Already in call, ignoring');
            return;
        }
        
        CONFIG.targetSocketId = data.callerSocketId;
        CONFIG.targetUsername = data.callerName;
        CONFIG.incomingCallFrom = data.callerName;
        CONFIG.isInitiator = false;
        
        this.showIncomingCallNotification(data.callerName);
        UIManager.updateCallButtons();
    },
    
    showIncomingCallNotification(callerName) {
        // Remove any existing notification
        const existing = document.getElementById('incoming-call-notification');
        if (existing) existing.remove();
        
        // Create notification
        const notification = document.createElement('div');
        notification.id = 'incoming-call-notification';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: white;
            border: 2px solid #4CAF50;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            z-index: 1000;
            min-width: 250px;
        `;
        
        notification.innerHTML = `
            <h3 style="margin: 0 0 10px 0; color: #333;">📞 Incoming Call</h3>
            <p style="margin: 0 0 15px 0;">From: <strong>${callerName}</strong></p>
            <div style="display: flex; gap: 10px;">
                <button id="accept-btn" style="flex: 1; background: #4CAF50; color: white; padding: 10px; border: none; border-radius: 5px; cursor: pointer;">Accept</button>
                <button id="reject-btn" style="flex: 1; background: #f44336; color: white; padding: 10px; border: none; border-radius: 5px; cursor: pointer;">Reject</button>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Add handlers
        document.getElementById('accept-btn').onclick = () => {
            notification.remove();
            this.answerCall();
        };
        
        document.getElementById('reject-btn').onclick = () => {
            notification.remove();
            this.rejectCall();
        };
        
        // Auto-remove after 30 seconds
        setTimeout(() => {
            if (document.body.contains(notification)) {
                notification.remove();
                this.rejectCall();
            }
        }, 30000);
    },
    
    async answerCall() {
        if (CONFIG.isProcessingAnswer || !CONFIG.incomingCallFrom) {
            return;
        }
        
        CONFIG.isProcessingAnswer = true;
        console.log('Answering call from:', CONFIG.incomingCallFrom);
        UIManager.showStatus('Answering call...');
        UIManager.updateCallButtons();
        
        try {
            // FIX: Ensure we have the correct media stream
            await this.ensureCorrectMediaStream();
            
            // Send acceptance
            WebSocketClient.sendToServer({
                type: 'call-accept',
                targetSocketId: CONFIG.targetSocketId,
                calleeId: CONFIG.myId,
                calleeName: CONFIG.myUsername
            });
            
            // Create peer connection
            WebRTCManager.createPeerConnection();
            
            UIManager.showStatus('Connecting...');
            
        } catch (error) {
            console.error('Failed to answer call:', error);
            UIManager.showError(error.message || 'Failed to answer call');
            CONFIG.isProcessingAnswer = false;
            UIManager.updateCallButtons();
        }
    },
    
    rejectCall() {
        console.log('Rejecting call');
        
        if (CONFIG.targetSocketId) {
            WebSocketClient.sendToServer({
                type: 'call-reject',
                targetSocketId: CONFIG.targetSocketId
            });
        }
        
        CONFIG.targetSocketId = null;
        CONFIG.targetUsername = null;
        CONFIG.incomingCallFrom = null;
        CONFIG.isProcessingAnswer = false;
        
        // Remove notification if exists
        const notification = document.getElementById('incoming-call-notification');
        if (notification) notification.remove();
        
        UIManager.showStatus('Call rejected');
        UIManager.updateCallButtons();
    },
    
    handleCallAccepted(data) {
        console.log('✅ Call accepted by:', data.calleeName);
        UIManager.showStatus('Call accepted - connecting...');
        
        if (CONFIG.isInitiator) {
            // We are the caller, now we can send the offer
            console.log('We are the caller, sending offer now...');
            setTimeout(() => {
                if (CONFIG.peerConnection && CONFIG.targetSocketId) {
                    WebRTCManager.createAndSendOffer();
                }
            }, 500);
        } else {
            // We are the callee, we'll handle the offer when it arrives
            console.log('We are the callee, waiting for offer...');
        }
    },
    
    handleCallRejected(data) {
        console.log('Call rejected by:', data.rejecterName);
        this.cleanupCall();
        UIManager.showStatus('Call rejected by ' + (data.rejecterName || 'user'));
    },
    
    handleCallEnded(data) {
        console.log('Call ended by remote:', data.endedByName || 'remote user');
        this.cleanupCall();
        UIManager.showStatus('Call ended by ' + (data.endedByName || 'remote user'));
    },
    
    hangup() {
        console.log('Ending call');
        UIManager.showStatus('Ending call...');
        
        if (CONFIG.targetSocketId) {
            WebSocketClient.sendToServer({
                type: 'call-end',
                targetSocketId: CONFIG.targetSocketId
            });
        }
        
        this.cleanupCall();
    },
    
    cleanupCall() {
        console.log('Cleaning up call...');
        
        CONFIG.isProcessingAnswer = false;
        
        if (CONFIG.peerConnection) {
            CONFIG.peerConnection.close();
            CONFIG.peerConnection = null;
        }
        
        if (CONFIG.elements.remoteVideo && CONFIG.elements.remoteVideo.srcObject) {
            CONFIG.elements.remoteVideo.srcObject.getTracks().forEach(track => track.stop());
            CONFIG.elements.remoteVideo.srcObject = null;
        }
        
        CONFIG.targetSocketId = null;
        CONFIG.targetUsername = null;
        CONFIG.isInCall = false;
        CONFIG.isInitiator = false;
        CONFIG.incomingCallFrom = null;
        CONFIG.iceCandidatesQueue = [];
        
        // Remove notification if exists
        const notification = document.getElementById('incoming-call-notification');
        if (notification) notification.remove();
        
        UIManager.showStatus('Ready');
        UIManager.updateCallButtons();
    }
};

window.CallManager = CallManager;
