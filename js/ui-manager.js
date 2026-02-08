// js/ui-manager.js - COMPLETE FIXED VERSION
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
            
            // Access code input (if exists)
            accessCodeInput: document.getElementById('hiddenAccessCode'),
            
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
        // Only admin should see user list
        if (!CONFIG.isAdmin) return;
        
        // If userList element doesn't exist yet, try to find it
        if (!CONFIG.elements.userList) {
            CONFIG.elements.userList = document.getElementById('userList');
            if (!CONFIG.elements.userList) {
                console.warn('userList element not found');
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
        
        // For admin view (admin calling users)
        if (CONFIG.isAdmin && CONFIG.elements.userList) {
            const userLines = CONFIG.elements.userList.querySelectorAll('.user-line');
            userLines.forEach(line => {
                const callBtn = line.querySelector('.btn-call');
                const hangupBtn = line.querySelector('.btn-hangup');
                
                if (callBtn) {
                    callBtn.disabled = CONFIG.isInCall;
                    callBtn.className = CONFIG.isInCall ? 'btn-call' : 'btn-call active';
                }
                
                if (hangupBtn) {
                    hangupBtn.disabled = !CONFIG.isInCall;
                    hangupBtn.className = CONFIG.isInCall ? 'btn-hangup active' : 'btn-hangup';
                }
            });
        }
    },
    
    showLoginScreen() {
        if (CONFIG.elements.loginDiv) {
            CONFIG.elements.loginDiv.style.display = 'block';
        }
        if (CONFIG.elements.callDiv) {
            CONFIG.elements.callDiv.style.display = 'none';
        }
        this.showStatus('Please login');
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
    }
};

window.UIManager = UIManager;
