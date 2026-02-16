// js/call-manager.js - COMPLETE WITH FORCE CLEANUP
const CallManager = {
    // Audio element for notification sound
    notificationAudio: null,
    notificationInterval: null,
    
    // Call state properties
    manualHangupControl: false,
    
    // Cooldown properties
    callCooldown: false,
    callCooldownTimer: null,
    
    // ===== NEW: Force admin cleanup =====
    forceAdminCleanup() {
        console.log('🧹 Forcing admin cleanup after failed call');
        DebugConsole?.info('Call', 'Forcing admin cleanup');
        
        // Send force-cleanup message to server
        if (CONFIG.adminSocketId) {
            WebSocketClient.sendToServer({
                type: 'force-cleanup',
                targetSocketId: CONFIG.adminSocketId
            });
        }
        
        // Reset local admin state
        CONFIG.adminInCall = false;
        UIManager.updateCallButtons();
    },
    
    async callUser(userToCall, socketToCall) {
        if (CONFIG.isInCall || CONFIG.isProcessingAnswer) {
            UIManager.showError('Already in a call');
            DebugConsole?.warning('Call', 'Already in a call');
            return;
        }
        
        if (!socketToCall) {
            UIManager.showError('User not available');
            DebugConsole?.error('Call', 'User not available');
            return;
        }
        
        // Check if admin is in call
        if (CONFIG.adminInCall) {
            UIManager.showError('Admin is currently in a call');
            DebugConsole?.warning('Call', 'Admin is in a call');
            return;
        }
        
        console.log(`Calling ${userToCall} (${socketToCall})...`);
        DebugConsole?.call('Call', `Calling ${userToCall}`);
        UIManager.showStatus(`Calling ${userToCall}...`);
        
        if (window.showConnectionStatus) {
            window.showConnectionStatus('Connecting...', 'connecting');
        }
        if (window.monitorCallConnection) {
            window.monitorCallConnection();
        }
        
        CONFIG.targetUsername = userToCall;
        CONFIG.targetSocketId = socketToCall;
        CONFIG.isInitiator = true;
        CONFIG.isCallActive = true;
        
        this.enableHangupButton(true);
        
        const hasPerms = await AuthManager.ensureMediaPermissions();
        if (!hasPerms) {
            UIManager.showError('Need camera/mic permissions to call');
            DebugConsole?.error('Call', 'Camera/mic permissions denied');
            this.enableHangupButton(false);
            CONFIG.isCallActive = false;
            return;
        }
        
        WebRTCManager.createPeerConnection();
        
        WebSocketClient.sendToServer({
            type: 'call-initiate',
            targetSocketId: socketToCall,
            callerId: CONFIG.myId,
            callerName: CONFIG.myUsername
        });
        
        console.log('Waiting for user to accept call...');
        DebugConsole?.info('Call', 'Waiting for answer');
    },
    
    enableHangupButton(enable) {
        console.log(`Setting hangup button enabled: ${enable}`);
        DebugConsole?.info('Call', `Hangup button ${enable ? 'enabled' : 'disabled'}`);
        
        CONFIG.manualHangupControl = enable;
        
        if (CONFIG.isAdmin) {
            const adminHangupBtn = document.getElementById('adminHangupBtn');
            if (adminHangupBtn) {
                adminHangupBtn.disabled = !enable;
                adminHangupBtn.className = enable ? 'btn-hangup active' : 'btn-hangup';
            }
        } else {
            const userHangupBtn = document.querySelector('.btn-hangup');
            if (userHangupBtn) {
                userHangupBtn.disabled = !enable;
                userHangupBtn.className = enable ? 'btn-hangup active' : 'btn-hangup';
            }
        }
    },
    
    updateCallButtonState(enabled) {
        if (CONFIG.isAdmin) return;
        
        const callBtn = document.querySelector('.btn-call');
        if (callBtn) {
            callBtn.disabled = !enabled;
            callBtn.className = enabled ? 'btn-call active' : 'btn-call';
        }
    },
    
    startCallCooldown() {
        console.log('⏳ Starting call cooldown (2 seconds)');
        this.callCooldown = true;
        
        this.updateCallButtonState(false);
        UIManager.updateCallButtons();
        
        if (this.callCooldownTimer) {
            clearTimeout(this.callCooldownTimer);
        }
        
        this.callCooldownTimer = setTimeout(() => {
            this.callCooldown = false;
            console.log('⏳ Call cooldown ended');
            
            if (CONFIG.adminSocketId && !CONFIG.adminInCall && !CONFIG.isInCall) {
                this.updateCallButtonState(true);
                UIManager.showStatus('Ready to call');
            } else if (CONFIG.adminInCall) {
                UIManager.showStatus('Admin is in a call');
            } else {
                UIManager.showStatus('Admin not available');
            }
            UIManager.updateCallButtons();
        }, 2000);
    },
    
    callAdmin() {
        if (!CONFIG.adminSocketId) {
            UIManager.showError('Admin is not available');
            DebugConsole?.error('Call', 'Admin not available');
            return;
        }
        
        if (CONFIG.adminInCall) {
            UIManager.showError('Admin is currently in a call');
            DebugConsole?.warning('Call', 'Admin is in a call');
            return;
        }
        
        DebugConsole?.call('Call', 'Calling admin');
        
        this.enableHangupButton(true);
        this.callUser('Administrator', CONFIG.adminSocketId);
    },
    
    handleCallInitiated(data) {
        console.log(`📞 Incoming call from ${data.callerName}`);
        DebugConsole?.call('Call', `Incoming call from ${data.callerName}`);
        
        if (CONFIG.isInCall || CONFIG.isProcessingAnswer) {
            console.log('Already in call, ignoring');
            DebugConsole?.warning('Call', 'Already in call - ignoring incoming');
            return;
        }
        
        CONFIG.targetSocketId = data.callerSocketId;
        CONFIG.targetUsername = data.callerName;
        CONFIG.incomingCallFrom = data.callerName;
        CONFIG.isInitiator = false;
        
        let displayName = data.callerName;
        
        if (displayName === '1') {
            displayName = 'Administrator';
        } else if (/^\d+$/.test(displayName) && CONFIG.myId && CONFIG.myUsername) {
            if (CONFIG.adminSocketId && data.callerSocketId === CONFIG.adminSocketId) {
                displayName = 'Administrator';
            } else {
                displayName = `User ${displayName}`;
            }
        }
        
        if (data.callerDisplayName) {
            displayName = data.callerDisplayName;
        }
        
        this.showIncomingCallNotification(displayName);
        UIManager.updateCallButtons();
    },
    
    showIncomingCallNotification(callerDisplayName) {
        DebugConsole?.call('Call', `Showing incoming call notification from ${callerDisplayName}`);
        
        const existing = document.getElementById('incoming-call-notification');
        if (existing) existing.remove();
        
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
        
        this.startNotificationSound();
        
        document.getElementById('accept-btn').onclick = () => {
            DebugConsole?.call('Call', 'User accepted incoming call');
            this.stopNotificationSound();
            notification.remove();
            this.answerCall();
        };
        
        document.getElementById('reject-btn').onclick = () => {
            DebugConsole?.call('Call', 'User rejected incoming call');
            this.stopNotificationSound();
            notification.remove();
            this.rejectCall();
        };
        
        setTimeout(() => {
            if (document.body.contains(notification)) {
                DebugConsole?.warning('Call', 'Incoming call timed out');
                this.stopNotificationSound();
                notification.remove();
                this.rejectCall();
            }
        }, 30000);
    },
    
    startNotificationSound() {
        // Your existing notification sound code
    },
    
    stopNotificationSound() {
        // Your existing notification sound code
    },
    
    startBeepFallback() {
        // Your existing beep fallback code
    },
    
    async answerCall() {
        if (CONFIG.isProcessingAnswer || !CONFIG.incomingCallFrom) {
            return;
        }
        
        CONFIG.isProcessingAnswer = true;
        console.log('Answering call from:', CONFIG.incomingCallFrom);
        DebugConsole?.call('Call', `Answering call from ${CONFIG.incomingCallFrom}`);
        UIManager.showStatus('Answering call...');
        UIManager.updateCallButtons();
        
        if (window.showConnectionStatus) {
            window.showConnectionStatus('Connecting...', 'connecting');
        }
        if (window.monitorCallConnection) {
            window.monitorCallConnection();
        }
        
        const hasPerms = await AuthManager.ensureMediaPermissions();
        if (!hasPerms) {
            UIManager.showError('Need camera/mic permissions to answer');
            DebugConsole?.error('Call', 'Camera/mic permissions denied');
            CONFIG.isProcessingAnswer = false;
            UIManager.updateCallButtons();
            return;
        }
        
        WebSocketClient.sendToServer({
            type: 'call-accept',
            targetSocketId: CONFIG.targetSocketId,
            calleeId: CONFIG.myId,
            calleeName: CONFIG.myUsername
        });
        
        WebRTCManager.createPeerConnection();
        
        UIManager.showStatus('Connecting...');
    },
    
    rejectCall() {
        console.log('=== CallManager.rejectCall() - stopping monitoring ===');
        DebugConsole?.call('Call', 'Rejecting call');
        
        if (typeof stopMonitoring !== 'undefined') {
            stopMonitoring();
        }
        if (typeof hideConnectionStatus !== 'undefined') {
            hideConnectionStatus();
        }
        
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
        
        const notification = document.getElementById('incoming-call-notification');
        if (notification) notification.remove();
        
        UIManager.showStatus('Call rejected');
        UIManager.updateCallButtons();
    },
    
    handleCallAccepted(data) {
        console.log('✅ Call accepted by:', data.calleeName);
        DebugConsole?.success('Call', `Call accepted by ${data.calleeName}`);
        UIManager.showStatus('Call accepted - connecting...');
        
        CONFIG.isInCall = true;
        UIManager.updateCallButtons();
        
        if (CONFIG.isInitiator) {
            console.log('We are the caller, sending offer now...');
            DebugConsole?.network('WebRTC', 'Sending ICE offer to server');
            setTimeout(() => {
                if (CONFIG.peerConnection && CONFIG.targetSocketId) {
                    WebRTCManager.createAndSendOffer();
                }
            }, 500);
        } else {
            console.log('We are the callee, waiting for offer...');
            DebugConsole?.network('WebRTC', 'Waiting for ICE offer');
        }
    },
    
    handleCallRejected(data) {
        console.log('=== CallManager.handleCallRejected() - stopping monitoring ===');
        DebugConsole?.warning('Call', `Call rejected by ${data.rejecterName || 'remote user'}`);
        
        if (typeof stopMonitoring !== 'undefined') {
            stopMonitoring();
        }
        if (typeof hideConnectionStatus !== 'undefined') {
            hideConnectionStatus();
        }
        
        console.log('Call rejected by:', data.rejecterName);
        
        if (!CONFIG.isAdmin) {
            CONFIG.adminInCall = false;
        }
        
        this.cleanupCall();
        UIManager.showStatus('Call rejected by ' + (data.rejecterName || 'user'));
    },
    
    handleCallEnded(data) {
        console.log('=== CallManager.handleCallEnded() - stopping monitoring ===');
        DebugConsole?.call('Call', `Call ended by ${data.endedByName || 'remote user'}`);
        
        if (typeof stopMonitoring !== 'undefined') {
            stopMonitoring();
        }
        if (typeof hideConnectionStatus !== 'undefined') {
            hideConnectionStatus();
        }
        
        console.log('Call ended by remote:', data.endedByName || 'remote user');
        
        if (!CONFIG.isAdmin) {
            CONFIG.adminInCall = false;
        }
        
        CONFIG.isInCall = false;
        CONFIG.isCallActive = false;
        
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
    },
    
    handleUnexpectedDisconnect() {
        console.log('⚠️ Unexpected call disconnection');
        DebugConsole?.warning('Call', 'Call ended unexpectedly');
        
        CONFIG.isInCall = false;
        CONFIG.isCallActive = false;
        
        if (!CONFIG.isAdmin) {
            CONFIG.adminInCall = false;
        }
        
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
        
        this.cleanupCall();
        UIManager.showStatus('Call disconnected');
    },
    
    hangup() {
        console.log('=== CallManager.hangup() - stopping monitoring ===');
        DebugConsole?.call('Call', 'Ending call');
        
        if (typeof stopMonitoring !== 'undefined') {
            stopMonitoring();
        }
        if (typeof hideConnectionStatus !== 'undefined') {
            hideConnectionStatus();
        }
        
        console.log('Ending call');
        UIManager.showStatus('Ending call...');
        
        if (!CONFIG.peerConnection || CONFIG.peerConnection.connectionState === 'new' || CONFIG.peerConnection.connectionState === 'connecting') {
            console.log('Call cancelled before connection established');
            DebugConsole?.info('Call', 'Call cancelled before connection');
            
            this.cleanupCall();
            return;
        }
        
        if (CONFIG.targetSocketId) {
            WebSocketClient.sendToServer({
                type: 'call-end',
                targetSocketId: CONFIG.targetSocketId
            });
        }
        
        this.cleanupCall();
    },
    
    // ===== UPDATED: cleanupCall with force admin cleanup =====
    cleanupCall() {
        console.log('Cleaning up call...');
        DebugConsole?.info('Call', 'Cleaning up call resources');
        
        // ===== NEW: Force admin cleanup if this was a failed call =====
        if (!CONFIG.isInCall && CONFIG.adminInCall) {
            this.forceAdminCleanup();
        }
        
        // ===== NEW: Clear connection timeout =====
        if (CONFIG.connectionTimeout) {
            clearTimeout(CONFIG.connectionTimeout);
            CONFIG.connectionTimeout = null;
        }
        
        // Stop WebRTC metrics monitoring
        if (window.WebRTCMetrics) {
            WebRTCMetrics.stop();
        }
        
        // Stop any notification sound
        this.stopNotificationSound();
        
        CONFIG.isProcessingAnswer = false;
        CONFIG.isInCall = false;
        CONFIG.isCallActive = false;
        CONFIG.manualHangupControl = false;
        
        // Start cooldown to prevent immediate re-call
        this.startCallCooldown();
        
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
        
        const notification = document.getElementById('incoming-call-notification');
        if (notification) notification.remove();
        
        this.enableHangupButton(false);
        
        UIManager.showStatus('Ready');
        UIManager.updateCallButtons();
        DebugConsole?.info('Call', 'Call cleanup complete');
    }
};

window.CallManager = CallManager;
