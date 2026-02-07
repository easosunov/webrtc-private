// js/main.js
document.addEventListener('DOMContentLoaded', async () => {
    console.log('WebRTC Client Initializing...');
    
    try {
        // 1. Initialize UI
        UIManager.init();
        
        // 2. Load ICE servers (Twilio via Cloudflare Worker)
        await loadIceServers();
        
        // 3. Configure signaling server URL
        configureSignalingUrl();
        
        // 4. Request media permissions
        await AuthManager.checkPermissions();
        
        // 5. Connect to signaling server
        await WebSocketClient.connect();
        
        // 6. Setup global functions
        setupGlobalFunctions();
        
        UIManager.showStatus('Ready to login');
        
    } catch (error) {
        console.error('Initialization failed:', error);
        handleInitializationError(error);
    }
});

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
                CONFIG.peerConfig = {
                    iceServers: iceServers,
                    iceCandidatePoolSize: 10,
                    iceTransportPolicy: 'all'
                };
                CONFIG.iceSource = source.name;
                console.log(`✓ ICE servers from ${source.name}: ${iceServers.length} servers`);
                return;
            }
        } catch (error) {
            console.warn(`${source.name} failed:`, error.message);
            continue;
        }
    }
    
    // Fallback: Public STUN servers
    console.log('Using public STUN fallback');
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
    CONFIG.iceSource = 'public-stun';
}

async function getDirectTwilioServers() {
    // Direct Twilio API call (requires credentials server-side)
    const response = await fetch('/api/twilio-ice', {
        signal: AbortSignal.timeout(5000)
    });
    const data = await response.json();
    return data.iceServers;
}

// ========== SIGNALING SERVER CONFIGURATION ==========
function configureSignalingUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const hostname = window.location.hostname;
    
    // Auto-detect environment and configure accordingly
    if (hostname.includes('github.io')) {
        // GitHub Pages - use cloud signaling
        CONFIG.wsUrl = 'wss://charismatic-hope-production.up.railway.app'; // ← Set this after deployment
        console.log('GitHub Pages environment: Cloud signaling required');
        
        // Dynamic fallback: Try to discover local server
        discoverLocalSignalingServer();
        
    } else if (hostname === 'localhost' || hostname === '127.0.0.1') {
        // Local development
        CONFIG.wsUrl = `ws://${hostname}:8080`;
        console.log('Local development: Using local signaling');
        
    } else if (/^192\.168\.|^10\.|^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)) {
        // Local network IP
        CONFIG.wsUrl = `ws://${hostname}:8080`;
        console.log('Local network: Using direct signaling');
        
    } else {
        // Unknown/other domain - assume HTTPS and cloud signaling
        CONFIG.wsUrl = `wss://${hostname}:8080`;
        console.log('Custom domain: Attempting secure signaling');
    }
}

function discoverLocalSignalingServer() {
    // Attempt to find local server for fallback
    const localIp = localStorage.getItem('localServerIp');
    if (localIp) {
        CONFIG.fallbackWsUrl = `ws://${localIp}:8080`;
        console.log(`Local server fallback: ${CONFIG.fallbackWsUrl}`);
    }
}

// ========== ERROR HANDLING ==========
function handleInitializationError(error) {
    console.error('Startup error:', error);
    
    const errorMsg = error.message || 'Unknown error';
    
    // User-friendly error messages
    const errorMap = {
        'Failed to fetch': 'Network error. Check internet connection.',
        'Permission denied': 'Microphone/camera access required.',
        'AbortError': 'Connection timeout. Server may be offline.'
    };
    
    const friendlyMsg = errorMap[errorMsg] || `Error: ${errorMsg}`;
    UIManager.showError(friendlyMsg);
    
    // Set minimal configuration for recovery
    CONFIG.peerConfig = CONFIG.peerConfig || {
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    };
    
    // Show retry button
    setTimeout(() => {
        if (!CONFIG.ws || CONFIG.ws.readyState !== WebSocket.OPEN) {
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
    
    // Admin call shortcut
    window.callAdmin = function() {
    if (CONFIG.adminSocketId) {
        CallManager.callUser('Administrator', CONFIG.adminSocketId);
		} else {
        UIManager.showError('Administrator is not online');
		}
	};
    
    // Connection management
    window.retryConnection = async function() {
        UIManager.showStatus('Retrying connection...');
        
        if (CONFIG.ws && CONFIG.ws.readyState === WebSocket.OPEN) {
            CONFIG.ws.close();
        }
        
        try {
            await WebSocketClient.connect();
            UIManager.showStatus('Reconnected successfully');
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
    
    // Debug function
    window.debug = function() {
        console.log('=== DEBUG INFO ===');
        console.log('ICE Source:', CONFIG.iceSource);
        console.log('WebSocket:', CONFIG.ws ? CONFIG.ws.readyState : 'Not connected');
        console.log('User:', CONFIG.myUsername || 'Not logged in');
        console.log('In Call:', CONFIG.isInCall);
        console.log('Admin Online:', !!CONFIG.adminSocketId);
        console.log('Connected Users:', CONFIG.connectedUsers.length);
        console.log('==================');
    };
}

// ========== AUTO-RECONNECT ==========
(function setupAutoReconnect() {
    let reconnectAttempts = 0;
    const maxReconnectDelay = 10000; // 10 seconds
    
    function scheduleReconnect() {
        if (CONFIG.isInCall) return; // Don't reconnect during active call
        
        reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(1.5, reconnectAttempts), maxReconnectDelay);
        
        console.log(`Reconnecting in ${delay/1000}s (attempt ${reconnectAttempts})`);
        UIManager.showStatus(`Reconnecting in ${Math.round(delay/1000)}s...`);
        
        setTimeout(async () => {
            try {
                await WebSocketClient.connect();
                reconnectAttempts = 0;
                UIManager.showStatus('Reconnected');
            } catch (error) {
                console.warn('Reconnect failed:', error);
                scheduleReconnect();
            }
        }, delay);
    }
    
    // Monitor WebSocket connection
    setInterval(() => {
        if (CONFIG.ws && CONFIG.ws.readyState === WebSocket.CLOSED) {
            if (reconnectAttempts === 0) {
                scheduleReconnect();
            }
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
        platform: navigator.platform
    };
    
    console.log('Environment:', CONFIG.environment);
})();

window.playVideo = function() {
    console.log('Playing videos...');
    
    if (CONFIG.elements.localVideo) {
        CONFIG.elements.localVideo.play()
            .then(() => console.log('Local video playing'))
            .catch(e => console.log('Local video play error:', e));
    }
    
    if (CONFIG.elements.remoteVideo && CONFIG.elements.remoteVideo.srcObject) {
        CONFIG.elements.remoteVideo.play()
            .then(() => {
                console.log('Remote video playing');
                UIManager.showStatus('Call active - media playing');
            })
            .catch(e => console.log('Remote video play error:', e));
    }
};

// Add to main.js or directly in HTML
document.addEventListener('click', function() {
    if (CONFIG.elements.remoteVideo && CONFIG.elements.remoteVideo.srcObject) {
        CONFIG.elements.remoteVideo.play()
            .then(() => console.log('Video playing after user click'))
            .catch(e => console.log('Play still blocked:', e));
    }
});


let userInteracted = false;

// Global click handler for autoplay
document.addEventListener('click', function() {
    userInteracted = true;
    
    if (CONFIG.elements.remoteVideo && CONFIG.elements.remoteVideo.srcObject) {
        console.log('User clicked, attempting to play remote video...');
        
        const playPromise = CONFIG.elements.remoteVideo.play();
        
        if (playPromise !== undefined) {
            playPromise
                .then(() => {
                    console.log('✅ Remote video playing after user click');
                    UIManager.showStatus('Call active');
                })
                .catch(error => {
                    console.log('❌ Still blocked after click:', error);
                    // Show instruction to user
                    UIManager.showError('Click the play button in video controls');
                });
        }
    }
});



// Export for testing (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        loadIceServers,
        configureSignalingUrl,
        setupGlobalFunctions
    };
}
