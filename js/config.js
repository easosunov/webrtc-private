// js/config.js
const CONFIG = {
    // WebSocket connection
    ws: null,
    wsUrl: 'ws://' + window.location.hostname + ':8080',
    
    // User state
    myId: null,
    myUsername: null,
    isAdmin: false,
    adminSocketId: null,
    
    // Call state
    peerConnection: null,
    localStream: null,
    remoteStream: null,
    targetSocketId: null,
    targetUsername: null,
    isInCall: false,
    isInitiator: false,
    iceCandidatesQueue: [],
    incomingCallFrom: null,
    
    // Permission state
    hasMediaPermissions: false,
    isProcessingAnswer: false,
    
    // User list (for admin)
    connectedUsers: [],
    
    // DOM Elements (will be initialized later)
    elements: {}
};

// Export for other modules
window.CONFIG = CONFIG;

// Helper to log state
CONFIG.debug = function() {
    console.log('=== CONFIG STATE ===');
    console.log('User:', this.myUsername, this.myId);
    console.log('Admin:', this.isAdmin, 'Admin socket:', this.adminSocketId);
    console.log('Call:', this.isInCall ? 'Active' : 'Inactive', 
                'Target:', this.targetUsername);
    console.log('WebSocket:', this.ws ? `Connected (${this.ws.readyState})` : 'None');
    console.log('PeerConnection:', this.peerConnection ? 'Exists' : 'None');
    console.log('Media permissions:', this.hasMediaPermissions);
};