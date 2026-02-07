// js/call-manager.js - COMPLETE VERSION with ensureLocalStream
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
        
        // Ensure permissions
        const hasPerms = await AuthManager.ensureMediaPermissions();
        if (!hasPerms) {
            UIManager.showError('Need camera/mic permissions to call');
            return;
        }
        
        // NEW: Ensure we have a local stream
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
    },
    
    // NEW: Helper method to ensure we have a local stream
    async ensureLocalStream() {
        if (!CONFIG.localStream) {
            console.log('Getting initial media stream...');
            
            // Get constraints based on current resolution
            const constraints = {
                audio: true,
                video: CONFIG.videoEnabled ? (CONFIG.videoConstraints || true) : false
            };
            
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            CONFIG.localStream = stream;
            
            // Update local video display
            if (CONFIG.elements.localVideo) {
                CONFIG.elements.localVideo.srcObject = stream;
                CONFIG.elements.localVideo.muted = true;
            }
            
            console.log('✅ Local stream obtained');
        }
        return true;
    },
    
    // ... REST OF YOUR EXISTING CODE ...
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
        // ... your existing code ...
    },
    
    async answerCall() {
        if (CONFIG.isProcessingAnswer || !CONFIG.incomingCallFrom) {
            return;
        }
        
        CONFIG.isProcessingAnswer = true;
        console.log('Answering call from:', CONFIG.incomingCallFrom);
        UIManager.showStatus('Answering call...');
        UIManager.updateCallButtons();
        
        // Ensure permissions
        const hasPerms = await AuthManager.ensureMediaPermissions();
        if (!hasPerms) {
            UIManager.showError('Need camera/mic permissions to answer');
            CONFIG.isProcessingAnswer = false;
            UIManager.updateCallButtons();
            return;
        }
        
        // NEW: Ensure we have a local stream
        await this.ensureLocalStream();
        
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
    },
    
    // ... REST OF YOUR EXISTING METHODS ...
    rejectCall() { /* ... */ },
    handleCallAccepted(data) { /* ... */ },
    handleCallRejected(data) { /* ... */ },
    handleCallEnded(data) { /* ... */ },
    hangup() { /* ... */ },
    cleanupCall() { /* ... */ }
};

window.CallManager = CallManager;
