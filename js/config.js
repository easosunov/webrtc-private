// js/config.js - Global configuration with all required properties
const CONFIG = {
    // Connection settings
    wsUrl: null,  // No longer used but kept for compatibility
    peerConfig: null,
    
    // User information
    myId: null,
    myUsername: null,
    mySocketId: null,
    
    // Call state
    isInCall: false,
    isInitiator: false,
    targetSocketId: null,
    targetUsername: null,
    isCallActive: false,
    isProcessingAnswer: false,
    
    // Admin information
    adminSocketId: null,
    adminUsername: null,
    adminInCall: false,  // Tracks if admin is currently in a call
    isAdmin: false,
    
    // UI elements cache
    elements: {},
    
    // Technical data
    peerConnection: null,
    localStream: null,
    remoteStream: null,
    iceCandidatesQueue: [],  // IMPORTANT: Must be initialized as empty array
    
    // Media permissions
    hasMediaPermissions: false,
    
    // Processing flags
    manualHangupControl: false,
    
    // ICE gathering stats
    iceCandidateGathering: {},
    iceFailureReasons: [],
    iceStartTime: null,
    
    // Environment
    environment: {},
    
    // Firebase config
    firebaseConfig: null,
    
    // Connected users list
    connectedUsers: []
};

window.CONFIG = CONFIG;
