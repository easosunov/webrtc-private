// js/ui-manager.js - COMPLETE WITH ADMIN CALL STATE TRACKING
const UIManager = {
    init() {
        console.log('Initializing UI Manager...');
        DebugConsole?.info('UI', 'Initializing UI Manager');
        
        CONFIG.elements = {
            loginDiv: document.getElementById('login'),
            callDiv: document.getElementById('call'),
            
            userView: document.getElementById('userView'),
            adminView: document.getElementById('adminView'),
            
            localVideo: document.getElementById('localVideo'),
            remoteVideo: document.getElementById('remoteVideo'),
            
            statusEl: document.getElementById('status'),
            
            userList: document.getElementById('userList'),
            
            userDropdown: document.getElementById('userDropdown'),
            selectedUserDisplay: document.getElementById('selectedUserDisplay'),
            selectedUserName: document.getElementById('selectedUserName'),
            adminCallBtn: document.getElementById('adminCallBtn'),
            adminHangupBtn: document.getElementById('adminHangupBtn'),
            
            accessCodeInput: document.getElementById('hiddenAccessCode'),
            
            accessCodeDisplay: document.getElementById('accessCodeDisplay'),
            
            networkIndicator: document.getElementById('networkIndicator'),
            
            callAdminBtn: document.querySelector('.btn-call'),
            hangupBtn: document.querySelector('.btn-hangup'),
            
            incomingCallModal: document.getElementById('incomingCallModal'),
            incomingCallFrom: document.getElementById('incomingCallFrom'),
            answerBtn: document.getElementById('answerBtn'),
            rejectBtn: document.getElementById('rejectBtn'),
            
            callAudio: document.getElementById('callAudio')
        };
        
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
        if (!CONFIG.isAdmin) return;
        
        console.log('Updating admin user dropdown with', users?.length || 0, 'users');
        DebugConsole?.info('Users', `Received list of ${users?.length || 0} available users`);
        
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
                // Admin is available ONLY if:
                // 1. Admin socket ID exists (logged in)
                // 2. Admin is NOT in a call
                // 3. User is not in a call
                // 4. Not processing an answer
                // 5. Not in cooldown period
                const adminAvailable = CONFIG.adminSocketId && 
                                       !CONFIG.adminInCall && 
                                       !CONFIG.isInCall && 
                                       !CONFIG.isProcessingAnswer &&
                                       !(window.CallManager && CallManager.callCooldown);
                
                callBtn.disabled = !adminAvailable;
                callBtn.className = adminAvailable ? 'btn-call active' : 'btn-call';
                
                // Update button text and title based on admin availability
                if (!CONFIG.adminSocketId) {
                    callBtn.textContent = 'Admin Offline';
                    callBtn.title = 'Admin is offline';
                } else if (CONFIG.adminInCall) {
                    callBtn.textContent = 'Admin in Call';
                    callBtn.title = 'Admin is currently in a call';
                } else if (window.CallManager && CallManager.callCooldown) {
                    callBtn.textContent = 'Wait...';
                    callBtn.title = 'Please wait before calling again';
                } else {
                    callBtn.textContent = 'Call Admin';
                    callBtn.title = 'Call Administrator';
                }
            }
            
            // Hangup button logic
            if (hangupBtn && !CONFIG.manualHangupControl) {
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
        
        this.resetLoginScreen();
        
        this.showStatus('Please login');
    },
    
    resetLoginScreen() {
        console.log('Resetting login screen');
        DebugConsole?.info('UI', 'Resetting login screen');
        
        if (typeof accessCode !== 'undefined') {
            accessCode = '';
        }
        
        if (CONFIG.elements.accessCodeDisplay) {
            CONFIG.elements.accessCodeDisplay.textContent = 'Enter Code';
            CONFIG.elements.accessCodeDisplay.style.color = '#999';
        }
        
        if (CONFIG.elements.accessCodeInput) {
            CONFIG.elements.accessCodeInput.value = '';
        }
        
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
            const heading = document.querySelector('h2');
            if (heading) heading.textContent = 'WebRTC - ' + (CONFIG.myUsername || 'User');
            DebugConsole?.info('UI', `User view activated for ${CONFIG.myUsername}`);
        }
        
        this.updateCallButtons();
        
        this.showStatus(`Logged in as ${CONFIG.myUsername || 'User'} ${CONFIG.isAdmin ? '(Admin)' : ''}`);
        
        const networkIndicators = document.querySelectorAll('#networkIndicator, #webrtcIndicator');
        networkIndicators.forEach(el => {
            if (el) {
                el.style.display = 'inline-block';
                el.style.visibility = 'visible';
            }
        });
    },
    
    updateVideoElements() {
        if (CONFIG.elements.localVideo && CONFIG.localStream) {
            CONFIG.elements.localVideo.srcObject = CONFIG.localStream;
            CONFIG.elements.localVideo.muted = true;
            
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
    
    updateCameraIndicator(facingMode) {
        const indicator = document.getElementById('cameraIndicator');
        if (!indicator) {
            const newIndicator = document.createElement('div');
            newIndicator.id = 'cameraIndicator';
            newIndicator.style.cssText = `
                position: fixed;
                bottom: 10px;
                left: 10px;
                font-size: 20px;
                z-index: 10000;
                opacity: 0.7;
                background: rgba(0,0,0,0.5);
                color: white;
                padding: 4px 10px;
                border-radius: 20px;
                pointer-events: none;
            `;
            document.body.appendChild(newIndicator);
        }
        
        const camIndicator = document.getElementById('cameraIndicator');
        if (camIndicator) {
            camIndicator.innerHTML = facingMode === 'user' ? '🤳 Front' : '📷 Rear';
            camIndicator.style.display = CONFIG.localStream ? 'block' : 'none';
        }
    },
    
    updateAdminStatus(isOnline) {
        if (CONFIG.isAdmin) return;
        
        const statusText = document.querySelector('.admin-status-text');
        if (statusText) {
            statusText.textContent = isOnline ? '🟢 Admin Online' : '🔴 Admin Offline';
            statusText.style.color = isOnline ? '#4CAF50' : '#f44336';
        }
        
        if (isOnline) {
            this.showStatus('Admin is online - Ready to call');
            DebugConsole?.success('Admin', 'Admin is online');
        } else {
            this.showStatus('Admin is offline - Cannot make calls');
            DebugConsole?.warning('Admin', 'Admin is offline');
        }
    },
    
    forceHangupButtonReset() {
        console.log('Force resetting hangup button');
        
        if (CONFIG.isAdmin) {
            const adminHangupBtn = document.getElementById('adminHangupBtn');
            if (adminHangupBtn) {
                adminHangupBtn.disabled = true;
                adminHangupBtn.className = 'btn-hangup';
            }
            
            const adminCallBtn = document.getElementById('adminCallBtn');
            if (adminCallBtn) {
                adminCallBtn.disabled = false;
                adminCallBtn.className = 'btn-call active';
            }
        } else {
            const userHangupBtn = document.querySelector('.btn-hangup');
            if (userHangupBtn) {
                userHangupBtn.disabled = true;
                userHangupBtn.className = 'btn-hangup';
            }
            
            const userCallBtn = document.querySelector('.btn-call');
            if (userCallBtn) {
                userCallBtn.disabled = false;
                userCallBtn.className = 'btn-call active';
            }
        }
    },
    
    // ===== Display real network metrics - CLEAN AND SIMPLE =====
    showNetworkMetrics(metrics) {
        const indicator = CONFIG.elements.networkIndicator;
        if (!indicator) return;
        
        // Just show the latency in milliseconds - clean and simple
        indicator.innerHTML = `${metrics.latency}ms`;
        
        // Plain text styling - no colors, no symbols
        indicator.style.color = '#333333';
        indicator.style.backgroundColor = '#f5f5f5';
        indicator.style.fontWeight = 'normal';
        indicator.style.opacity = '0.9';
        
        // Simple tooltip with all metrics for reference when hovering
        indicator.title = `Latency: ${metrics.latency}ms | Jitter: ${metrics.jitter}ms | Loss: ${metrics.packetLoss}% | Bandwidth: ${metrics.bandwidth}Mbps`;
    },
    
    // ===== Display WebRTC connection status - CLEAN AND SIMPLE =====
    updateWebRTCIndicator(state, rtt = 0) {
        const indicator = document.getElementById('webrtcIndicator');
        if (!indicator) return;
        
        let text = '';
        let tooltip = '';
        
        switch (state) {
            case 'connected':
                text = rtt ? `${rtt}ms` : 'connected';
                tooltip = rtt ? `Round-trip time: ${rtt}ms` : 'WebRTC connected';
                break;
            case 'connecting':
                text = 'connecting';
                tooltip = 'WebRTC connecting...';
                break;
            case 'connected-no-rtt':
                text = 'connected';
                tooltip = 'WebRTC connected';
                break;
            case 'disconnected':
                text = 'disconnected';
                tooltip = 'WebRTC disconnected';
                break;
            case 'failed':
                text = 'failed';
                tooltip = 'WebRTC connection failed';
                break;
            case 'closed':
                text = 'closed';
                tooltip = 'WebRTC connection closed';
                break;
            default:
                text = 'standby';
                tooltip = 'No active call';
        }
        
        indicator.innerHTML = text;
        indicator.style.color = '#333333';
        indicator.style.backgroundColor = '#f5f5f5';
        indicator.style.fontWeight = 'normal';
        indicator.style.opacity = '0.9';
        indicator.title = tooltip;
    }
};

window.UIManager = UIManager;
