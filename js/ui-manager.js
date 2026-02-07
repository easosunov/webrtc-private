// js/ui-manager.js - UPDATED
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
            accessCodeInput: document.getElementById('hiddenAccessCode')
        };
        
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
        // For user view
        if (!CONFIG.isAdmin) {
            const callBtn = document.querySelector('.btn-call');
            const hangupBtn = document.querySelector('.btn-hangup');
            
            if (callBtn) {
                callBtn.disabled = CONFIG.isInCall || !CONFIG.adminSocketId || CONFIG.isProcessingAnswer;
                callBtn.className = (CONFIG.adminSocketId && !CONFIG.isInCall && !CONFIG.isProcessingAnswer) ? 
                    'btn-call active' : 'btn-call';
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
    
    showLoginScreen() {
        CONFIG.elements.loginDiv.style.display = 'block';
        CONFIG.elements.callDiv.style.display = 'none';
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
    }
};

window.UIManager = UIManager;
