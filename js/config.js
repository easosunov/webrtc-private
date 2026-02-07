// js/config.js - COMPLETE WORKING VERSION
const CONFIG = {
    // WebSocket connection
    ws: null,
    wsUrl: 'ws://' + window.location.hostname + ':8081/ws',
    
    // User state
    myId: null,                    // Same as mySocketId for compatibility
    myUsername: null,              // KEEP THIS - used by main.js
    isAdmin: false,
    adminSocketId: null,
    
    // Socket ID alias for compatibility with main.js
    mySocketId: null,              // ADD THIS - main.js expects this
    
    // Call state
    peerConnection: null,
    localStream: null,
    remoteStream: null,
    targetSocketId: null,
    targetUsername: null,
    isInCall: false,
    isInitiator: false,
    isCaller: false,               // ADD THIS - main.js expects this
    iceCandidatesQueue: [],
    incomingCallFrom: null,
    isProcessingAnswer: false,
    
    // Permission state
    hasMediaPermissions: false,
    
    // Autoplay support (NEW)
    needsUserInteraction: false,   // ADD THIS - for Chrome autoplay
    
    // User list (for admin)
    connectedUsers: [],
    
    // DOM Elements (will be initialized later)
    elements: {}
};

// Create alias for backward compatibility
Object.defineProperty(CONFIG, 'mySocketId', {
    get: function() { return this.myId; },
    set: function(value) { this.myId = value; },
    enumerable: true,
    configurable: true
});

// Export for other modules
window.CONFIG = CONFIG;

// Helper to log state
CONFIG.debug = function() {
    console.log('=== CONFIG STATE ===');
    console.log('User:', this.myUsername, 'ID:', this.myId);
    console.log('Admin:', this.isAdmin, 'Admin socket:', this.adminSocketId);
    console.log('Call:', this.isInCall ? 'Active' : 'Inactive', 
                'Target:', this.targetUsername);
    console.log('WebSocket:', this.ws ? `Connected (${this.ws.readyState})` : 'None');
    console.log('PeerConnection:', this.peerConnection ? 'Exists' : 'None');
    console.log('Media permissions:', this.hasMediaPermissions);
    console.log('Autoplay needed:', this.needsUserInteraction);
};
