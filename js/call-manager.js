// js/call-manager.js - MINIMAL FIX VERSION
const CallManager = {
    // Add audio element for notification sound
    notificationAudio: null,
    notificationInterval: null,
    
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
        
        // === ADDED: Show connecting status for ALL calls (User AND Admin) ===
        console.log('=== Showing Connecting status for call ===');
        if (window.showConnectionStatus) {
            window.showConnectionStatus('Connecting...', 'connecting');
        }
        if (window.monitorCallConnection) {
            window.monitorCallConnection();
        }
        
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
            targetSocketId: socketToCall,
            callerId: CONFIG.myId,
            callerName: CONFIG.myUsername
        });
        
        console.log('Waiting for user to accept call...');
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
        
        // Format the display name
        let displayName = data.callerName;
        
        // Special case for admin (access code "1")
        if (displayName === '1') {
            displayName = 'Administrator';
        }
        // For other numeric codes, check if we know the display name
        else if (/^\d+$/.test(displayName) && CONFIG.myId && CONFIG.myUsername) {
            // If the caller is the admin and we know the admin socket ID
            if (CONFIG.adminSocketId && data.callerSocketId === CONFIG.adminSocketId) {
                displayName = 'Administrator';
            }
            // Otherwise use a generic format
            else {
                displayName = `User ${displayName}`;
            }
        }
        
        // Fallback to checking for callerDisplayName if server provides it
        if (data.callerDisplayName) {
            displayName = data.callerDisplayName;
        }
        
        this.showIncomingCallNotification(displayName);
        UIManager.updateCallButtons();
    },
    
    showIncomingCallNotification(callerDisplayName) {
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
            <p style="margin: 0 0 15px 0;">From: <strong>${callerDisplayName}</strong></p>
            <div style="display: flex; gap: 10px;">
                <button id="accept-btn" style="flex: 1; background: #4CAF50; color: white; padding: 10px; border: none; border-radius: 5px; cursor: pointer;">Accept</button>
                <button id="reject-btn" style="flex: 1; background: #f44336; color: white; padding: 10px; border: none; border-radius: 5px; cursor: pointer;">Reject</button>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // === ADDED: Start playing notification sound ===
        this.startNotificationSound();
        
        // Add handlers
        document.getElementById('accept-btn').onclick = () => {
            this.stopNotificationSound();
            notification.remove();
            this.answerCall();
        };
        
        document.getElementById('reject-btn').onclick = () => {
            this.stopNotificationSound();
            notification.remove();
            this.rejectCall();
        };
        
        // Auto-remove after 30 seconds
        setTimeout(() => {
            if (document.body.contains(notification)) {
                this.stopNotificationSound();
                notification.remove();
                this.rejectCall();
            }
        }, 30000);
    },
    
    // === NEW: Start notification sound ===
    startNotificationSound() {
        // Create audio element if it doesn't exist
        if (!this.notificationAudio) {
            this.notificationAudio = new Audio();
            
            // Create a subtle bell tone using Web Audio API for better compatibility
            try {
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();
                
                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);
                
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(800, audioContext.currentTime); // A5 note
                oscillator.frequency.setValueAtTime(1000, audioContext.currentTime + 0.1); // B5 note
                
                gainNode.gain.setValueAtTime(0.1, audioContext.currentTime); // Low volume
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
                
                oscillator.start();
                oscillator.stop(audioContext.currentTime + 0.5);
                
                // Create a MediaStream from the oscillator
                const destination = audioContext.createMediaStreamDestination();
                oscillator.connect(destination);
                
                // Convert to blob and URL for the Audio element
                const mediaRecorder = new MediaRecorder(destination.stream);
                const chunks = [];
                
                mediaRecorder.ondataavailable = e => chunks.push(e.data);
                mediaRecorder.onstop = () => {
                    const blob = new Blob(chunks, { type: 'audio/ogg; codecs=opus' });
                    const url = URL.createObjectURL(blob);
                    this.notificationAudio.src = url;
                };
                
                mediaRecorder.start();
                setTimeout(() => mediaRecorder.stop(), 500);
                
            } catch (error) {
                console.log('Web Audio API not available, using fallback sound:', error);
                
                // Fallback: Base64 encoded simple bell sound
                const bellSound = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZ3620YQQAAAAAAA==";
                this.notificationAudio.src = bellSound;
            }
            
            this.notificationAudio.loop = true;
            this.notificationAudio.volume = 0.3; // 30% volume for subtlety
        }
        
        // Play the sound
        this.notificationAudio.play().catch(e => {
            console.log('Notification sound play failed, using beep fallback:', e);
            this.startBeepFallback();
        });
        
        // Set interval to repeat sound every 2 seconds
        this.notificationInterval = setInterval(() => {
            if (this.notificationAudio) {
                this.notificationAudio.currentTime = 0;
                this.notificationAudio.play().catch(e => console.log('Notification sound replay failed:', e));
            }
        }, 2000);
    },
    
    // === NEW: Simple beep fallback using Web Audio ===
    startBeepFallback() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Create a beep sound
            const playBeep = () => {
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();
                
                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);
                
                oscillator.type = 'sine';
                oscillator.frequency.value = 800;
                
                gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
                
                oscillator.start();
                oscillator.stop(audioContext.currentTime + 0.5);
            };
            
            // Play beep immediately and then every 2 seconds
            playBeep();
            this.notificationInterval = setInterval(playBeep, 2000);
            
        } catch (error) {
            console.log('Beep fallback also failed:', error);
        }
    },
    
    // === NEW: Stop notification sound ===
    stopNotificationSound() {
        if (this.notificationAudio) {
            this.notificationAudio.pause();
            this.notificationAudio.currentTime = 0;
        }
        
        if (this.notificationInterval) {
            clearInterval(this.notificationInterval);
            this.notificationInterval = null;
        }
    },
    
    async answerCall() {
        if (CONFIG.isProcessingAnswer || !CONFIG.incomingCallFrom) {
            return;
        }
        
        CONFIG.isProcessingAnswer = true;
        console.log('Answering call from:', CONFIG.incomingCallFrom);
        UIManager.showStatus('Answering call...');
        UIManager.updateCallButtons();
        
        // === ADDED: Show connecting status when answering ===
        console.log('=== Showing Connecting status for answer ===');
        if (window.showConnectionStatus) {
            window.showConnectionStatus('Connecting...', 'connecting');
        }
        if (window.monitorCallConnection) {
            window.monitorCallConnection();
        }
        
        // Ensure permissions
        const hasPerms = await AuthManager.ensureMediaPermissions();
        if (!hasPerms) {
            UIManager.showError('Need camera/mic permissions to answer');
            CONFIG.isProcessingAnswer = false;
            UIManager.updateCallButtons();
            return;
        }
        
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
    
    rejectCall() {
        console.log('=== CallManager.rejectCall() - stopping monitoring ===');
        
        // Clean up status monitoring
        if (typeof stopMonitoring !== 'undefined') {
            stopMonitoring();
        }
        if (typeof hideConnectionStatus !== 'undefined') {
            hideConnectionStatus();
        }
        
        // Stop notification sound
        this.stopNotificationSound();
        
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
        
        // FIX: Set isInCall to true when call is accepted
        CONFIG.isInCall = true;
        UIManager.updateCallButtons();
        
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
        console.log('=== CallManager.handleCallRejected() - stopping monitoring ===');
        
        // Clean up status monitoring
        if (typeof stopMonitoring !== 'undefined') {
            stopMonitoring();
        }
        if (typeof hideConnectionStatus !== 'undefined') {
            hideConnectionStatus();
        }
        
        console.log('Call rejected by:', data.rejecterName);
        this.cleanupCall();
        UIManager.showStatus('Call rejected by ' + (data.rejecterName || 'user'));
    },
    
	handleCallEnded(data) {
    console.log('=== CallManager.handleCallEnded() - stopping monitoring ===');
    
    // Clean up status monitoring
    if (typeof stopMonitoring !== 'undefined') {
        stopMonitoring();
    }
    if (typeof hideConnectionStatus !== 'undefined') {
        hideConnectionStatus();
    }
    
    console.log('Call ended by remote:', data.endedByName || 'remote user');
    
    // ===== FORCE ADMIN UI UPDATE =====
    CONFIG.isInCall = false;
    
    if (CONFIG.isAdmin) {
        const adminHangupBtn = document.getElementById('adminHangupBtn');
        if (adminHangupBtn) {
            adminHangupBtn.disabled = true;
            adminHangupBtn.className = 'btn-hangup';
            console.log('Admin hangup button disabled');
        }
        
        const adminCallBtn = document.getElementById('adminCallBtn');
        if (adminCallBtn) {
            adminCallBtn.disabled = false;
            adminCallBtn.className = 'btn-call active';
        }
    } else {
        const userHangupBtn = document.querySelector('.btn-hangup');
        if (userHangupBtn) {
            userHangupBtn.disabled = true;
            userHangupBtn.className = 'btn-hangup';
        }
        
        const userCallBtn = document.querySelector('.btn-call');
        if (userCallBtn) {
            userCallBtn.disabled = false;
            userCallBtn.className = 'btn-call active';
        }
    }
    
    this.cleanupCall();
    UIManager.showStatus('Call ended by ' + (data.endedByName || 'remote user'));
}
	
    hangup() {
        console.log('=== CallManager.hangup() - stopping monitoring ===');
        
        // Clean up status monitoring
        if (typeof stopMonitoring !== 'undefined') {
            stopMonitoring();
        }
        if (typeof hideConnectionStatus !== 'undefined') {
            hideConnectionStatus();
        }
        
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
    
    // Stop any notification sound
    this.stopNotificationSound();
    
    CONFIG.isProcessingAnswer = false;
    CONFIG.isInCall = false;  // ← This is critical
    
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
    CONFIG.isInitiator = false;
    CONFIG.incomingCallFrom = null;
    CONFIG.iceCandidatesQueue = [];
    
    // Remove notification if exists
    const notification = document.getElementById('incoming-call-notification');
    if (notification) notification.remove();
    
    // ===== FORCE UI UPDATE FOR ADMIN HANGUP BUTTON =====
    if (CONFIG.isAdmin) {
        const adminHangupBtn = document.getElementById('adminHangupBtn');
        if (adminHangupBtn) {
            adminHangupBtn.disabled = true;
            adminHangupBtn.className = 'btn-hangup';
            console.log('Admin hangup button disabled');
        }
        
        const adminCallBtn = document.getElementById('adminCallBtn');
        if (adminCallBtn) {
            adminCallBtn.disabled = false;
            adminCallBtn.className = 'btn-call active';
        }
    } else {
        const userHangupBtn = document.querySelector('.btn-hangup');
        if (userHangupBtn) {
            userHangupBtn.disabled = true;
            userHangupBtn.className = 'btn-hangup';
        }
        
        const userCallBtn = document.querySelector('.btn-call');
        if (userCallBtn) {
            userCallBtn.disabled = false;
            userCallBtn.className = 'btn-call active';
        }
    }
    
    UIManager.showStatus('Ready');
    // UIManager.updateCallButtons(); // This may be redundant now
}

};

window.CallManager = CallManager;
