// js/call-manager.js - FIXED VERSION
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
        
        // Ensure we have media permissions and correct stream
        try {
            const hasPerms = await AuthManager.ensureMediaPermissions();
            if (!hasPerms) {
                UIManager.showError('Need camera/mic permissions to call');
                UIManager.updateCallButtons();
                return;
            }
            
            // Make sure we have a local stream with current resolution settings
            await this.ensureLocalStream();
            
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
            
        } catch (error) {
            console.error('Failed to start call:', error);
            UIManager.showError('Failed to start call: ' + error.message);
            this.cleanupCall();
        }
    },
    
    // Helper to ensure we have a local stream
    async ensureLocalStream() {
        if (!CONFIG.localStream) {
            console.log('Getting initial media stream...');
            const constraints = UIManager.getCurrentResolutionConstraints();
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            CONFIG.localStream = stream;
            
            // Update local video display
            if (CONFIG.elements.localVideo) {
                CONFIG.elements.localVideo.srcObject = stream;
                CONFIG.elements.localVideo.muted = true;
                CONFIG.elements.localVideo.style.display = constraints.video ? 'block' : 'none';
            }
        }
        return true;
    },
    
    // ... REST OF THE ORIGINAL call-manager.js CODE REMAINS THE SAME ...
    // (Keep all your existing handleCallInitiated, answerCall, etc. methods)
    
    handleCallAccepted(data) {
        console.log('✅ Call accepted by:', data.calleeName);
        UIManager.showStatus('Call accepted - connecting...');
        
        if (CONFIG.isInitiator) {
            // We are the caller, now we can send the offer
            console.log('We are the caller, sending offer now...');
            setTimeout(() => {
                if (CONFIG.peerConnection && CONFIG.targetSocketId) {
                    WebRTCManager.createAndSendOffer();
                } else {
                    console.error('Cannot send offer: missing peer connection or target');
                }
            }, 500);
        } else {
            // We are the callee, we'll handle the offer when it arrives
            console.log('We are the callee, waiting for offer...');
        }
    },
    
    // ... REST OF THE FILE ...
};

window.CallManager = CallManager;
