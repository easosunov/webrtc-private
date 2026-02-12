// js/websocket-client.js - MINIMAL FIX VERSION
const WebSocketClient = {
    connect() {
        return new Promise((resolve, reject) => {
            console.log('Connecting:', CONFIG.wsUrl);
            
            try {
                this.ws = new WebSocket(CONFIG.wsUrl);
                CONFIG.ws = this.ws;
                
                this.ws.onopen = () => {
                    console.log('✅ WebSocket connected');
                    UIManager.showStatus('Connected to server');
                    resolve();
                };
                
                this.ws.onmessage = (event) => {
                    this.handleMessage(event.data);
                };
                
                this.ws.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    UIManager.showError('Connection error');
                    reject(error);
                };
                
                this.ws.onclose = () => {
                    console.log('WebSocket disconnected');
                    if (!CONFIG.isInCall) {
                        UIManager.showStatus('Disconnected from server');
                    }
                };
                
                // Timeout connection attempt
                setTimeout(() => {
                    if (this.ws.readyState !== WebSocket.OPEN) {
                        reject(new Error('Connection timeout'));
                    }
                }, 10000);
                
            } catch (error) {
                console.error('Failed to create WebSocket:', error);
                reject(error);
            }
        });
    },


// Add this at the top of WebSocketClient
reconnectAttempts: 0,
maxReconnectAttempts: 10,
reconnectTimer: null,

// Add this method
scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
        const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 30000);
        console.log(`⏰ Reconnecting in ${delay/1000}s (attempt ${this.reconnectAttempts + 1})`);
        
        this.reconnectTimer = setTimeout(() => {
            this.reconnectAttempts++;
            this.connect().catch(() => this.scheduleReconnect());
        }, delay);
    } else {
        console.error('❌ Max reconnection attempts reached');
        UIManager.showError('Cannot connect to server. Please refresh the page.');
    }
},

// Modify onclose handler:
this.ws.onclose = () => {
    console.log('WebSocket disconnected');
    if (!CONFIG.isInCall && !CONFIG.isIntentionalLogout) {
        UIManager.showStatus('Disconnected from server');
        this.scheduleReconnect();  // ← ADD THIS LINE
    }
};

// Modify onopen handler:
this.ws.onopen = () => {
    console.log('✅ WebSocket connected');
    UIManager.showStatus('Connected to server');
    this.reconnectAttempts = 0;  // ← ADD THIS LINE
    resolve();
};

    
    sendToServer(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            console.log('📤 Sending:', message.type, message);
            this.ws.send(JSON.stringify(message));
            return true;
        } else {
            console.warn('Cannot send: WebSocket not connected');
            UIManager.showError('Not connected to server');
            return false;
        }
    },
    
    handleMessage(data) {
        try {
            const message = JSON.parse(data);
            console.log('📨 Received:', message.type, message);
            
            switch (message.type) {
                case 'connected':
                    this.handleConnected(message);
                    break;
                    
                case 'login-success':
                    AuthManager.handleLoginSuccess(message);
                    break;
                    
                case 'login-error':
                    UIManager.showError(message.message);
                    UIManager.showStatus('Login failed');
                    break;
                    
                case 'user-list':
                    UIManager.updateUsersList(message.users);
                    break;
                    
                case 'user-connected':
                    console.log(`👤 User connected: ${message.user?.username}`);
                    if (CONFIG.isAdmin) {
                        setTimeout(() => this.sendToServer({ type: 'get-users' }), 100);
                    }
                    break;
                    
                case 'user-disconnected':
                    console.log(`👤 User disconnected: ${message.username}`);
                    if (CONFIG.isAdmin) {
                        setTimeout(() => this.sendToServer({ type: 'get-users' }), 100);
                    }
                    break;
                    
                case 'admin-online':
                    this.handleAdminOnline(message);
                    break;
                    
                case 'admin-offline':
                    this.handleAdminOffline(message);
                    break;
                    
                // FIX: Changed from CallManager.handleIncomingCall to CallManager.handleCallInitiated
                case 'call-initiated':
                    CallManager.handleCallInitiated(message);
                    break;
                    
                case 'call-initiated-confirm':
                    UIManager.showStatus(`Calling ${message.targetName}...`);
                    break;
                    
                case 'call-accepted':
                    CallManager.handleCallAccepted(message);
                    break;
                    
                case 'call-rejected':
                    // ADDED: Clean status before processing
                    if (typeof stopMonitoring !== 'undefined') {
                        stopMonitoring();
                    }
                    if (typeof hideConnectionStatus !== 'undefined') {
                        hideConnectionStatus();
                    }
                    CallManager.handleCallRejected(message);
                    break;
                    
                case 'call-ended':
                    // ADDED: Clean status before processing
                    if (typeof stopMonitoring !== 'undefined') {
                        stopMonitoring();
                    }
                    if (typeof hideConnectionStatus !== 'undefined') {
                        hideConnectionStatus();
                    }
                    CallManager.handleCallEnded(message);
                    break;
                    
                // FIX: Use direct method calls instead of handleSignalingMessage
                case 'offer':
                    if (WebRTCManager && typeof WebRTCManager.handleOffer === 'function') {
                        WebRTCManager.handleOffer(message);
                    }
                    break;
                    
                case 'answer':
                    if (WebRTCManager && typeof WebRTCManager.handleAnswer === 'function') {
                        WebRTCManager.handleAnswer(message);
                    }
                    break;
                    
                case 'ice-candidate':
                    if (WebRTCManager && typeof WebRTCManager.handleIceCandidate === 'function') {
                        WebRTCManager.handleIceCandidate(message);
                    }
                    break;
                    
                case 'error':
                    UIManager.showError(message.message);
                    break;
                    
                default:
                    console.warn(`Unknown message type: ${message.type}`);
            }
        } catch (error) {
            console.error('Error handling message:', error, data);
        }
    },
    
    handleConnected(message) {
        console.log('Connected to signaling server');
        console.log('Socket ID:', message.socketId);
        CONFIG.mySocketId = message.socketId;
    },
    
    handleAdminOnline(message) {
        console.log(`📢 Admin is online: ${message.adminUsername}`);
        CONFIG.adminSocketId = message.adminSocketId;
        
        // Update UI to show admin is available
        UIManager.showStatus(`Admin is online`);
        
        // Enable call button if not in call
        if (!CONFIG.isAdmin && !CONFIG.isInCall) {
            UIManager.updateCallButtons();
        }
    },
    
    handleAdminOffline(message) {
        console.log('📢 Admin is offline');
        CONFIG.adminSocketId = null;
        
        // Update UI to show admin is unavailable
        UIManager.showStatus('Admin is offline');
        
        // Disable call button
        if (!CONFIG.isAdmin) {
            UIManager.updateCallButtons();
        }
    }
};

window.WebSocketClient = WebSocketClient;

