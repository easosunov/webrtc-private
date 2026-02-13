// js/ui-manager.js - COMPLETE FIXED VERSION WITH LOGIN SCREEN RESET AND NETWORK INDICATOR
const UIManager = {
    init() {
        console.log('Initializing UI Manager...');
        
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
            
            // NEW: Admin dropdown elements
            userDropdown: document.getElementById('userDropdown'),
            selectedUserDisplay: document.getElementById('selectedUserDisplay'),
            selectedUserName: document.getElementById('selectedUserName'),
            adminCallBtn: document.getElementById('adminCallBtn'),
            adminHangupBtn: document.getElementById('adminHangupBtn'),
            
            // Access code input (if exists)
            accessCodeInput: document.getElementById('hiddenAccessCode'),
            
            // ADDED: Access code display element
            accessCodeDisplay: document.getElementById('accessCodeDisplay'),
            
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
    },
    
    verifyElements() {
        const criticalElements = ['loginDiv', 'callDiv', 'statusEl'];
        const missingElements = [];
        
        for (const elementName of criticalElements) {
            if (!CONFIG.elements[elementName]) {
                missingElements.push(elementName);
                console.error(`Missing element: ${elementName}`);
            }
        }
        
        if (missingElements.length > 0) {
            console.error('Critical UI elements missing:', missingElements);
            this.showError(`UI elements missing: ${missingElements.join(', ')}. Please refresh the page.`);
        }
    },
    
    showStatus(message) {
        console.log('Status:', message);
        if (CONFIG.elements.statusEl) {
            CONFIG.elements.statusEl.textContent = message;
        }
    },
    
    showError(message) {
        console.error('Error:', message);
        alert('Error: ' + message);
    },
    
    updateUsersList(users) {
        // Only admin should update user list
        if (!CONFIG.isAdmin) return;
        
        console.log('Updating admin user dropdown with', users?.length || 0, 'users');
        
        // Call the new dropdown update function (defined in index.html)
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
    
    // ===== MODIFIED: Added login screen reset functionality =====
    showLoginScreen() {
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
    
    // ===== NEW: Reset login screen to clean state =====
    resetLoginScreen() {
        console.log('Resetting login screen');
        
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
        }
        
        // Update call buttons to reflect admin availability
        this.updateCallButtons();
        
        this.showStatus(`Logged in as ${CONFIG.myUsername || 'User'} ${CONFIG.isAdmin ? '(Admin)' : ''}`);
    },
    
    updateVideoElements() {
        if (CONFIG.elements.localVideo && CONFIG.localStream) {
            CONFIG.elements.localVideo.srcObject = CONFIG.localStream;
            CONFIG.elements.localVideo.muted = true;
            CONFIG.elements.localVideo.play().catch(e => console.log('Local video play error:', e));
        }
        
        if (CONFIG.elements.remoteVideo && CONFIG.remoteStream) {
            CONFIG.elements.remoteVideo.srcObject = CONFIG.remoteStream;
            CONFIG.elements.remoteVideo.play().catch(e => console.log('Remote video play error:', e));
        }
    },
    
    // NEW: Update admin status display
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
        } else {
            this.showStatus('Admin is offline - Cannot make calls');
        }
    },

    // ADDED: Network quality indicator - NO COMMA AFTER PREVIOUS FUNCTION
    showNetworkQuality(quality) {
        const indicator = document.getElementById('networkIndicator');
        if (!indicator) return;
        
        let symbol = '📶';
        let color = '#44aa44';
        let title = 'Good connection';
        
        switch(quality) {
            case 'excellent':
                symbol = '📶';
                color = '#44aa44';
                title = 'Excellent connection';
                break;
            case 'good':
                symbol = '📶';
                color = '#88cc44';
                title = 'Good connection';
                break;
            case 'fair':
                symbol = '📶';
                color = '#ffaa44';
                title = 'Fair connection';
                break;
            case 'poor':
                symbol = '📶';
                color = '#ff7744';
                title = 'Poor connection';
                break;
            case 'disconnected':
                symbol = '❌';
                color = '#ff4444';
                title = 'Disconnected';
                break;
            default:
                symbol = '📶';
                color = '#999';
                title = 'Unknown';
        }
        
        indicator.textContent = symbol;
        indicator.style.color = color;
        indicator.title = title;
    }
};

window.UIManager = UIManager;
