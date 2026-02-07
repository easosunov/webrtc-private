// js/ui-manager.js - COMPLETE VERSION with Resolution Controls
const UIManager = {
    init() {
        // Store DOM elements
        CONFIG.elements = {
            loginDiv: document.getElementById('login'),
            callDiv: document.getElementById('call'),
            userView: document.getElementById('userView'),
            adminView: document.getElementById('adminView'),
            userList: document.getElementById('userList'),
            localVideo: document.getElementById('localVideo'),
            remoteVideo: document.getElementById('remoteVideo'),
            statusEl: document.getElementById('status'),
            // Use hidden input for access code
            accessCodeInput: document.getElementById('hiddenAccessCode'),
            // NEW: Resolution controls
            resolutionControls: document.getElementById('resolutionControls'),
            resolutionSelect: document.getElementById('resolutionSelect'),
            applyResolutionBtn: document.getElementById('applyResolution')
        };
        
        // Initialize admin status to offline
        CONFIG.adminSocketId = null;
        
        // NEW: Initialize resolution settings
        CONFIG.currentResolution = 'medium'; // Track current resolution
        CONFIG.videoEnabled = true;
        
        // NEW: Setup resolution control event listeners
        this.setupResolutionControls();
        
        console.log('UI Manager initialized');
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
        // Only admin should see user list
        if (!CONFIG.isAdmin) return;
        
        // If userList element doesn't exist yet, create it or wait
        if (!CONFIG.elements.userList) {
            console.warn('userList element not found, attempting to find it');
            // Try to find the element again
            CONFIG.elements.userList = document.getElementById('userList');
            if (!CONFIG.elements.userList) {
                console.warn('Still cannot find userList element, will retry in 100ms');
                setTimeout(() => this.updateUsersList(users), 100);
                return;
            }
        }
        
        const userList = CONFIG.elements.userList;
        userList.innerHTML = '';
        
        if (!users || users.length === 0) {
            userList.innerHTML = '<div class="user-line"><span class="username">No users online</span></div>';
            return;
        }
        
        users.forEach(user => {
            if (user.id === CONFIG.myId) return;
            
            const div = document.createElement('div');
            div.className = 'user-line';
            div.innerHTML = `
                <span class="username">${user.username} ${user.isAdmin ? '(Admin)' : ''}</span>
                <button class="btn-call" onclick="callUser('${user.username}', '${user.socketId}')">Call</button>
                <button class="btn-hangup" onclick="hangup()" disabled>Hang Up</button>
            `;
            userList.appendChild(div);
        });
        
        this.updateCallButtons();
    },
    
    updateCallButtons() {
        // For user view (non-admin)
        if (!CONFIG.isAdmin) {
            const callBtn = document.querySelector('.btn-call');
            const hangupBtn = document.querySelector('.btn-hangup');
            
            if (callBtn) {
                // FIXED: Check if adminSocketId is null (admin offline)
                const isAdminAvailable = CONFIG.adminSocketId && 
                                        !CONFIG.isInCall && 
                                        !CONFIG.isProcessingAnswer;
                
                callBtn.disabled = !isAdminAvailable;
                
                // FIXED: Update button text based on admin availability
                if (!CONFIG.adminSocketId) {
                    callBtn.textContent = 'Admin Offline';
                    callBtn.className = 'btn-call disabled';
                } else if (CONFIG.isInCall) {
                    callBtn.textContent = 'In Call';
                    callBtn.className = 'btn-call disabled';
                } else if (CONFIG.isProcessingAnswer) {
                    callBtn.textContent = 'Processing...';
                    callBtn.className = 'btn-call disabled';
                } else {
                    callBtn.textContent = 'Call Admin';
                    callBtn.className = 'btn-call active';
                }
            }
            
            if (hangupBtn) {
                hangupBtn.disabled = !CONFIG.isInCall;
                hangupBtn.className = CONFIG.isInCall ? 'btn-hangup active' : 'btn-hangup';
            }
        }
        
        // For admin view
        if (CONFIG.isAdmin && CONFIG.elements.userList) {
            const userLines = CONFIG.elements.userList.querySelectorAll('.user-line');
            userLines.forEach(line => {
                const hangupBtn = line.querySelector('.btn-hangup');
                if (hangupBtn) {
                    hangupBtn.disabled = !CONFIG.isInCall;
                    hangupBtn.className = CONFIG.isInCall ? 'btn-hangup active' : 'btn-hangup';
                }
            });
        }
    },
    
    // NEW: Setup resolution controls
    setupResolutionControls() {
        // Auto-apply when selection changes
        if (CONFIG.elements.resolutionSelect) {
            CONFIG.elements.resolutionSelect.addEventListener('change', async (e) => {
                await this.changeVideoResolution();
            });
        }
        
        // Keep apply button as backup
        if (CONFIG.elements.applyResolutionBtn) {
            CONFIG.elements.applyResolutionBtn.addEventListener('click', async () => {
                await this.changeVideoResolution();
            });
        }
    },
    
    // NEW: Show/hide resolution controls
    toggleResolutionControls(show) {
        if (CONFIG.elements.resolutionControls) {
            CONFIG.elements.resolutionControls.style.display = show ? 'block' : 'none';
        }
    },
    
    // NEW: Change video resolution - SIMPLIFIED AND ROBUST VERSION
    async changeVideoResolution() {
        if (!CONFIG.elements.resolutionSelect) return;
        
        const resolution = CONFIG.elements.resolutionSelect.value;
        console.log(`Changing resolution to: ${resolution}`);
        
        // Store current resolution
        CONFIG.currentResolution = resolution;
        CONFIG.videoEnabled = (resolution !== 'audio-only');
        
        try {
            // If not in a call, just update local preview
            if (!CONFIG.isInCall) {
                await this.updateLocalStreamOnly();
                console.log(`✅ Resolution settings updated to: ${resolution}`);
                this.showStatus(`Quality set to: ${this.getResolutionName(resolution)}`);
                return;
            }
            
            // If in a call, use the WebRTCManager.replaceMediaTracks method
            if (CONFIG.isInCall && CONFIG.peerConnection) {
                await this.updateDuringActiveCall();
            }
            
        } catch (error) {
            console.error('Error changing resolution:', error);
            this.showError(`Failed to change resolution: ${error.message}`);
            
            // Revert selection on error
            if (CONFIG.elements.resolutionSelect) {
                const prevResolution = CONFIG.videoEnabled ? 
                    (CONFIG.currentResolution || 'medium') : 'audio-only';
                CONFIG.elements.resolutionSelect.value = prevResolution;
            }
        }
    },
    
    // Helper: Update local stream only (when not in a call)
    async updateLocalStreamOnly() {
        const constraints = this.getResolutionConstraints(CONFIG.currentResolution);
        
        // Stop old tracks
        if (CONFIG.localStream) {
            CONFIG.localStream.getTracks().forEach(track => track.stop());
        }
        
        // Get new stream
        const newStream = await navigator.mediaDevices.getUserMedia(constraints);
        CONFIG.localStream = newStream;
        
        // Update local video element
        if (CONFIG.elements.localVideo) {
            CONFIG.elements.localVideo.srcObject = newStream;
            CONFIG.elements.localVideo.muted = true;
            CONFIG.elements.localVideo.style.display = CONFIG.videoEnabled ? 'block' : 'none';
        }
    },
    
    // Helper: Update during active call

// In ui-manager.js - update the updateDuringActiveCall method
async updateDuringActiveCall() {
    const constraints = this.getResolutionConstraints(CONFIG.currentResolution);
    
    console.log('Getting new stream with constraints:', constraints);
    
    // Get new stream
    const newStream = await navigator.mediaDevices.getUserMedia(constraints);
    console.log('New stream obtained:', newStream.getTracks().map(t => t.kind));
    
    // Use WebRTCManager's method to replace tracks
    await WebRTCManager.replaceMediaTracks(newStream);
    
    console.log(`✅ Resolution changed to: ${CONFIG.currentResolution} during active call`);
    this.showStatus(`Quality changed to: ${this.getResolutionName(CONFIG.currentResolution)}`);
    
    // Force renegotiation if we're the initiator
    if (CONFIG.isInitiator) {
        console.log('🔄 We are the initiator, forcing renegotiation...');
        // This will be handled by replaceMediaTracks
    }
},

    // Helper: Get constraints for a resolution
    getResolutionConstraints(resolution) {
        const constraints = {
            audio: true
        };
        
        switch (resolution) {
            case 'audio-only':
                constraints.video = false;
                break;
                
            case 'low':
                constraints.video = { 
                    width: { ideal: 320, max: 320 },
                    height: { ideal: 240, max: 240 },
                    frameRate: { ideal: 15, max: 20 },
                    facingMode: 'user'
                };
                break;
                
            case 'medium':
                constraints.video = { 
                    width: { ideal: 640, max: 640 },
                    height: { ideal: 480, max: 480 },
                    frameRate: { ideal: 30, max: 30 },
                    facingMode: 'user'
                };
                break;
                
            case 'high':
                constraints.video = { 
                    width: { ideal: 1280, max: 1280 },
                    height: { ideal: 720, max: 720 },
                    frameRate: { ideal: 30, max: 30 },
                    facingMode: 'user'
                };
                break;
                
            case 'full-hd':
                constraints.video = { 
                    width: { ideal: 1920, max: 1920 },
                    height: { ideal: 1080, max: 1080 },
                    frameRate: { ideal: 30, max: 30 },
                    facingMode: 'user'
                };
                break;
                
            default:
                constraints.video = { 
                    width: { ideal: 640, max: 640 },
                    height: { ideal: 480, max: 480 },
                    frameRate: { ideal: 30, max: 30 },
                    facingMode: 'user'
                };
        }
        
        return constraints;
    },
    
    // NEW: Helper to get resolution display name
    getResolutionName(resolution) {
        const names = {
            'audio-only': 'Audio Only',
            'low': 'Low (320x240)',
            'medium': 'Medium (640x480)',
            'high': 'High (1280x720)',
            'full-hd': 'Full HD (1920x1080)'
        };
        return names[resolution] || resolution;
    },
    
    // Get current resolution constraints (for call-manager.js)
    getCurrentResolutionConstraints() {
        return this.getResolutionConstraints(CONFIG.currentResolution || 'medium');
    },
    
    showLoginScreen() {
        CONFIG.elements.loginDiv.style.display = 'block';
        CONFIG.elements.callDiv.style.display = 'none';
        
        // NEW: Hide resolution controls when in login screen
        this.toggleResolutionControls(false);
    },
    
    showCallScreen() {
        CONFIG.elements.loginDiv.style.display = 'none';
        CONFIG.elements.callDiv.style.display = 'block';
        
        if (CONFIG.isAdmin) {
            CONFIG.elements.userView.style.display = 'none';
            CONFIG.elements.adminView.style.display = 'block';
            document.querySelector('h2').textContent = 'WebRTC - Administrator';
        } else {
            CONFIG.elements.userView.style.display = 'block';
            CONFIG.elements.adminView.style.display = 'none';
            document.querySelector('h2').textContent = 'WebRTC - ' + CONFIG.myUsername;
        }
        
        // NEW: Show resolution controls when in call screen
        this.toggleResolutionControls(true);
        
        // Update buttons after showing call screen
        this.updateCallButtons();
    }
};

window.UIManager = UIManager;
