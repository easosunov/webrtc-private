// js/websocket-client.js - COMPLETE WITH NETWORK QUALITY MEASUREMENT
const WebSocketClient = {
    // Add these new properties
    pingInterval: null,
    reconnectAttempts: 0,
    maxReconnectAttempts: 20,
    reconnectDelay: 1000,
    isIntentionalClose: false,
    
    // Network quality measurement properties
    pingTimes: [],
    lastPingTime: null,
    networkQuality: 'good',
    
    connect() {
        return new Promise((resolve, reject) => {
            console.log('Connecting:', CONFIG.wsUrl);
            
            try {
                this.ws = new WebSocket(CONFIG.wsUrl);
                CONFIG.ws = this.ws;
                
                this.ws.onopen = () => {
                    console.log('✅ WebSocket connected');
                    UIManager.showStatus('Connected to server');
                    this.startPingInterval();
                    this.reconnectAttempts = 0;
                    this.isIntentionalClose = false;
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
                
                this.ws.onclose = (event) => {
                    console.log('WebSocket disconnected, code:', event.code);
                    if (this.pingInterval) clearInterval(this.pingInterval);
                    
                    if (!this.isIntentionalClose && !CONFIG.isInCall) {
                        UIManager.showStatus('Disconnected from server');
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
    
    startPingInterval() {
        if (this.pingInterval) clearInterval(this.pingInterval);
        this.pingInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.lastPingTime = Date.now();
                this.ws.send(JSON.stringify({ type: 'ping' }));
                console.log('🏓 Ping sent');
            }
        }, 25000); // 25 seconds - optimal for NAT timeouts
    },
    
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
    
    // ===== NEW: Update network quality based on latency =====
    updateNetworkQualityFromLatency(latency) {
        // Keep last 5 ping times
        this.pingTimes.push(latency);
        if (this.pingTimes.length > 5) {
            this.pingTimes.shift();
        }
        
        // Calculate average latency
        const avgLatency = this.pingTimes.reduce((a, b) => a + b, 0) / this.pingTimes.length;
        
        // Determine quality
        let quality;
        if (avgLatency < 100) {
            quality = 'excellent';
        } else if (avgLatency < 200) {
            quality = 'good';
        } else if (avgLatency < 400) {
            quality = 'fair';
        } else {
            quality = 'poor';
        }
        
        // Only update if changed
        if (quality !== this.networkQuality) {
            this.networkQuality = quality;
            console.log(`📊 Network quality: ${quality} (${Math.round(avgLatency)}ms)`);
            
            if (UIManager.showNetworkQuality) {
                UIManager.showNetworkQuality(quality);
            }
        }
    },
    
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
                    
                case 'ping':
                    console.log('🏓 Ping received from server');
                    this.sendToServer({ type: 'pong' });
                    break;
                    
                case 'pong':
                    console.log('🏓 Pong received');
                    if (this.lastPingTime) {
                        const latency = Date.now() - this.lastPingTime;
                        this.updateNetworkQualityFromLatency(latency);
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
