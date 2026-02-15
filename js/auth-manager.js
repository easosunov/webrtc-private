// js/auth-manager.js - FIRESTORE VERSION WITH VIDEO STABILITY AND LOGIN STATE TRACKING
const AuthManager = {
    // Add this flag to prevent multiple simultaneous requests
    permissionsRequestInProgress: false,
    
    // ADD THIS: Track login state to prevent race conditions
    loginInProgress: false,
    
    async login(accessCode) {
        console.log('Login function called with:', accessCode);
        
        // Get access code directly from parameter instead of DOM
        if (!accessCode || accessCode === 'Enter Code') {
            UIManager.showError('Please enter an access code');
            return;
        }
        
        // ADD THIS: Prevent multiple simultaneous login attempts
        if (this.loginInProgress) {
            console.log('Login already in progress, ignoring duplicate attempt');
            UIManager.showStatus('Login already in progress...');
            return;
        }
        
        console.log('Login attempt with access code:', accessCode);
        UIManager.showStatus('Logging in...');
        
        // Set login in progress flag
        this.loginInProgress = true;
        
        // Check if FirestoreClient is available
        if (!window.FirestoreClient) {
            console.error('FirestoreClient is NOT defined!');
            UIManager.showError('System not ready - please refresh');
            this.loginInProgress = false;
            return;
        }
        
        try {
            // STEP 1: Initialize Firestore client with username (access code)
            UIManager.showStatus('Connecting to server...');
            await FirestoreClient.init(accessCode);
            
            // STEP 2: Send login message via Firestore
            UIManager.showStatus('Authenticating...');
            FirestoreClient.sendToServer({
                type: 'login',
                accessCode: accessCode,
                timestamp: Date.now()
            });
            
            // Note: The actual login success will come via Firestore listener
            // and be handled by handleLoginSuccess()
            
        } catch (error) {
            console.error('Login failed:', error);
            UIManager.showError(`Login failed: ${error.message}`);
            this.loginInProgress = false; // Reset flag on error
        }
    },
    
    handleLoginSuccess(data) {
        // Reset login in progress flag
        this.loginInProgress = false;
        
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
            setTimeout(() => FirestoreClient.sendToServer({ type: 'get-users' }), 500);
        }
        
        // Check permissions
        setTimeout(async () => {
            await this.checkPermissions();
            await this.ensureMediaPermissions();
        }, 500);
    },
    
    logout() {
        // Send logout message via Firestore
        FirestoreClient.sendToServer({ type: 'logout' });
        
        // Disconnect Firestore client
        if (FirestoreClient && FirestoreClient.disconnect) {
            FirestoreClient.disconnect();
        }
        
        CallManager.cleanupCall();
        
        if (CONFIG.localStream) {
            CONFIG.localStream.getTracks().forEach(track => track.stop());
            CONFIG.localStream = null;
        }
        
        UIManager.showLoginScreen();
        
        // Reset the access code in index.html
        if (typeof accessCode !== 'undefined') {
            accessCode = '';
            if (typeof updateDisplay === 'function') {
                updateDisplay();
            }
        }
        
        // Reset CONFIG
        CONFIG.myId = null;
        CONFIG.myUsername = null;
        CONFIG.isAdmin = false;
        CONFIG.adminSocketId = null;
        CONFIG.connectedUsers = [];
        CONFIG.hasMediaPermissions = false;
        
        if (CONFIG.elements && CONFIG.elements.localVideo) {
            CONFIG.elements.localVideo.srcObject = null;
        }
        if (CONFIG.elements && CONFIG.elements.remoteVideo) {
            CONFIG.elements.remoteVideo.srcObject = null;
        }
        
        UIManager.showStatus('Logged out');
        
        // Reset login flag
        this.loginInProgress = false;
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
        // Prevent multiple simultaneous requests
        if (this.permissionsRequestInProgress) {
            console.log('Permissions request already in progress');
            return true;
        }
        
        if (CONFIG.hasMediaPermissions && CONFIG.localStream) {
            return true;
        }
        
        this.permissionsRequestInProgress = true;
        
        try {
            UIManager.showStatus('Requesting camera/microphone access...');
            
            // Use dynamic constraints from Resolution Manager if available
            let constraints;
            if (window.ResolutionManager && typeof ResolutionManager.getStreamWithCurrentResolution === 'function') {
                // Let ResolutionManager handle stream creation with current resolution
                CONFIG.localStream = await ResolutionManager.getStreamWithCurrentResolution();
                CONFIG.hasMediaPermissions = true;
                
                if (CONFIG.elements && CONFIG.elements.localVideo) {
                    CONFIG.elements.localVideo.srcObject = CONFIG.localStream;
                    CONFIG.elements.localVideo.muted = true;
                    // Don't play yet - let the video element handle it naturally
                }
                
                // Initialize cameras now that we have a stream
                if (window.WebRTCManager && WebRTCManager.initCameras) {
                    setTimeout(() => {
                        WebRTCManager.initCameras();
                    }, 500);
                }
                
                console.log('✅ Media permissions granted with resolution control');
                this.permissionsRequestInProgress = false;
                return true;
            } else {
                // Fallback to original hardcoded constraints
                constraints = {
                    audio: true,
                    video: {
                        width: { ideal: 640 },
                        height: { ideal: 480 },
                        frameRate: { ideal: 24 }
                    }
                };
                
                CONFIG.localStream = await navigator.mediaDevices.getUserMedia(constraints);
                CONFIG.hasMediaPermissions = true;
                
                if (CONFIG.elements && CONFIG.elements.localVideo) {
                    CONFIG.elements.localVideo.srcObject = CONFIG.localStream;
                    CONFIG.elements.localVideo.muted = true;
                    // Don't play yet - let the video element handle it naturally
                }
                
                // Initialize cameras now that we have a stream
                if (window.WebRTCManager && WebRTCManager.initCameras) {
                    setTimeout(() => {
                        WebRTCManager.initCameras();
                    }, 500);
                }
                
                console.log('✅ Media permissions granted');
                this.permissionsRequestInProgress = false;
                return true;
            }
            
        } catch (error) {
            console.error('Failed to get media permissions:', error);
            UIManager.showError('Camera/microphone access is required for calls');
            this.permissionsRequestInProgress = false;
            return false;
        }
    }
};

// Export for use
window.AuthManager = AuthManager;
