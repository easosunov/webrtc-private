// js/main.js
// Main entry point - initializes all modules

console.log('WebRTC Client Initializing...');

// Initialize CONFIG object first
window.CONFIG = window.CONFIG || {
    // Core state
    myUsername: null,
    mySocketId: null,
    isAdmin: false,
    isInCall: false,
    isCaller: false,
    
    // WebRTC
    peerConnection: null,
    localStream: null,
    remoteStream: null,
    targetSocketId: null,
    incomingCallFrom: null,
    
    // Media
    hasMediaPermissions: false,
    needsUserInteraction: false,
    
    // ICE
    iceCandidatesQueue: [],
    
    // UI elements
    elements: {
        username: null,
        password: null,
        status: null,
        localVideo: null,
        remoteVideo: null,
        loginDiv: null,
        callDiv: null,
        userList: null
    }
};

// Initialize modules
function initializeApp() {
    console.log('Environment:', {
        isLocalhost: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1',
        isGitHubPages: window.location.hostname.includes('github.io'),
        isSecure: window.location.protocol === 'https:',
        userAgent: navigator.userAgent,
        platform: navigator.platform
    });
    
    // Initialize UI elements
    CONFIG.elements = {
        username: document.getElementById('username'),
        password: document.getElementById('password'),
        status: document.getElementById('status'),
        localVideo: document.getElementById('localVideo'),
        remoteVideo: document.getElementById('remoteVideo'),
        loginDiv: document.getElementById('login'),
        callDiv: document.getElementById('call'),
        userList: document.getElementById('userList')
    };
    
    // Initialize UI Manager
    UIManager.init();
    
    // Try different ICE sources
    getIceServers();
    
    console.log('App initialized');
}

// ICE server configuration
async function getIceServers() {
    console.log('Trying ICE source: cloudflare-worker');
    
    try {
        // Primary: Cloudflare Worker (Twilio)
        const response = await fetch('https://turn-token.easosunov.workers.dev/ice');
        const data = await response.json();
        
        if (data.iceServers && data.iceServers.length > 0) {
            CONFIG.peerConfig = {
                iceServers: data.iceServers,
                iceCandidatePoolSize: 10,
                sdpSemantics: 'unified-plan',
                bundlePolicy: 'max-bundle',
                rtcpMuxPolicy: 'require'
            };
            console.log('✓ ICE servers from cloudflare-worker:', data.iceServers.length, 'servers');
            return;
        }
    } catch (error) {
        console.log('Cloudflare Worker failed:', error.message);
    }
    
    // Fallback: Public STUN servers
    console.log('Using fallback STUN servers');
    CONFIG.peerConfig = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' }
        ],
        iceCandidatePoolSize: 10,
        sdpSemantics: 'unified-plan',
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require'
    };
}

// GitHub Pages specific setup
if (window.location.hostname.includes('github.io')) {
    console.log('GitHub Pages environment: Cloud signaling required');
    // WebSocket URL is set in websocket-client.js
}

// Global functions for UI buttons
function login() {
    AuthManager.login();
}

function logout() {
    AuthManager.logout();
}

function callAdmin() {
    CallManager.callAdmin();
}

function hangup() {
    CallManager.hangup();
}

function debug() {
    console.log('=== DEBUG INFO ===');
    console.log('CONFIG:', CONFIG);
    console.log('WebSocket:', WebSocketClient && WebSocketClient.socket ? 'Connected' : 'Disconnected');
    console.log('Peer Connection:', CONFIG.peerConnection ? CONFIG.peerConnection.connectionState : 'None');
    
    if (CONFIG.localStream) {
        const tracks = CONFIG.localStream.getTracks();
        console.log('Local tracks:', tracks.map(t => `${t.kind}:${t.enabled ? 'on' : 'off'}`));
    }
    
    if (CONFIG.remoteStream) {
        const tracks = CONFIG.remoteStream.getTracks();
        console.log('Remote tracks:', tracks.map(t => `${t.kind}:${t.enabled ? 'on' : 'off'}`));
    }
    
    if (window.WebRTCManager && typeof WebRTCManager.checkAudioState === 'function') {
        WebRTCManager.checkAudioState();
    }
}

// OLD playVideo function - updated to use new autoplay system
function playVideo() {
    console.log('playVideo called - forwarding to WebRTCManager');
    if (window.WebRTCManager && typeof WebRTCManager.handleUserInteraction === 'function') {
        WebRTCManager.handleUserInteraction();
    } else {
        console.warn('WebRTCManager.handleUserInteraction not available');
        UIManager.showStatus('Autoplay handler not ready');
    }
}

// Handle Chrome autoplay policy - global click listener
// This allows user to click anywhere to start audio if blocked
document.addEventListener('click', function() {
    if (window.WebRTCManager && typeof WebRTCManager.handleUserInteraction === 'function') {
        WebRTCManager.handleUserInteraction();
    }
});

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

// Make functions globally available
window.login = login;
window.logout = logout;
window.callAdmin = callAdmin;
window.hangup = hangup;
window.debug = debug;
window.playVideo = playVideo;
