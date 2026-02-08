// js/auth-manager.js - RESTORE TO WORKING VERSION
const AuthManager = {
    async login() {
        // Get access code from the hidden input
        const accessCode = CONFIG.elements.accessCodeInput ? 
                          CONFIG.elements.accessCodeInput.value.trim() : '';
        
        if (!accessCode) {
            UIManager.showError('Please enter an access code');
            return;
        }
        
        console.log('Login attempt with code:', accessCode);
        UIManager.showStatus('Logging in...');
        
        // Clear the input after sending
        if (CONFIG.elements.accessCodeInput) {
            CONFIG.elements.accessCodeInput.value = '';
        }
        
        WebSocketClient.sendToServer({
            type: 'login',
            accessCode: accessCode
        });
    },
    
    handleLoginSuccess(data) {
        CONFIG.myId = data.userId || data.socketId;
        CONFIG.myUsername = data.username || data.displayName;
        CONFIG.isAdmin = data.isAdmin || false;
        CONFIG.adminSocketId = data.adminSocketId || null;
        
        console.log(`✅ Logged in: ${CONFIG.myUsername}, Admin: ${CONFIG.isAdmin}`);
        console.log(`📍 Admin socket: ${CONFIG.adminSocketId || 'No admin online'}`);
        
        UIManager.showCallScreen();
        UIManager.showStatus(`Logged in as ${CONFIG.myUsername} ${CONFIG.isAdmin ? '(Admin)' : ''}`);
        
        // Check permissions for local preview
        setTimeout(async () => {
            await this.checkPermissions();
            await this.ensureMediaPermissions(); // For preview
        }, 100);
    },
    
    logout() {
        console.log('Logging out...');
        
        // Send logout to server
        if (CONFIG.ws && CONFIG.ws.readyState === WebSocket.OPEN) {
            WebSocketClient.sendToServer({ type: 'logout' });
        }
        
        // Cleanup call if active
        CallManager.cleanupCall();
        
        // Stop media streams
        if (CONFIG.localStream) {
            CONFIG.localStream.getTracks().forEach(track => track.stop());
            CONFIG.localStream = null;
        }
        
        // Reset video elements
        if (CONFIG.elements.localVideo) {
            CONFIG.elements.localVideo.srcObject = null;
        }
        if (CONFIG.elements.remoteVideo) {
            CONFIG.elements.remoteVideo.srcObject = null;
        }
        
        // Reset all state
        CONFIG.myId = null;
        CONFIG.myUsername = null;
        CONFIG.isAdmin = false;
        CONFIG.adminSocketId = null;
        CONFIG.connectedUsers = [];
        CONFIG.hasMediaPermissions = false;
        CONFIG.targetSocketId = null;
        CONFIG.targetUsername = null;
        CONFIG.isInCall = false;
        CONFIG.isInitiator = false;
        CONFIG.incomingCallFrom = null;
        CONFIG.peerConnection = null;
        CONFIG.remoteStream = null;
        
        // Show login screen
        UIManager.showLoginScreen();
        UIManager.showStatus('Logged out');
        
        // Clear access code display
        if (typeof clearCode === 'function') {
            clearCode();
        }
    },
    
    async checkPermissions() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            CONFIG.hasMediaPermissions = devices.some(device => 
                (device.kind === 'audioinput' || device.kind === 'videoinput') && 
                device.deviceId !== ''
            );
            console.log('Media permissions:', CONFIG.hasMediaPermissions ? 'Granted' : 'Not granted');
            return CONFIG.hasMediaPermissions;
        } catch (error) {
            console.log('Cannot check permissions:', error);
            return false;
        }
    },
    
    async ensureMediaPermissions(forCall = false) {
        if (CONFIG.hasMediaPermissions && CONFIG.localStream && !forCall) {
            return true;
        }
        
        try {
            UIManager.showStatus('Requesting camera/microphone access...');
            
            let constraints;
            
            if (forCall) {
                // For calls: Use ResolutionManager if available
                if (typeof ResolutionManager !== 'undefined') {
                    constraints = ResolutionManager.getCallConstraints();
                } else {
                    constraints = { audio: true, video: true };
                }
            } else {
                // For preview: Always use video with reasonable defaults
                constraints = { 
                    audio: true, 
                    video: { 
                        width: { ideal: 640 }, 
                        height: { ideal: 480 }, 
                        frameRate: { ideal: 24 } 
                    } 
                };
            }
            
            console.log('Getting media with constraints:', constraints);
            CONFIG.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            CONFIG.hasMediaPermissions = true;
            
            if (CONFIG.elements.localVideo) {
                CONFIG.elements.localVideo.srcObject = CONFIG.localStream;
                CONFIG.elements.localVideo.muted = true;
                CONFIG.elements.localVideo.play().catch(e => console.log('Local video play:', e));
            }
            
            console.log('✅ Media permissions granted');
            return true;
            
        } catch (error) {
            console.error('Failed to get media permissions:', error);
            UIManager.showError('Camera/microphone access is required for calls');
            return false;
        }
    }
};

window.AuthManager = AuthManager;
