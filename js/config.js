// js/config.js - ADD adminInCall property
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
    
    // Admin information
    adminSocketId: null,
    adminUsername: null,
    adminInCall: false,  // ADD THIS - tracks if admin is currently in a call
    isAdmin: false,
    
    // UI elements cache
    elements: {},
    
    // Technical data
    peerConnection: null,
    localStream: null,
    remoteStream: null,
    iceCandidatesQueue: [],
    
    // Media permissions
    hasMediaPermissions: false,
    
    // Processing flags
    isProcessingAnswer: false,
    manualHangupControl: false,
    
    // ICE gathering stats
    iceCandidateGathering: {},
    iceFailureReasons: [],
    
    // Environment
    environment: {},
    
    // Firebase config
    firebaseConfig: null
};

window.CONFIG = CONFIG;
