// js/websocket-client.js - COMPLETE WITH NETWORK QUALITY MEASUREMENT AND DEBUG LOGGING
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
    lastMetricsUpdate: 0,
    
    connect() {
        return new Promise((resolve, reject) => {
            console.log('Connecting:', CONFIG.wsUrl);
            DebugConsole?.network('WebSocket', `Connecting to ${CONFIG.wsUrl}`);
            
            try {
                this.ws = new WebSocket(CONFIG.wsUrl);
                CONFIG.ws = this.ws;
                
                this.ws.onopen = () => {
                    console.log('✅ WebSocket connected');
                    DebugConsole?.success('WebSocket', 'Connected to server');
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
                    DebugConsole?.error('WebSocket', `Connection error: ${error.message}`);
                    UIManager.showError('Connection error');
                    reject(error);
                };
                
                this.ws.onclose = (event) => {
                    console.log('WebSocket disconnected, code:', event.code);
                    DebugConsole?.warning('WebSocket', `Disconnected (code: ${event.code})`);
                    if (this.pingInterval) clearInterval(this.pingInterval);
                    
                    if (!this.isIntentionalClose && !CONFIG.isInCall) {
                        UIManager.showStatus('Disconnected from server');
                        DebugConsole?.warning('WebSocket', 'Lost connection with server');
                        this.scheduleReconnect();
                    }
                };
                
                // Timeout connection attempt
                setTimeout(() => {
                    if (this.ws.readyState !== WebSocket.OPEN) {
                        DebugConsole?.error('WebSocket', 'Connection timeout');
                        reject(new Error('Connection timeout'));
                    }
                }, 10000);
                
            } catch (error) {
                console.error('Failed to create WebSocket:', error);
                DebugConsole?.error('WebSocket', `Failed to create: ${error.message}`);
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
                //console.log('🏓 Ping sent');
                //DebugConsole?.network('WebSocket', 'Ping sent');
            }
        }, 25000); // 25 seconds - optimal for NAT timeouts
    },
    
    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Max reconnection attempts reached');
            DebugConsole?.error('WebSocket', 'Max reconnection attempts reached');
            UIManager.showError('Connection lost. Please refresh the page.');
            return;
        }
        
        const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 30000);
        console.log(`⏰ Reconnecting in ${delay/1000}s (attempt ${this.reconnectAttempts + 1})`);
        DebugConsole?.network('WebSocket', `Reconnecting in ${delay/1000}s (attempt ${this.reconnectAttempts + 1})`);
        UIManager.showStatus(`Reconnecting in ${delay/1000}s...`);
        
        setTimeout(() => {
            this.reconnectAttempts++;
            this.connect().catch(() => {
                // Error handled in connect promise
            });
        }, delay);
    },
    
    // ===== Update network quality based on latency =====
    updateNetworkQualityFromLatency(latency) {
        // Keep last 10 ping times for better accuracy
        this.pingTimes.push(latency);
        if (this.pingTimes.length > 10) {
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
            DebugConsole?.network('Network', `Quality: ${quality}, Latency: ${Math.round(avgLatency)}ms`);
        }
        
        // Calculate comprehensive metrics
        const metrics = {
            latency: Math.round(avgLatency),
            jitter: this.calculateJitter(),
            packetLoss: this.reconnectAttempts > 0 ? Math.min(30, this.reconnectAttempts * 5) : 0,
            bandwidth: this.getBandwidthEstimate(avgLatency),
            reliability: Math.max(0, Math.min(100, Math.round(100 - (avgLatency / 10) - (this.reconnectAttempts * 2))))
        };
        
        // Update UI with metrics (throttled to avoid flicker)
        const now = Date.now();
        if (now - this.lastMetricsUpdate > 2000) { // Update every 2 seconds max
            this.lastMetricsUpdate = now;
            
            if (UIManager.showNetworkMetrics) {
                UIManager.showNetworkMetrics(metrics);
                DebugConsole?.network('Network', `Latency: ${metrics.latency}ms, Jitter: ${metrics.jitter}ms, Loss: ${metrics.packetLoss}%, BW: ${metrics.bandwidth}Mbps`);
            } else if (UIManager.showNetworkQuality) {
                // Fallback to old method
                UIManager.showNetworkQuality(quality);
            }
        }
    },
    
    // Calculate jitter (variation in latency)
    calculateJitter() {
        if (this.pingTimes.length < 2) return 0;
        let sumDiff = 0;
        for (let i = 1; i < this.pingTimes.length; i++) {
            sumDiff += Math.abs(this.pingTimes[i] - this.pingTimes[i-1]);
        }
        return Math.round(sumDiff / (this.pingTimes.length - 1));
    },
    
    // Bandwidth estimate based on latency
    getBandwidthEstimate(latency) {
        if (latency < 50) return 50;  // Fiber
        if (latency < 100) return 25; // Fast broadband
        if (latency < 200) return 10; // Standard broadband
        if (latency < 400) return 5;  // Mobile 4G
        return 2;                      // Slow connection
    },
    
    disconnect() {
        this.isIntentionalClose = true;
        DebugConsole?.info('WebSocket', 'Intentional disconnect');
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
            //DebugConsole?.network('WebSocket', `Sending ${message.type} to server`);
            this.ws.send(JSON.stringify(message));
            return true;
        } else {
            console.warn('Cannot send: WebSocket not connected');
            DebugConsole?.warning('WebSocket', 'Cannot send - not connected');
            UIManager.showError('Not connected to server');
            return false;
        }
    },
    
    handleMessage(data) {
        try {
            const message = JSON.parse(data);
            console.log('📨 Received:', message.type, message);
            //DebugConsole?.network('WebSocket', `Received ${message.type} from server`);
            
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
                    DebugConsole?.error('Auth', `Login failed: ${message.message}`);
                    break;
                    
                case 'user-list':
                    UIManager.updateUsersList(message.users);
                    break;
                    
                case 'user-connected':
                    console.log(`👤 User connected: ${message.user?.username}`);
                    DebugConsole?.info('Users', `User connected: ${message.user?.username}`);
                    if (CONFIG.isAdmin) {
                        setTimeout(() => this.sendToServer({ type: 'get-users' }), 100);
                    }
                    break;
                    
                case 'user-disconnected':
                    console.log(`👤 User disconnected: ${message.username}`);
                    DebugConsole?.info('Users', `User disconnected: ${message.username}`);
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
                    DebugConsole?.call('Call', `Incoming call from ${message.callerName}`);
                    CallManager.handleCallInitiated(message);
                    break;
                    
                case 'call-initiated-confirm':
                    UIManager.showStatus(`Calling ${message.targetName}...`);
                    DebugConsole?.call('Call', `Calling ${message.targetName}`);
                    break;
                    
                case 'call-accepted':
                    DebugConsole?.success('Call', `Call accepted by ${message.calleeName}`);
                    CallManager.handleCallAccepted(message);
                    break;
                    
                case 'call-rejected':
                    DebugConsole?.warning('Call', `Call rejected by ${message.rejecterName || 'remote user'}`);
                    if (typeof stopMonitoring !== 'undefined') {
                        stopMonitoring();
                    }
                    if (typeof hideConnectionStatus !== 'undefined') {
                        hideConnectionStatus();
                    }
                    CallManager.handleCallRejected(message);
                    break;
                    
                case 'call-ended':
                    DebugConsole?.call('Call', `Call ended by ${message.endedByName || 'remote user'}`);
                    if (typeof stopMonitoring !== 'undefined') {
                        stopMonitoring();
                    }
                    if (typeof hideConnectionStatus !== 'undefined') {
                        hideConnectionStatus();
                    }
                    CallManager.handleCallEnded(message);
                    break;
                  
				case 'call-ended-confirm':
					break;
				  
                case 'offer':
                    DebugConsole?.network('WebRTC', 'Received ICE offer');
                    if (WebRTCManager && typeof WebRTCManager.handleOffer === 'function') {
                        WebRTCManager.handleOffer(message);
                    }
                    break;
                    
                case 'answer':
                    DebugConsole?.network('WebRTC', 'Received ICE answer');
                    if (WebRTCManager && typeof WebRTCManager.handleAnswer === 'function') {
                        WebRTCManager.handleAnswer(message);
                    }
                    break;
                    
                case 'ice-candidate':
                    DebugConsole?.network('WebRTC', 'Received ICE candidate');
                    if (WebRTCManager && typeof WebRTCManager.handleIceCandidate === 'function') {
                        WebRTCManager.handleIceCandidate(message);
                    }
                    break;
                    
                case 'ping':
                    //console.log('🏓 Ping received from server');
                    //DebugConsole?.network('WebSocket', 'Ping received');
                    this.sendToServer({ type: 'pong' });
                    break;
                    
                case 'pong':
                    //console.log('🏓 Pong received');
                    //DebugConsole?.network('WebSocket', 'Pong received');
                    if (this.lastPingTime) {
                        const latency = Date.now() - this.lastPingTime;
                        this.updateNetworkQualityFromLatency(latency);
                    }
                    break;
                    
                case 'error':
                    UIManager.showError(message.message);
                    DebugConsole?.error('Server', message.message);
                    break;
                    
                default:
                    console.warn(`Unknown message type: ${message.type}`);
                    DebugConsole?.warning('WebSocket', `Unknown message type: ${message.type}`);
            }
        } catch (error) {
            console.error('Error handling message:', error, data);
            DebugConsole?.error('WebSocket', `Error handling message: ${error.message}`);
        }
    },
    
    handleConnected(message) {
        console.log('Connected to signaling server');
        console.log('Socket ID:', message.socketId);
        DebugConsole?.success('WebSocket', `Connected, Socket ID: ${message.socketId}`);
        CONFIG.mySocketId = message.socketId;
    },
    
    handleAdminOnline(message) {
        console.log(`📢 Admin is online: ${message.adminUsername}`);
        DebugConsole?.success('Admin', `Admin is online (${message.adminUsername})`);
        CONFIG.adminSocketId = message.adminSocketId;
        
        UIManager.showStatus(`Admin is online`);
        
        if (!CONFIG.isAdmin && !CONFIG.isInCall) {
            UIManager.updateCallButtons();
        }
    },
    
    handleAdminOffline(message) {
        console.log('📢 Admin is offline');
        DebugConsole?.warning('Admin', 'Admin is offline');
        CONFIG.adminSocketId = null;
        
        UIManager.showStatus('Admin is offline');
        
        if (!CONFIG.isAdmin) {
            UIManager.updateCallButtons();
        }
    }
};

window.WebSocketClient = WebSocketClient;
