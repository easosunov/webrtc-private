// js/ui-manager.js - COMPLETE FIXED VERSION WITH NETWORK METRICS DISPLAY AND DEBUG LOGGING
const UIManager = {
    init() {
        console.log('Initializing UI Manager...');
        DebugConsole?.info('UI', 'Initializing UI Manager');
        
        // Store ALL DOM elements needed by the application
        CONFIG.elements = {
            // Main layout elements
            loginDiv: document.getElementById('login'),
            callDiv: document.getElementById('call'),
            
            // View elements
            userView: document.getElementById('userView'),
            adminView: document.getElementById('adminView'),
            
            // Video elements
            localVideo: document.getElementById('localVideo'),
            remoteVideo: document.getElementById('remoteVideo'),
            
            // Status element
            statusEl: document.getElementById('status'),
            
            // User list element
            userList: document.getElementById('userList'),
            
            // Admin dropdown elements
            userDropdown: document.getElementById('userDropdown'),
            selectedUserDisplay: document.getElementById('selectedUserDisplay'),
            selectedUserName: document.getElementById('selectedUserName'),
            adminCallBtn: document.getElementById('adminCallBtn'),
            adminHangupBtn: document.getElementById('adminHangupBtn'),
            
            // Access code input (if exists)
            accessCodeInput: document.getElementById('hiddenAccessCode'),
            
            // Access code display element
            accessCodeDisplay: document.getElementById('accessCodeDisplay'),
            
            // Network indicator element
            networkIndicator: document.getElementById('networkIndicator'),
            
            // Call control buttons
            callAdminBtn: document.querySelector('.btn-call'),
            hangupBtn: document.querySelector('.btn-hangup'),
            
            // Incoming call modal elements
            incomingCallModal: document.getElementById('incomingCallModal'),
            incomingCallFrom: document.getElementById('incomingCallFrom'),
            answerBtn: document.getElementById('answerBtn'),
            rejectBtn: document.getElementById('rejectBtn'),
            
            // Audio element
            callAudio: document.getElementById('callAudio')
        };
        
        // Verify critical elements exist
        this.verifyElements();
        
        console.log('UI Manager initialized with', Object.keys(CONFIG.elements).length, 'elements');
        DebugConsole?.success('UI', `Initialized with ${Object.keys(CONFIG.elements).length} elements`);
    },
    
    verifyElements() {
        const criticalElements = ['loginDiv', 'callDiv', 'statusEl'];
        const missingElements = [];
        
        for (const elementName of criticalElements) {
            if (!CONFIG.elements[elementName]) {
                missingElements.push(elementName);
                console.error(`Missing element: ${elementName}`);
                DebugConsole?.error('UI', `Missing critical element: ${elementName}`);
            }
        }
        
        if (missingElements.length > 0) {
            console.error('Critical UI elements missing:', missingElements);
            this.showError(`UI elements missing: ${missingElements.join(', ')}. Please refresh the page.`);
            DebugConsole?.error('UI', `Critical elements missing: ${missingElements.join(', ')}`);
        }
    },
    
    showStatus(message) {
        console.log('Status:', message);
        DebugConsole?.info('Status', message);
        if (CONFIG.elements.statusEl) {
            CONFIG.elements.statusEl.textContent = message;
        }
    },
    
    showError(message) {
        console.error('Error:', message);
        DebugConsole?.error('Error', message);
        alert('Error: ' + message);
    },
    
    updateUsersList(users) {
        // Only admin should update user list
        if (!CONFIG.isAdmin) return;
        
        console.log('Updating admin user dropdown with', users?.length || 0, 'users');
        DebugConsole?.info('Users', `Received list of ${users?.length || 0} available users`);
        
        // Call the dropdown update function (defined in index.html)
        if (typeof window.updateAdminDropdown === 'function') {
            window.updateAdminDropdown(users);
        }
        
        this.updateCallButtons();
    },
    
    updateCallButtons() {
        // For user view (regular users calling admin)
        if (!CONFIG.isAdmin) {
            const callBtn = document.querySelector('.btn-call');
            const hangupBtn = document.querySelector('.btn-hangup');
            
            if (callBtn) {
                const adminAvailable = CONFIG.adminSocketId && !CONFIG.isInCall && !CONFIG.isProcessingAnswer;
                callBtn.disabled = !adminAvailable;
                callBtn.className = adminAvailable ? 'btn-call active' : 'btn-call';
                
                // Update button text based on admin availability
                if (!adminAvailable) {
                    callBtn.title = 'Admin is offline';
                } else {
                    callBtn.title = 'Call Administrator';
                }
            }
            
            if (hangupBtn) {
                hangupBtn.disabled = !CONFIG.isInCall;
                hangupBtn.className = CONFIG.isInCall ? 'btn-hangup active' : 'btn-hangup';
            }
        }
        
        // For admin view - update admin buttons
        if (CONFIG.isAdmin && typeof window.updateAdminButtonStates === 'function') {
            window.updateAdminButtonStates();
        }
    },
    
    showLoginScreen() {
        DebugConsole?.info('UI', 'Showing login screen');
        if (CONFIG.elements.loginDiv) {
            CONFIG.elements.loginDiv.style.display = 'block';
        }
        if (CONFIG.elements.callDiv) {
            CONFIG.elements.callDiv.style.display = 'none';
        }
        
        // Reset the login screen to pristine state
        this.resetLoginScreen();
        
        this.showStatus('Please login');
    },
    
    resetLoginScreen() {
        console.log('Resetting login screen');
        DebugConsole?.info('UI', 'Resetting login screen');
        
        // Reset the global accessCode variable (defined in index.html)
        if (typeof accessCode !== 'undefined') {
            accessCode = '';
        }
        
        // Reset the access code display
        if (CONFIG.elements.accessCodeDisplay) {
            CONFIG.elements.accessCodeDisplay.textContent = 'Enter Code';
            CONFIG.elements.accessCodeDisplay.style.color = '#999';
        }
        
        // Reset hidden input
        if (CONFIG.elements.accessCodeInput) {
            CONFIG.elements.accessCodeInput.value = '';
        }
        
        // Focus the hidden input for next user
        setTimeout(() => {
            if (CONFIG.elements.accessCodeInput) {
                CONFIG.elements.accessCodeInput.focus();
            }
        }, 100);
    },
    
    showCallScreen() {
        DebugConsole?.info('UI', 'Showing call screen');
        if (CONFIG.elements.loginDiv) {
            CONFIG.elements.loginDiv.style.display = 'none';
        }
        if (CONFIG.elements.callDiv) {
            CONFIG.elements.callDiv.style.display = 'block';
        }
        
        if (CONFIG.isAdmin) {
            if (CONFIG.elements.userView) {
                CONFIG.elements.userView.style.display = 'none';
            }
            if (CONFIG.elements.adminView) {
                CONFIG.elements.adminView.style.display = 'block';
            }
            // Update heading
            const heading = document.querySelector('h2');
            if (heading) heading.textContent = 'WebRTC - Administrator';
            DebugConsole?.info('UI', 'Admin view activated');
        } else {
            if (CONFIG.elements.userView) {
                CONFIG.elements.userView.style.display = 'block';
            }
            if (CONFIG.elements.adminView) {
                CONFIG.elements.adminView.style.display = 'none';
            }
            // Update heading
            const heading = document.querySelector('h2');
            if (heading) heading.textContent = 'WebRTC - ' + (CONFIG.myUsername || 'User');
            DebugConsole?.info('UI', `User view activated for ${CONFIG.myUsername}`);
        }
        
        // Update call buttons to reflect admin availability
        this.updateCallButtons();
        
        this.showStatus(`Logged in as ${CONFIG.myUsername || 'User'} ${CONFIG.isAdmin ? '(Admin)' : ''}`);
    },
    
    updateVideoElements() {
        if (CONFIG.elements.localVideo && CONFIG.localStream) {
            CONFIG.elements.localVideo.srcObject = CONFIG.localStream;
            CONFIG.elements.localVideo.muted = true;
            
            // Handle play() promise properly
            const playPromise = CONFIG.elements.localVideo.play();
            if (playPromise !== undefined) {
                playPromise
                    .then(() => DebugConsole?.success('Video', 'Local video playing'))
                    .catch(e => {
                        console.log('Local video play error:', e);
                        DebugConsole?.warning('Video', 'Local video play prevented: ' + e.message);
                    });
            }
        }
        
        if (CONFIG.elements.remoteVideo && CONFIG.remoteStream) {
            CONFIG.elements.remoteVideo.srcObject = CONFIG.remoteStream;
            
            // Handle play() promise properly
            const playPromise = CONFIG.elements.remoteVideo.play();
            if (playPromise !== undefined) {
                playPromise
                    .then(() => DebugConsole?.success('Video', 'Remote video playing'))
                    .catch(e => {
                        console.log('Remote video play error:', e);
                        DebugConsole?.warning('Video', 'Remote video play prevented: ' + e.message);
                    });
            }
        }
    },
    
    updateAdminStatus(isOnline) {
        if (CONFIG.isAdmin) return; // Don't show for admin
        
        const statusText = document.querySelector('.admin-status-text');
        if (statusText) {
            statusText.textContent = isOnline ? '🟢 Admin Online' : '🔴 Admin Offline';
            statusText.style.color = isOnline ? '#4CAF50' : '#f44336';
        }
        
        // Also update status in main status area
        if (isOnline) {
            this.showStatus('Admin is online - Ready to call');
            DebugConsole?.success('Admin', 'Admin is online');
        } else {
            this.showStatus('Admin is offline - Cannot make calls');
            DebugConsole?.warning('Admin', 'Admin is offline');
        }
    },
    
    // ===== Display real network metrics =====
    showNetworkMetrics(metrics) {
        const indicator = CONFIG.elements.networkIndicator;
        if (!indicator) return;
        
        // Create a detailed tooltip
        const tooltip = `Latency: ${metrics.latency}ms
Jitter: ${metrics.jitter}ms
Packet Loss: ${metrics.packetLoss}%
Bandwidth: ${metrics.bandwidth} Mbps
Reliability: ${metrics.reliability}%`;
        
        // Choose color based on reliability
        let color;
        if (metrics.reliability > 80) color = '#44aa44';
        else if (metrics.reliability > 60) color = '#88cc44';
        else if (metrics.reliability > 40) color = '#ffaa44';
        else if (metrics.reliability > 20) color = '#ff7744';
        else color = '#ff4444';
        
        // Choose symbol based on connection type
        let symbol = '📶';
        if (metrics.bandwidth >= 50) symbol = '🚀'; // Fiber
        else if (metrics.bandwidth >= 25) symbol = '📡'; // Fast broadband
        else if (metrics.bandwidth >= 10) symbol = '📶'; // Standard broadband
        else if (metrics.bandwidth >= 5) symbol = '📱'; // Mobile 4G
        else symbol = '🐢'; // Slow connection
        
        // Display
        indicator.innerHTML = `${symbol} ${metrics.latency}ms`;
        indicator.style.color = color;
        indicator.title = tooltip;
        
        // Also log to console occasionally for debugging
        if (metrics.latency > 400) {
            console.warn('⚠️ High latency detected:', metrics.latency, 'ms');
            DebugConsole?.warning('Network', `High latency: ${metrics.latency}ms`);
        }
        if (metrics.packetLoss > 10) {
            console.warn('⚠️ Packet loss detected:', metrics.packetLoss, '%');
            DebugConsole?.warning('Network', `Packet loss: ${metrics.packetLoss}%`);
        }
        
        // Log network metrics periodically
        if (Math.random() < 0.1) { // ~10% chance to log
            DebugConsole?.network('Network', `Latency: ${metrics.latency}ms, Jitter: ${metrics.jitter}ms, Loss: ${metrics.packetLoss}%, BW: ${metrics.bandwidth}Mbps`);
        }
    }
};

window.UIManager = UIManager;
