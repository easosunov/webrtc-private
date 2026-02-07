// js/call-manager.js - FIXED VERSION
const CallManager = {
    lastCallTime: 0,
    CALL_COOLDOWN: 3000,
    
    async callUser(userToCall, socketToCall) {
        // Prevent duplicate calls
        const now = Date.now();
        if (now - this.lastCallTime < this.CALL_COOLDOWN) {
            console.log('Call cooldown, please wait');
            return;
        }
        this.lastCallTime = now;
        
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
        
        // Create peer connection
        WebRTCManager.createPeerConnection();
        
        // Send call initiation
        WebSocketClient.sendToServer({
            type: 'call-initiate',
            to: userToCall,  // Dynamic, not hardcoded 'admin'
            from: CONFIG.myId
        });
        
        console.log('Waiting for user to accept call...');
    },
    
    handleCallInitiated(data) {
        console.log(`📞 Incoming call from ${data.from}`);
        
        if (CONFIG.isInCall || CONFIG.isProcessingAnswer) {
            console.log('Already in call, ignoring');
            return;
        }
        
        // Fix: Use data.from (not data.callerName)
        CONFIG.targetSocketId = data.from;
        CONFIG.targetUsername = data.from;
        CONFIG.incomingCallFrom = data.from;
        CONFIG.isInitiator = false;
        
        this.showIncomingCallNotification(data.from);
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
        
        // Ensure permissions
        const hasPerms = await AuthManager.ensureMediaPermissions();
        if (!hasPerms) {
            UIManager.showError('Need camera/mic permissions to answer');
            CONFIG.isProcessingAnswer = false;
            UIManager.updateCallButtons();
            return;
        }
        
        // Send acceptance - FIXED: Use to/from fields
        WebSocketClient.sendToServer({
            type: 'call-accept',
            to: CONFIG.targetSocketId,
            from: CONFIG.myId
        });
        
        // Create peer connection
        WebRTCManager.createPeerConnection();
        
        UIManager.showStatus('Connecting...');
    },
    
    rejectCall() {
        console.log('Rejecting call');
        
        if (CONFIG.targetSocketId) {
            // FIXED: Use to/from fields
            WebSocketClient.sendToServer({
                type: 'call-reject',
                to: CONFIG.targetSocketId,
                from: CONFIG.myId
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
        console.log('✅ Call accepted by:', data.from);
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
        console.log('Call rejected by:', data.from);
        this.cleanupCall();
        UIManager.showStatus('Call rejected by ' + (data.from || 'user'));
    },
    
    handleCallEnded(data) {
        console.log('Call ended by remote:', data.from || 'remote user');
        this.cleanupCall();
        UIManager.showStatus('Call ended by ' + (data.from || 'remote user'));
    },
    
    hangup() {
        console.log('Ending call');
        UIManager.showStatus('Ending call...');
        
        if (CONFIG.targetSocketId) {
            // FIXED: Use to/from fields
            WebSocketClient.sendToServer({
                type: 'call-end',
                to: CONFIG.targetSocketId,
                from: CONFIG.myId
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
        
        // Reset cooldown
        this.lastCallTime = 0;
    }
};

window.CallManager = CallManager;
