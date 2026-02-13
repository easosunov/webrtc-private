// js/websocket-client.js - COMPLETE WITH PING & SMART RECONNECT
const WebSocketClient = {
    // Add these new properties
    pingInterval: null,
    reconnectAttempts: 0,
    maxReconnectAttempts: 20,
    reconnectDelay: 1000,
    isIntentionalClose: false,
    
    connect() {
        return new Promise((resolve, reject) => {
            console.log('Connecting:', CONFIG.wsUrl);
            
            try {
                this.ws = new WebSocket(CONFIG.wsUrl);
                CONFIG.ws = this.ws;
                
                this.ws.onopen = () => {
                    console.log('✅ WebSocket connected');
                    UIManager.showStatus('Connected to server');
                    this.startPingInterval(); // ADDED
                    this.reconnectAttempts = 0; // ADDED
                    this.isIntentionalClose = false; // ADDED
                    resolve();
                };
                
                this.ws.onmessage = (event) => {
                    this.handleMessage(event.data);
                    
                    // ADDED: Update network quality based on message timing
                    if (event.data.includes('pong')) {
                        this.updateNetworkQuality('good');
                    }
                };
                
                this.ws.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    UIManager.showError('Connection error');
                    reject(error);
                };
                
                this.ws.onclose = (event) => {
                    console.log('WebSocket disconnected, code:', event.code);
                    if (this.pingInterval) clearInterval(this.pingInterval); // ADDED
                    
                    // Only show disconnected message if not intentional
                    if (!this.isIntentionalClose && !CONFIG.isInCall) {
                        UIManager.showStatus('Disconnected from server');
                    }
                    
                    // ADDED: Smart reconnect if not intentional
                    if (!this.isIntentionalClose) {
                        this.scheduleReconnect();
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
    
    // ADDED: Start ping interval to keep connection alive
    startPingInterval() {
        if (this.pingInterval) clearInterval(this.pingInterval);
        this.pingInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ type: 'ping' }));
                console.log('🏓 Ping sent');
            }
        }, 25000); // 25 seconds - optimal for NAT timeouts
    },
    
    // ADDED: Smart reconnect with exponential backoff
    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Max reconnection attempts reached');
            UIManager.showError('Connection lost. Please refresh the page.');
            return;
        }
        
        const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 30000);
        console.log(`⏰ Reconnecting in ${delay/1000}s (attempt ${this.reconnectAttempts + 1})`);
        UIManager.showStatus(`Reconnecting in ${delay/1000}s...`);
        
        setTimeout(() => {
            this.reconnectAttempts++;
            this.connect().catch(() => {
                // Error handled in connect promise
            });
        }, delay);
    },
    
    // ADDED: Update network quality indicator
    updateNetworkQuality(quality) {
        if (UIManager.showNetworkQuality) {
            UIManager.showNetworkQuality(quality);
        }
    },
    
    // ADDED: Graceful disconnect (call before logout)
    disconnect() {
        this.isIntentionalClose = true;
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
        if (this.ws) {
            this.ws.close(1000, 'Intentional disconnect');
        }
    },
    
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
            
            // Update network quality on any message
            this.updateNetworkQuality('good');
            
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
					
				case 'ping':
					console.log('🏓 Ping received from server');
					// Send pong back to keep connection alive
					this.sendToServer({ type: 'pong' });
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
                    if (typeof stopMonitoring !== 'undefined') {
                        stopMonitoring();
                    }
                    if (typeof hideConnectionStatus !== 'undefined') {
                        hideConnectionStatus();
                    }
                    CallManager.handleCallRejected(message);
                    break;
                    
                case 'call-ended':
                    if (typeof stopMonitoring !== 'undefined') {
                        stopMonitoring();
                    }
                    if (typeof hideConnectionStatus !== 'undefined') {
                        hideConnectionStatus();
                    }
                    CallManager.handleCallEnded(message);
                    break;
                    
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
                    
                case 'pong':
                    console.log('🏓 Pong received');
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
        
        UIManager.showStatus(`Admin is online`);
        
        if (!CONFIG.isAdmin && !CONFIG.isInCall) {
            UIManager.updateCallButtons();
        }
    },
    
    handleAdminOffline(message) {
        console.log('📢 Admin is offline');
        CONFIG.adminSocketId = null;
        
        UIManager.showStatus('Admin is offline');
        
        if (!CONFIG.isAdmin) {
            UIManager.updateCallButtons();
        }
    }
};

window.WebSocketClient = WebSocketClient;
