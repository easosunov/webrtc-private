// js/main.js - FIRESTORE VERSION
document.addEventListener('DOMContentLoaded', async () => {
    console.log('WebRTC Client Initializing with Firestore...');
    
    try {
        // 1. Initialize UI
        UIManager.init();
        
        // 2. Load ICE servers (Twilio via Cloudflare Worker)
        await loadIceServers();
        
        // 3. Configure Firestore (replaces configureSignalingUrl)
        configureFirestore();
        
        // 4. Request media permissions
        await AuthManager.checkPermissions();
        
        // 5. NO AUTO-CONNECT - Firestore connects during login
        
        // 6. Initialize resolution components
        if (window.ResolutionManager) {
            await ResolutionManager.init();
        }
        if (window.ResolutionUI) {
            ResolutionUI.init();
        }
        
        // 7. Initialize camera detection
        if (window.WebRTCManager && WebRTCManager.initCameras) {
            await WebRTCManager.initCameras();
        }
        
        // 8. Setup global functions
        setupGlobalFunctions();
        
        UIManager.showStatus('Ready to login');
        
    } catch (error) {
        console.error('Initialization failed:', error);
        handleInitializationError(error);
    }
});

// ========== FIREBASE/FIRESTORE CONFIGURATION ==========
function configureFirestore() {
    // Firebase configuration - REPLACE WITH YOUR ACTUAL CONFIG
    const firebaseConfig = {
        apiKey: "AIzaSyD9US_D9RfsoKu9K_lVRak7c_0Ht9k-5Ak", // Get from Firebase console
        authDomain: "relay.firebaseapp.com",
        projectId: "relay",
        storageBucket: "relay.appspot.com",
        messagingSenderId: "YOUR_SENDER_ID",
        appId: "YOUR_APP_ID"
    };
    
    CONFIG.firebaseConfig = firebaseConfig;
    console.log('✓ Firestore configured for project:', firebaseConfig.projectId);
}

// ========== ICE SERVER CONFIGURATION ==========
async function loadIceServers() {
    // Priority list of ICE server sources
    const iceSources = [
        {
            name: 'cloudflare-worker',
            url: 'https://turn-token.easosunov.workers.dev/ice',
            timeout: 5000
        },
        {
            name: 'direct-twilio',
            getServers: getDirectTwilioServers,
            timeout: 7000
        }
    ];
    
    for (const source of iceSources) {
        try {
            console.log(`Trying ICE source: ${source.name}`);
            
            let iceServers;
            if (source.url) {
                iceServers = await fetchWithTimeout(source.url, { timeout: source.timeout });
            } else if (source.getServers) {
                iceServers = await source.getServers();
            }
            
            if (iceServers && iceServers.length > 0) {
                // Extract Twilio credentials from the first TURN server
                const turnServer = iceServers.find(s => s.urls?.includes('turn:'));
                const twilioUsername = turnServer?.username;
                const twilioPassword = turnServer?.credential;
                
                // Add regional Twilio TURN servers for better geographic routing
                const regionalTurnServers = [];
                
                if (twilioUsername && twilioPassword) {
                    regionalTurnServers.push(
                        {
                            urls: 'turn:us-east.turn.twilio.com:3478?transport=udp',
                            username: twilioUsername,
                            credential: twilioPassword
                        },
                        {
                            urls: 'turn:us-east.turn.twilio.com:3478?transport=tcp',
                            username: twilioUsername,
                            credential: twilioPassword
                        },
                        {
                            urls: 'turn:us-west.turn.twilio.com:3478?transport=udp',
                            username: twilioUsername,
                            credential: twilioPassword
                        },
                        {
                            urls: 'turn:us-west.turn.twilio.com:3478?transport=tcp',
                            username: twilioUsername,
                            credential: twilioPassword
                        },
                        {
                            urls: 'turn:eu.turn.twilio.com:3478?transport=udp',
                            username: twilioUsername,
                            credential: twilioPassword
                        },
                        {
                            urls: 'turn:eu.turn.twilio.com:3478?transport=tcp',
                            username: twilioUsername,
                            credential: twilioPassword
                        },
                        {
                            urls: 'turn:asia.turn.twilio.com:3478?transport=udp',
                            username: twilioUsername,
                            credential: twilioPassword
                        },
                        {
                            urls: 'turn:asia.turn.twilio.com:3478?transport=tcp',
                            username: twilioUsername,
                            credential: twilioPassword
                        }
                    );
                }
                
                // Start with original servers, add regionals
                const allServers = [...iceServers, ...regionalTurnServers];
                
                CONFIG.peerConfig = {
                    iceServers: allServers,
                    iceCandidatePoolSize: 10,
                    iceTransportPolicy: 'all'
                };
                CONFIG.iceSource = source.name;
                console.log(`✓ ICE servers from ${source.name}: ${iceServers.length} servers + ${regionalTurnServers.length} regional variants`);
                console.log('📡 Using Twilio TURN with regional endpoints for better geographic routing');
                return;
            }
        } catch (error) {
            console.warn(`${source.name} failed:`, error.message);
            continue;
        }
    }
    
    // Fallback: Public STUN servers only
    console.log('Using public STUN fallback only (TURN unavailable)');
    CONFIG.peerConfig = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' }
        ],
        iceCandidatePoolSize: 10
    };
    CONFIG.iceSource = 'public-stun-only';
}

async function getDirectTwilioServers() {
    // Direct Twilio API call (requires credentials server-side)
    const response = await fetch('/api/twilio-ice', {
        signal: AbortSignal.timeout(5000)
    });
    const data = await response.json();
    return data.iceServers;
}

// ========== SIGNALING SERVER CONFIGURATION (REMOVED - REPLACED BY FIRESTORE) ==========
// configureSignalingUrl() function REMOVED - replaced by configureFirestore()

// ========== ERROR HANDLING ==========
function handleInitializationError(error) {
    console.error('Startup error:', error);
    
    const errorMsg = error.message || 'Unknown error';
    
    // User-friendly error messages
    const errorMap = {
        'Failed to fetch': 'Network error. Check internet connection.',
        'Permission denied': 'Microphone/camera access required.',
        'AbortError': 'Connection timeout. Check your connection.'
    };
    
    const friendlyMsg = errorMap[errorMsg] || `Error: ${errorMsg}`;
    UIManager.showError(friendlyMsg);
    
    // Set minimal configuration for recovery
    CONFIG.peerConfig = CONFIG.peerConfig || {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            {
                urls: 'turn:openrelay.metered.ca:443',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            }
        ]
    };
    
    // Show retry button
    setTimeout(() => {
        if (!CONFIG.firebaseInitialized) {
            UIManager.showStatus('Click "Retry Connection" to try again');
        }
    }, 2000);
}

// ========== UTILITY FUNCTIONS ==========
async function fetchWithTimeout(url, options = {}) {
    const { timeout = 5000, ...fetchOptions } = options;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch(url, {
            ...fetchOptions,
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        // Validate response structure
        if (!data.iceServers || !Array.isArray(data.iceServers)) {
            throw new Error('Invalid ICE servers response');
        }
        
        return data.iceServers;
        
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}

// ========== GLOBAL FUNCTIONS ==========
function setupGlobalFunctions() {
    // Core application functions
    window.login = AuthManager.login.bind(AuthManager);
    window.logout = AuthManager.logout.bind(AuthManager);
    window.answerCall = CallManager.answerCall.bind(CallManager);
    window.rejectCall = CallManager.rejectCall.bind(CallManager);
    window.hangup = CallManager.hangup.bind(CallManager);
    window.callUser = CallManager.callUser.bind(CallManager);
    
    window.callSelectedUser = callSelectedUser; // Already defined in index.html
    window.updateAdminDropdown = updateAdminDropdown; // Already defined in index.html
    window.updateAdminButtonStates = updateAdminButtonStates; // Already defined in index.html
    window.handleUserDropdownChange = handleUserDropdownChange; // Already defined in index.html
    
    // Admin call shortcut
    window.callAdmin = function() {
        if (CONFIG.adminSocketId) {
            CallManager.callUser('admin', CONFIG.adminSocketId);
        } else {
            UIManager.showError('Admin is offline');
        }
    };
    
    // Connection management - UPDATED for Firestore
    window.retryConnection = async function() {
        UIManager.showStatus('Retrying connection...');
        
        if (FirestoreClient && FirestoreClient.isInitialized) {
            await FirestoreClient.disconnect();
        }
        
        try {
            // We need username to reconnect - check if user was logged in
            if (CONFIG.myUsername) {
                await FirestoreClient.init(CONFIG.myUsername);
                UIManager.showStatus('Reconnected successfully');
            } else {
                UIManager.showStatus('Ready to login');
            }
        } catch (error) {
            UIManager.showError(`Reconnection failed: ${error.message}`);
        }
    };
    
    // ICE server diagnostic
    window.testIceServers = async function() {
        console.log('Testing ICE servers...');
        console.log('Source:', CONFIG.iceSource);
        console.log('Configuration:', CONFIG.peerConfig);
        
        const pc = new RTCPeerConnection(CONFIG.peerConfig);
        let relayFound = false;
        
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('Candidate:', {
                    type: event.candidate.type,
                    protocol: event.candidate.protocol,
                    address: event.candidate.address
                });
                
                if (event.candidate.candidate.includes('relay')) {
                    relayFound = true;
                    console.log('✓ Relay candidate found (NAT traversal supported)');
                }
            } else {
                console.log('ICE gathering complete');
                if (!relayFound) {
                    console.warn('⚠️ No relay candidates (NAT traversal may fail)');
                }
            }
        };
        
        pc.createDataChannel('test');
        await pc.createOffer();
        await pc.setLocalDescription(pc.localDescription);
        
        setTimeout(() => pc.close(), 3000);
    };
    
    // Camera switching function
    window.switchCamera = async function() {
        if (window.WebRTCManager && WebRTCManager.switchCamera) {
            await WebRTCManager.switchCamera();
        } else {
            console.warn('Camera switching not available');
            UIManager.showError('Camera switching not supported');
        }
    };
    
    // Debug function - UPDATED for Firestore
    window.debug = function() {
        console.log('=== DEBUG INFO ===');
        console.log('ICE Source:', CONFIG.iceSource);
        console.log('Firestore:', FirestoreClient?.isInitialized ? 'Connected' : 'Not connected');
        console.log('User:', CONFIG.myUsername || 'Not logged in');
        console.log('In Call:', CONFIG.isInCall);
        console.log('Admin Online:', !!CONFIG.adminSocketId);
        console.log('Connected Users:', CONFIG.connectedUsers?.length || 0);
        console.log('Has Multiple Cameras:', window.WebRTCManager?.hasMultipleCameras || false);
        console.log('Current Camera:', window.WebRTCManager?.currentFacingMode || 'unknown');
        console.log('ICE Servers:', CONFIG.peerConfig?.iceServers?.length || 0);
        console.log('Firebase Project:', CONFIG.firebaseConfig?.projectId || 'Not configured');
        console.log('==================');
    };
    
    // ========== STATUS MONITORING HOOKS ==========
    // Ensure our monitoring hooks are connected after setup
    window.ensureStatusMonitoring = function() {
        if (typeof testConnectionStatus !== 'undefined') {
            testConnectionStatus();
        }
    };
    
    // Hook into call rejection flow
    const originalRejectCall = window.rejectCall;
    window.rejectCall = function() {
        console.log('=== Global rejectCall() called - stopping monitoring ===');
        if (typeof stopMonitoring !== 'undefined') {
            stopMonitoring();
        }
        if (typeof hideConnectionStatus !== 'undefined') {
            hideConnectionStatus();
        }
        return originalRejectCall();
    };
    
    // Hook into hangup flow
    const originalHangup = window.hangup;
    window.hangup = function() {
        console.log('=== Global hangup() called - stopping monitoring ===');
        if (typeof stopMonitoring !== 'undefined') {
            stopMonitoring();
        }
        if (typeof hideConnectionStatus !== 'undefined') {
            hideConnectionStatus();
        }
        return originalHangup();
    };
}

// ========== AUTO-RECONNECT - UPDATED FOR FIRESTORE ==========
(function setupAutoReconnect() {
    let reconnectAttempts = 0;
    const maxReconnectDelay = 10000; // 10 seconds
    
    function scheduleReconnect() {
        if (CONFIG.isInCall) return; // Don't reconnect during active call
        if (!CONFIG.myUsername) return; // Don't reconnect if not logged in
        
        reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(1.5, reconnectAttempts), maxReconnectDelay);
        
        console.log(`Reconnecting in ${delay/1000}s (attempt ${reconnectAttempts})`);
        UIManager.showStatus(`Reconnecting in ${Math.round(delay/1000)}s...`);
        
        setTimeout(async () => {
            try {
                // Only reconnect if we have a username
                if (CONFIG.myUsername) {
                    await FirestoreClient.init(CONFIG.myUsername);
                    reconnectAttempts = 0;
                    UIManager.showStatus('Reconnected');
                }
            } catch (error) {
                console.warn('Reconnect failed:', error);
                scheduleReconnect();
            }
        }, delay);
    }
    
    // Monitor Firestore connection
    setInterval(() => {
        // Firestore doesn't have a direct "connection state" like WebSocket
        // Instead, we check if we're initialized and if we have a username
        if (CONFIG.myUsername && FirestoreClient && !FirestoreClient.isInitialized) {
            if (reconnectAttempts === 0 && !CONFIG.isInCall) {
                scheduleReconnect();
            }
        } else if (FirestoreClient && FirestoreClient.isInitialized) {
            // Reset reconnect attempts on successful connection
            reconnectAttempts = 0;
        }
    }, 5000);
})();

// ========== ENVIRONMENT DETECTION ==========
(function detectEnvironment() {
    CONFIG.environment = {
        isLocalhost: window.location.hostname === 'localhost',
        isGitHubPages: window.location.hostname.includes('github.io'),
        isSecure: window.location.protocol === 'https:',
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        usingFirestore: true // Flag to indicate we're using Firestore
    };
    
    console.log('Environment:', CONFIG.environment);
})();

// ========== CONNECTION DIAGNOSTIC COMMAND - UPDATED ==========
window.diagnoseConnection = async function() {
    console.log('🔍 Running WebRTC diagnostic...');
    
    const diagnosis = {
        browser: navigator.userAgent,
        webrtcSupported: !!window.RTCPeerConnection,
        iceServers: CONFIG.peerConfig?.iceServers?.length || 0,
        iceCandidateStats: CONFIG.iceCandidateGathering || {},
        failureReasons: CONFIG.iceFailureReasons || [],
        networkType: navigator.connection?.type || 'unknown',
        downlink: navigator.connection?.downlink || 'unknown',
        rtt: navigator.connection?.rtt || 'unknown',
        firestoreInitialized: FirestoreClient?.isInitialized || false,
        firestoreProject: CONFIG.firebaseConfig?.projectId || 'unknown'
    };
    
    console.log('📊 Connection Diagnosis:');
    console.table(diagnosis);
    
    // Test TURN servers explicitly
    if (window.WebRTCManager && WebRTCManager.testTurnServers) {
        await WebRTCManager.testTurnServers();
    }
    
    return diagnosis;
};

// ========== FIRESTORE HEALTH CHECK ==========
window.checkFirestoreHealth = async function() {
    console.log('🔍 Checking Firestore connection...');
    
    if (!FirestoreClient || !FirestoreClient.isInitialized) {
        console.log('❌ Firestore not initialized');
        return { status: 'error', message: 'Not initialized' };
    }
    
    try {
        // Try to write a test message
        const testResult = await FirestoreClient.sendToServer({
            type: 'ping',
            test: true
        });
        
        console.log('✅ Firestore is healthy');
        return { status: 'ok', message: 'Connected' };
    } catch (error) {
        console.error('❌ Firestore error:', error);
        return { status: 'error', message: error.message };
    }
};

// Export for testing (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        loadIceServers,
        configureFirestore,
        setupGlobalFunctions
    };
}
