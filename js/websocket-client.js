// js/websocket-client.js - MODIFIED for password-only login
const WebSocketClient = {
    connect() {
        console.log('Connecting:', CONFIG.wsUrl);
        
        CONFIG.ws = new WebSocket(CONFIG.wsUrl);
        
        CONFIG.ws.onopen = () => {
            console.log('✅ WebSocket connected');
            UIManager.showStatus('Connected to server');
        };
        
        CONFIG.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('📨 Received:', data.type, data);
                this.handleMessage(data);
            } catch (error) {
                console.error('Parse error:', error);
            }
        };
        
        CONFIG.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            UIManager.showStatus('Connection error');
        };
        
        CONFIG.ws.onclose = () => {
            console.log('WebSocket closed');
            UIManager.showStatus('Disconnected');
            setTimeout(() => this.connect(), 3000);
        };
    },
    
    handleMessage(data) {
        if (!data || !data.type) return;
        
        console.log('Handling:', data.type);
        
        switch (data.type) {
            case 'connected':
                console.log('Socket ID:', data.socketId);
                break;
                
            case 'login-success':
                AuthManager.handleLoginSuccess(data);
                
                // Find admin in connected users if not admin ourselves
                if (!data.isAdmin) {
                    setTimeout(() => {
                        const adminUser = CONFIG.connectedUsers.find(u => u.isAdmin);
                        if (adminUser) {
                            CONFIG.adminSocketId = adminUser.userId; // Use userId, not socketId
                            console.log('✅ Admin online:', CONFIG.adminSocketId);
                            UIManager.showStatus('Admin online - ready to call');
                        }
                    }, 1000);
                }
                break;
                
            case 'login-error':
                UIManager.showError('Login error: ' + data.message);
                break;
                
            case 'user-list':
                CONFIG.connectedUsers = data.users || [];
                UIManager.updateUsersList(CONFIG.connectedUsers);
                
                // Update admin tracking
                if (!CONFIG.isAdmin) {
                    const adminUser = CONFIG.connectedUsers.find(u => u.isAdmin);
                    if (adminUser) {
                        CONFIG.adminSocketId = adminUser.userId;
                        console.log('✅ Admin online:', CONFIG.adminSocketId);
                        UIManager.showStatus('Admin online - ready to call');
                    } else {
                        CONFIG.adminSocketId = null;
                        console.log('⚠️ Admin offline');
                    }
                }
                break;
                
            case 'user-connected':
                CONFIG.connectedUsers.push(data.user);
                UIManager.updateUsersList(CONFIG.connectedUsers);
                
                // Check if connected user is admin
                if (data.user.isAdmin && !CONFIG.isAdmin) {
                    CONFIG.adminSocketId = data.user.userId;
                    console.log('✅ Admin came online:', CONFIG.adminSocketId);
                    UIManager.showStatus('Admin online - ready to call');
                }
                break;
                
            case 'user-disconnected':
                CONFIG.connectedUsers = CONFIG.connectedUsers.filter(u => u.userId !== data.userId);
                UIManager.updateUsersList(CONFIG.connectedUsers);
                
                // Check if disconnected user was admin
                if (data.userId === CONFIG.adminSocketId) {
                    CONFIG.adminSocketId = null;
                    console.log('⚠️ Admin went offline');
                    UIManager.showStatus('Admin offline');
                }
                break;
                
            case 'admin-online':
                // Legacy support - update to use userId
                CONFIG.adminSocketId = data.adminId || data.userId || data.socketId;
                console.log('✅ Admin online:', CONFIG.adminSocketId);
                UIManager.showStatus('Admin online - ready to call');
                break;
                
            case 'call-initiated':
                CallManager.handleCallInitiated(data);
                break;
                
            case 'call-initiated-confirm':
                console.log('Call initiated confirmed for:', data.targetName);
                UIManager.showStatus(`Calling ${data.targetName || 'user'}...`);
                break;
                
            case 'call-accepted':
                CallManager.handleCallAccepted(data);
                break;
                
            case 'call-accepted-confirm':
                console.log('Call accept confirmed');
                break;
                
            case 'call-rejected':
                CallManager.handleCallRejected(data);
                break;
                
            case 'call-ended':
                CallManager.handleCallEnded(data);
                break;
                
            case 'offer':
                WebRTCManager.handleOffer(data);
                break;
                
            case 'answer':
                WebRTCManager.handleAnswer(data);
                break;
                
            case 'ice-candidate':
                WebRTCManager.handleIceCandidate(data);
                break;
                
            case 'error':
                console.error('Server error:', data.message);
                if (data.message.includes('No pending call')) {
                    CONFIG.isProcessingAnswer = false;
                    UIManager.updateCallButtons();
                }
                break;
                
            default:
                console.warn('Unknown message type:', data.type);
        }
    },
    
    sendToServer(message) {
        if (CONFIG.ws && CONFIG.ws.readyState === WebSocket.OPEN) {
            CONFIG.ws.send(JSON.stringify(message));
            console.log('📤 Sent:', message.type);
        } else {
            console.error('WebSocket not connected');
            UIManager.showStatus('Connection lost');
        }
    }
};

window.WebSocketClient = WebSocketClient;
