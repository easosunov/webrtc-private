// js/auth-manager.js - MODIFIED for phone keypad
const AuthManager = {
    async login() {
        // Get access code from hidden input (phone keypad sets this)
        const accessCode = CONFIG.elements.accessCodeInput ? 
            CONFIG.elements.accessCodeInput.value.trim() : '';
        
        if (!accessCode) {
            UIManager.showError('Enter your access code');
            return;
        }
        
        console.log('Login attempt with access code:', accessCode);
        UIManager.showStatus('Logging in...');
        
        WebSocketClient.sendToServer({
            type: 'login',
            accessCode: accessCode
        });
    },
    
    handleLoginSuccess(data) {
        CONFIG.myId = data.userId;
        CONFIG.myUsername = data.username;
        CONFIG.isAdmin = data.isAdmin || false;
        CONFIG.adminSocketId = data.adminSocketId || null;
        
        console.log(`✅ Logged in: ${CONFIG.myUsername}, Admin: ${CONFIG.isAdmin}`);
        console.log(`📍 Admin socket: ${CONFIG.adminSocketId}`);
        
        UIManager.showCallScreen();
        UIManager.showStatus(`Logged in as ${CONFIG.myUsername} ${CONFIG.isAdmin ? '(Admin)' : ''}`);
        
        // Request user list if admin
        if (CONFIG.isAdmin) {
            setTimeout(() => WebSocketClient.sendToServer({ type: 'get-users' }), 500);
        }
        
        // Check permissions
        setTimeout(async () => {
            await this.checkPermissions();
            await this.ensureMediaPermissions();
        }, 500);
    },
    
    logout() {
        WebSocketClient.sendToServer({ type: 'logout' });
        CallManager.cleanupCall();
        
        if (CONFIG.localStream) {
            CONFIG.localStream.getTracks().forEach(track => track.stop());
            CONFIG.localStream = null;
        }
        
        UIManager.showLoginScreen();
        CONFIG.elements.localVideo.srcObject = null;
        CONFIG.elements.remoteVideo.srcObject = null;
        
        // Reset state
        CONFIG.myId = null;
        CONFIG.myUsername = null;
        CONFIG.isAdmin = false;
        CONFIG.adminSocketId = null;
        CONFIG.connectedUsers = [];
        CONFIG.hasMediaPermissions = false;
        
        // Clear the access code display
        if (typeof clearCode === 'function') {
            clearCode();
        }
        
        UIManager.showStatus('Logged out');
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
            UIManager.showError('Camera/microphone access is required for calls');
            return false;
        }
    }
};

window.AuthManager = AuthManager;
