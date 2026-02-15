// js/firestore-client.js - COMPLETE WITH FIRESTORE RELAY AND CLIENT PINGS
console.log('🔥🔥🔥 firestore-client.js STARTED EXECUTION 🔥🔥🔥');
console.log('Line 1 executed');
const FirestoreClient = {
    // Firebase/Firestore properties
    db: null,
    unsubscribe: null,
    currentUser: null,
    isInitialized: false,
    
    // Network quality measurement properties (preserved)
    pingTimes: [],
    lastPingTime: null,
    networkQuality: 'good',
    lastMetricsUpdate: 0,
    
    // Reconnection handling (Firestore handles this, but we track state)
    reconnectAttempts: 0,
    maxReconnectAttempts: 20,
    isIntentionalDisconnect: false,
    
    // ADDED: Ping interval property
    pingInterval: null,
    
    // Initialize Firebase and Firestore
    async init(userId) {
        console.log('Initializing Firestore client for user:', userId);
        DebugConsole?.info('Firestore', `Initializing for user: ${userId}`);
        
        try {
            // Initialize Firebase (config from your Firebase console)
            const firebaseConfig = {
                apiKey: "AIzaSyD9US_D9RfsoKu9K_lVRak7c_0Ht9k-5Ak",
                authDomain: "relay-725ff.firebaseapp.com",
                projectId: "relay-725ff",
                storageBucket: "relay-725ff.firebasestorage.app",
                messagingSenderId: "954800431802",
                appId: "1:954800431802:web:9d095fc106260878fb1883"
            };
            
            // Initialize Firebase if not already initialized
            if (!firebase.apps.length) {
                firebase.initializeApp(firebaseConfig);
            }
            
            this.db = firebase.firestore();
            this.currentUser = userId;
            
            // Enable offline persistence - ONLY attempt once, ignore errors on reconnect
            try {
                await this.db.enablePersistence({ experimentalForceOwningTab: true })
                    .catch(err => {
                        // These errors are expected in certain scenarios
                        if (err.code === 'failed-precondition') {
                            DebugConsole?.warning('Firestore', 'Multiple tabs open, persistence disabled');
                        } else if (err.code === 'unimplemented') {
                            DebugConsole?.warning('Firestore', 'Browser doesn\'t support persistence');
                        } else if (err.message && err.message.includes('already started')) {
                            // This happens on reconnect - ignore
                            console.log('Persistence already enabled (reconnect scenario)');
                        } else {
                            // Unexpected error
                            throw err;
                        }
                    });
            } catch (persistError) {
                // Log but continue - persistence is optional
                console.log('Persistence setup skipped:', persistError.message);
            }
            
            // Set up listener for incoming messages
            await this.setupMessageListener(userId);
            
            this.isInitialized = true;
            this.reconnectAttempts = 0;
            
            // ADDED: Start ping interval after successful initialization
            this.startPingInterval();
            
            console.log('✅ Firestore client initialized');
            DebugConsole?.success('Firestore', 'Client initialized successfully');
            UIManager?.showStatus('Connected to server');
            
            return true;
            
        } catch (error) {
            console.error('Failed to initialize Firestore:', error);
            DebugConsole?.error('Firestore', `Init failed: ${error.message}`);
            UIManager?.showError('Connection failed');
            this.scheduleReconnect(userId);
            return false;
        }
    },
    
    // Set up Firestore listener for incoming messages
    async setupMessageListener(userId) {
        console.log('Setting up Firestore listener for:', userId);
        
        // Query for messages destined for this user
        const messagesRef = this.db.collection('relay');
        const q = messagesRef
            .where('to', '==', userId)
            .orderBy('timestamp', 'asc');
        
        // Set up real-time listener
        this.unsubscribe = q.onSnapshot((snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    const doc = change.doc;
                    const message = doc.data();
                    
                    console.log('📨 Received from Firestore:', message.type, message);
                    DebugConsole?.network('Firestore', `Received ${message.type}`);
                    
                    // Handle pings specially for latency measurement
                    if (message.type === 'ping') {
                        this.handlePing(message);
                    }
                    
                    // Pass to message handler (preserves all existing logic)
                    this.handleMessage(message);
                    
                    // Delete after processing (optional - keeps collection clean)
                    // Uncomment if you want auto-cleanup
                    // doc.ref.delete().catch(err => {
                    //     DebugConsole?.warning('Firestore', `Failed to delete message: ${err.message}`);
                    // });
                }
            });
        }, (error) => {
            console.error('Firestore listener error:', error);
            DebugConsole?.error('Firestore', `Listener error: ${error.message}`);
            
            if (!this.isIntentionalDisconnect) {
                this.scheduleReconnect(userId);
            }
        });
        
        // Also listen for server presence (admin online/offline)
        this.setupPresenceListener();
    },
    
    // Listen for server/admin presence
    setupPresenceListener() {
        // You could have a special "presence" document in Firestore
        // that the server updates periodically
        const presenceRef = this.db.collection('status').doc('admin');
        
        this.presenceUnsubscribe = presenceRef.onSnapshot((doc) => {
            if (doc.exists) {
                const data = doc.data();
                if (data.online) {
                    this.handleAdminOnline({
                        type: 'admin-online',
                        adminUsername: data.username,
                        adminSocketId: data.socketId || 'firestore-admin'
                    });
                } else {
                    this.handleAdminOffline({
                        type: 'admin-offline'
                    });
                }
            }
        });
    },
    
    // Send message via Firestore
    async sendToServer(message) {
        if (!this.db || !this.currentUser) {
            console.warn('Cannot send: Firestore not initialized');
            DebugConsole?.warning('Firestore', 'Cannot send - not initialized');
            UIManager?.showError('Not connected to server');
            return false;
        }
        
        try {
            console.log('📤 Sending via Firestore:', message.type, message);
            DebugConsole?.network('Firestore', `Sending ${message.type}`);
            
            // Add timestamp for latency measurement if this is a ping
            if (message.type === 'ping') {
                this.lastPingTime = Date.now();
            }
            
            // Prepare the relay message
            const relayMessage = {
                to: 'railway-server',  // All messages go to server first
                from: this.currentUser,
                type: message.type,
                data: message,          // Original message preserved
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                messageId: this.generateMessageId(),
                requiresResponse: ['offer', 'answer', 'ice-candidate'].includes(message.type)
            };
            
            // Add callId if present
            if (message.callId) {
                relayMessage.callId = message.callId;
            }
            
            // Write to Firestore
            await this.db.collection('relay').add(relayMessage);
            
            return true;
            
        } catch (error) {
            console.error('Failed to send message:', error);
            DebugConsole?.error('Firestore', `Send failed: ${error.message}`);
            UIManager?.showError('Failed to send message');
            
            if (!this.isIntentionalDisconnect) {
                this.scheduleReconnect(this.currentUser);
            }
            
            return false;
        }
    },
    
    // Generate unique message ID for tracking
    generateMessageId() {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    },
    
    // Handle ping specially for latency measurement
    handlePing(message) {
        console.log('🏓 Ping received from server via Firestore');
        DebugConsole?.network('Firestore', 'Ping received');
        
        // Send pong response
        this.sendToServer({ type: 'pong' });
    },
    
    // ADDED: Start periodic ping interval
    startPingInterval() {
        // Clear any existing interval
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
        
        console.log('⏰ Starting ping interval (30 seconds)');
        DebugConsole?.network('Firestore', 'Starting ping interval');
        
        // Send ping every 30 seconds
        this.pingInterval = setInterval(() => {
            if (this.isInitialized && this.currentUser) {
                console.log('🏓 Sending client ping');
                DebugConsole?.network('Firestore', 'Sending client ping');
                this.sendToServer({ type: 'ping' });
            }
        }, 30000); // 30 seconds
    },
    
    // Schedule reconnection attempt
    scheduleReconnect(userId) {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Max reconnection attempts reached');
            DebugConsole?.error('Firestore', 'Max reconnection attempts reached');
            UIManager?.showError('Connection lost. Please refresh the page.');
            return;
        }
        
        const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 30000);
        console.log(`⏰ Reconnecting in ${delay/1000}s (attempt ${this.reconnectAttempts + 1})`);
        DebugConsole?.network('Firestore', `Reconnecting in ${delay/1000}s`);
        UIManager?.showStatus(`Reconnecting in ${delay/1000}s...`);
        
        setTimeout(async () => {
            this.reconnectAttempts++;
            await this.cleanup();
            await this.init(userId);
        }, delay);
    },
    
    // Clean up listeners
    async cleanup() {
        // ADDED: Clear ping interval
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
            console.log('⏹️ Ping interval cleared');
        }
        
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
        if (this.presenceUnsubscribe) {
            this.presenceUnsubscribe();
            this.presenceUnsubscribe = null;
        }
    },
    
    // Disconnect intentionally
    async disconnect() {
        this.isIntentionalDisconnect = true;
        DebugConsole?.info('Firestore', 'Intentional disconnect');
        
        // Send logout message
        await this.sendToServer({
            type: 'logout',
            username: this.currentUser
        });
        
        await this.cleanup();
        this.currentUser = null;
        this.isInitialized = false;
        
        UIManager?.showStatus('Disconnected');
    },
    
    // ===== PRESERVED METHODS FROM ORIGINAL =====
    // All these methods remain EXACTLY as they were
    // Only change: they now receive messages from Firestore instead of WebSocket
    
    // Network quality measurement (preserved)
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
            
            if (UIManager?.showNetworkMetrics) {
                UIManager.showNetworkMetrics(metrics);
                DebugConsole?.network('Network', `Latency: ${metrics.latency}ms, Jitter: ${metrics.jitter}ms, Loss: ${metrics.packetLoss}%, BW: ${metrics.bandwidth}Mbps`);
            } else if (UIManager?.showNetworkQuality) {
                UIManager.showNetworkQuality(quality);
            }
        }
    },
    
    // Calculate jitter (preserved)
    calculateJitter() {
        if (this.pingTimes.length < 2) return 0;
        let sumDiff = 0;
        for (let i = 1; i < this.pingTimes.length; i++) {
            sumDiff += Math.abs(this.pingTimes[i] - this.pingTimes[i-1]);
        }
        return Math.round(sumDiff / (this.pingTimes.length - 1));
    },
    
    // Bandwidth estimate (preserved)
    getBandwidthEstimate(latency) {
        if (latency < 50) return 50;
        if (latency < 100) return 25;
        if (latency < 200) return 10;
        if (latency < 400) return 5;
        return 2;
    },
    
    // COMPLETE ORIGINAL handleMessage METHOD - PRESERVED EXACTLY
    handleMessage(message) {
        // If message is wrapped in Firestore envelope, extract data
        const actualMessage = message.data || message;
        
        console.log('Processing message:', actualMessage.type, actualMessage);
        
        switch (actualMessage.type) {
            case 'connected':
                this.handleConnected(actualMessage);
                break;
                
            case 'login-success':
                AuthManager?.handleLoginSuccess(actualMessage);
                break;
                
            case 'login-error':
                UIManager?.showError(actualMessage.message);
                UIManager?.showStatus('Login failed');
                DebugConsole?.error('Auth', `Login failed: ${actualMessage.message}`);
                break;
                
            case 'user-list':
                UIManager?.updateUsersList(actualMessage.users);
                break;
                
            case 'user-connected':
                console.log(`👤 User connected: ${actualMessage.user?.username}`);
                DebugConsole?.info('Users', `User connected: ${actualMessage.user?.username}`);
                if (CONFIG?.isAdmin) {
                    setTimeout(() => this.sendToServer({ type: 'get-users' }), 100);
                }
                break;
                
            case 'user-disconnected':
                console.log(`👤 User disconnected: ${actualMessage.username}`);
                DebugConsole?.info('Users', `User disconnected: ${actualMessage.username}`);
                if (CONFIG?.isAdmin) {
                    setTimeout(() => this.sendToServer({ type: 'get-users' }), 100);
                }
                break;
                
            case 'admin-online':
                this.handleAdminOnline(actualMessage);
                break;
                
            case 'admin-offline':
                this.handleAdminOffline(actualMessage);
                break;
                
            case 'call-initiated':
                DebugConsole?.call('Call', `Incoming call from ${actualMessage.callerName}`);
                CallManager?.handleCallInitiated(actualMessage);
                break;
                
            case 'call-initiated-confirm':
                UIManager?.showStatus(`Calling ${actualMessage.targetName}...`);
                DebugConsole?.call('Call', `Calling ${actualMessage.targetName}`);
                break;
                
            case 'call-accepted':
                DebugConsole?.success('Call', `Call accepted by ${actualMessage.calleeName}`);
                CallManager?.handleCallAccepted(actualMessage);
                break;
                
            case 'call-rejected':
                DebugConsole?.warning('Call', `Call rejected by ${actualMessage.rejecterName || 'remote user'}`);
                if (typeof stopMonitoring !== 'undefined') stopMonitoring();
                if (typeof hideConnectionStatus !== 'undefined') hideConnectionStatus();
                CallManager?.handleCallRejected(actualMessage);
                break;
                
            case 'call-ended':
                DebugConsole?.call('Call', `Call ended by ${actualMessage.endedByName || 'remote user'}`);
                if (typeof stopMonitoring !== 'undefined') stopMonitoring();
                if (typeof hideConnectionStatus !== 'undefined') hideConnectionStatus();
                CallManager?.handleCallEnded(actualMessage);
                break;
                
            case 'offer':
                DebugConsole?.network('WebRTC', 'Received ICE offer');
                if (WebRTCManager && typeof WebRTCManager.handleOffer === 'function') {
                    WebRTCManager.handleOffer(actualMessage);
                }
                break;
                
            case 'answer':
                DebugConsole?.network('WebRTC', 'Received ICE answer');
                if (WebRTCManager && typeof WebRTCManager.handleAnswer === 'function') {
                    WebRTCManager.handleAnswer(actualMessage);
                }
                break;
                
            case 'ice-candidate':
                DebugConsole?.network('WebRTC', 'Received ICE candidate');
                if (WebRTCManager && typeof WebRTCManager.handleIceCandidate === 'function') {
                    WebRTCManager.handleIceCandidate(actualMessage);
                }
                break;
                
            case 'ping':
                // Already handled separately, but keep for compatibility
                break;
                
            case 'pong':
                console.log('🏓 Pong received');
                DebugConsole?.network('Firestore', 'Pong received');
                if (this.lastPingTime) {
                    const latency = Date.now() - this.lastPingTime;
                    this.updateNetworkQualityFromLatency(latency);
                }
                break;
                
            case 'error':
                UIManager?.showError(actualMessage.message);
                DebugConsole?.error('Server', actualMessage.message);
                break;
                
            case 'call-ended-confirm':
                console.log('📞 Call end confirmed');
                DebugConsole?.call('Call', 'Call end confirmed');
                break;                
                
            default:
                console.warn(`Unknown message type: ${actualMessage.type}`);
                DebugConsole?.warning('Firestore', `Unknown message type: ${actualMessage.type}`);
        }
    },
    
    // Original handler methods preserved
    handleConnected(message) {
        console.log('Connected to signaling server');
        console.log('Socket ID:', message.socketId);
        DebugConsole?.success('Firestore', `Connected, Socket ID: ${message.socketId}`);
        if (CONFIG) CONFIG.mySocketId = message.socketId;
    },
    
    handleAdminOnline(message) {
        console.log(`📢 Admin is online: ${message.adminUsername}`);
        DebugConsole?.success('Admin', `Admin is online (${message.adminUsername})`);
        if (CONFIG) {
            CONFIG.adminSocketId = message.adminSocketId;
            CONFIG.adminUsername = message.adminUsername;
        }
        
        UIManager?.showStatus(`Admin is online`);
        
        if (!CONFIG?.isAdmin && !CONFIG?.isInCall) {
            UIManager?.updateCallButtons();
        }
    },
    
    handleAdminOffline(message) {
        console.log('📢 Admin is offline');
        DebugConsole?.warning('Admin', 'Admin is offline');
        if (CONFIG) CONFIG.adminSocketId = null;
        
        UIManager?.showStatus('Admin is offline');
        
        if (!CONFIG?.isAdmin) {
            UIManager?.updateCallButtons();
        }
    }
};

// Export for use
window.FirestoreClient = FirestoreClient;
