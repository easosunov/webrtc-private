// js/auth-manager.js - ORIGINAL WORKING VERSION
const AuthManager = {
    async login() {
        // Get access code from hidden input
        const accessCode = CONFIG.elements.accessCodeInput ? 
                          CONFIG.elements.accessCodeInput.value.trim() : '';
        
        if (!accessCode) {
            UIManager.showError('Please enter an access code');
            return;
        }
        
        console.log('Login attempt with code:', accessCode);
        UIManager.showStatus('Logging in...');
        
        // Send to server
        WebSocketClient.sendToServer({
            type: 'login',
            accessCode: accessCode
        });
    },
    
    handleLoginSuccess(data) {
        CONFIG.myId = data.socketId || data.userId;
        CONFIG.myUsername = data.displayName || data.username;
        CONFIG.isAdmin = data.isAdmin || false;
        
        console.log(`✅ Logged in: ${CONFIG.myUsername}, Admin: ${CONFIG.isAdmin}`);
        
        UIManager.showCallScreen();
        UIManager.showStatus(`Logged in as ${CONFIG.myUsername}`);
        
        // Get media for preview
        setTimeout(async () => {
            await this.ensureMediaPermissions();
        }, 100);
    },
    
    logout() {
        console.log('Logging out...');
        
        // Send logout if connected
        if (CONFIG.ws && CONFIG.ws.readyState === WebSocket.OPEN) {
            WebSocketClient.sendToServer({ type: 'logout' });
        }
        
        // Cleanup
        CallManager.cleanupCall();
        
        if (CONFIG.localStream) {
            CONFIG.localStream.getTracks().forEach(track => track.stop());
            CONFIG.localStream = null;
        }
        
        // Reset UI
        UIManager.showLoginScreen();
        if (CONFIG.elements.localVideo) {
            CONFIG.elements.localVideo.srcObject = null;
        }
        if (CONFIG.elements.remoteVideo) {
            CONFIG.elements.remoteVideo.srcObject = null;
        }
        
        // Reset state
        CONFIG.myId = null;
        CONFIG.myUsername = null;
        CONFIG.isAdmin = false;
        CONFIG.adminSocketId = null;
        CONFIG.hasMediaPermissions = false;
        
        UIManager.showStatus('Logged out');
    },
    
    async ensureMediaPermissions() {
        if (CONFIG.hasMediaPermissions && CONFIG.localStream) {
            return true;
        }
        
        try {
            UIManager.showStatus('Requesting camera/microphone access...');
            
            const constraints = {
                audio: true,
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    frameRate: { ideal: 24 }
                }
            };
            
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
            return false;
        }
    }
};

window.AuthManager = AuthManager;
