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
        CONFIG.videoConstraints = {
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 30 }
        };
        CONFIG.audioEnabled = true;
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
        if (CONFIG.elements.applyResolutionBtn) {
            CONFIG.elements.applyResolutionBtn.addEventListener('click', () => {
                this.changeVideoResolution();
            });
        }
        
        if (CONFIG.elements.resolutionSelect) {
            CONFIG.elements.resolutionSelect.addEventListener('change', (e) => {
                // Optional: Apply immediately on change instead of needing Apply button
                // this.changeVideoResolution();
            });
        }
    },
    
    // NEW: Show/hide resolution controls
    toggleResolutionControls(show) {
        if (CONFIG.elements.resolutionControls) {
            CONFIG.elements.resolutionControls.style.display = show ? 'block' : 'none';
        }
    },
    
    // NEW: Change video resolution
    async changeVideoResolution() {
        if (!CONFIG.elements.resolutionSelect) return;
        
        const resolution = CONFIG.elements.resolutionSelect.value;
        
        // Define constraints based on selection
        let newConstraints = {};
        
        switch (resolution) {
            case 'audio-only':
                CONFIG.videoEnabled = false;
                CONFIG.audioEnabled = true;
                newConstraints = { 
                    audio: true,
                    video: false 
                };
                break;
                
            case 'low':
                CONFIG.videoEnabled = true;
                CONFIG.audioEnabled = true;
                newConstraints = { 
                    audio: true,
                    video: { 
                        width: { ideal: 320 },
                        height: { ideal: 240 },
                        frameRate: { ideal: 15 }
                    }
                };
                break;
                
            case 'medium':
                CONFIG.videoEnabled = true;
                CONFIG.audioEnabled = true;
                newConstraints = { 
                    audio: true,
                    video: { 
                        width: { ideal: 640 },
                        height: { ideal: 480 },
                        frameRate: { ideal: 30 }
                    }
                };
                break;
                
            case 'high':
                CONFIG.videoEnabled = true;
                CONFIG.audioEnabled = true;
                newConstraints = { 
                    audio: true,
                    video: { 
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                        frameRate: { ideal: 30 }
                    }
                };
                break;
                
            case 'full-hd':
                CONFIG.videoEnabled = true;
                CONFIG.audioEnabled = true;
                newConstraints = { 
                    audio: true,
                    video: { 
                        width: { ideal: 1920 },
                        height: { ideal: 1080 },
                        frameRate: { ideal: 30 }
                    }
                };
                break;
        }
        
        // Store the constraints
        CONFIG.videoConstraints = newConstraints.video || false;
        
        try {
            // If in a call, we need to renegotiate
            if (CONFIG.inCall && CONFIG.peerConnection && CONFIG.localStream) {
                // Get new media stream
                const newStream = await navigator.mediaDevices.getUserMedia(newConstraints);
                
                // Stop old tracks
                CONFIG.localStream.getTracks().forEach(track => track.stop());
                
                // Replace local stream
                CONFIG.localStream = newStream;
                
                // Update local video element
                if (CONFIG.elements.localVideo) {
                    CONFIG.elements.localVideo.srcObject = newStream;
                    CONFIG.elements.localVideo.style.display = CONFIG.videoEnabled ? 'block' : 'none';
                }
                
                // Replace tracks in peer connection
                const senders = CONFIG.peerConnection.getSenders();
                
                newStream.getTracks().forEach(track => {
                    const sender = senders.find(s => s.track && s.track.kind === track.kind);
                    if (sender) {
                        sender.replaceTrack(track);
                    } else {
                        // Add new track if not present
                        CONFIG.peerConnection.addTrack(track, newStream);
                    }
                });
                
                console.log(`✅ Resolution changed to: ${resolution}`);
                this.showStatus(`Quality: ${this.getResolutionName(resolution)}`);
            } else {
                // Not in a call, just update settings for next call
                CONFIG.videoConstraints = newConstraints.video || false;
                console.log(`✅ Resolution settings updated to: ${resolution} (will apply on next call)`);
                this.showStatus(`Quality set to: ${this.getResolutionName(resolution)}`);
            }
        } catch (error) {
            console.error('Error changing resolution:', error);
            this.showError(`Failed to change resolution: ${error.message}`);
        }
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
