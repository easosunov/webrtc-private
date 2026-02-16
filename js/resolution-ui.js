// js/resolution-ui.js - UI components for video resolution control
const ResolutionUI = {
    // Initialize resolution UI
    init() {
        console.log('Initializing Resolution UI...');
        
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.createResolutionControls());
        } else {
            this.createResolutionControls();
        }
    },
    
    // Create resolution controls near Logout button
    createResolutionControls() {
        // Find the Logout button container
        const logoutContainer = document.querySelector('#call button[onclick="logout()"]')?.parentElement;
        if (!logoutContainer) {
            console.warn('Logout button container not found, resolution controls will not be added');
            return;
        }
        
        // Create resolution controls container
        const resolutionContainer = document.createElement('div');
        resolutionContainer.className = 'resolution-controls';
        resolutionContainer.style.cssText = `
            display: flex;
            align-items: center;
            gap: 10px;
            margin-top: 20px;
            padding: 15px;
            background: #f8f9fa;
            border-radius: 8px;
            border: 1px solid #ddd;
        `;
        
        // Create label
        const label = document.createElement('span');
        label.textContent = 'Video Quality:';
        label.style.cssText = `
            font-weight: bold;
            color: #333;
            font-size: 14px;
        `;
        
        // Create dropdown
        const dropdown = document.createElement('select');
        dropdown.id = 'resolutionSelector';
        dropdown.style.cssText = `
            padding: 8px 12px;
            border: 1px solid #ccc;
            border-radius: 4px;
            background: white;
            color: #333;
            font-size: 14px;
            cursor: pointer;
            min-width: 160px;
        `;
        
        // Create status indicator
        const statusSpan = document.createElement('span');
        statusSpan.id = 'resolutionStatus';
        statusSpan.style.cssText = `
            font-size: 12px;
            color: #666;
            margin-left: auto;
            font-style: italic;
        `;
        
        // Populate dropdown options
        this.populateResolutionDropdown(dropdown);
        
        // Set initial value
        dropdown.value = RESOLUTION_CONFIG.current;
        statusSpan.textContent = RESOLUTION_CONFIG.options[RESOLUTION_CONFIG.current]?.label || '';
        
        // Add event listener
        dropdown.addEventListener('change', (event) => this.handleResolutionChange(event, statusSpan));
        
        // Assemble the container
        resolutionContainer.appendChild(label);
        resolutionContainer.appendChild(dropdown);
        resolutionContainer.appendChild(statusSpan);
        
        // Insert before the logout button container
        logoutContainer.parentNode.insertBefore(resolutionContainer, logoutContainer);
        
        console.log('Resolution controls created');
    },
    
    // Populate dropdown with resolution options
    populateResolutionDropdown(dropdown) {
        const options = RESOLUTION_CONFIG.getResolutionOptions();
        
        options.forEach(option => {
            const optionElement = document.createElement('option');
            optionElement.value = option.key;
            optionElement.textContent = option.label;
            dropdown.appendChild(optionElement);
        });
    },
    
    // Handle resolution change
    async handleResolutionChange(event, statusSpan) {
        const newResolution = event.target.value;
        const dropdown = event.target;
        
        // Disable dropdown during change
        dropdown.disabled = true;
        const originalLabel = statusSpan.textContent;
        statusSpan.textContent = 'Changing...';
        statusSpan.style.color = '#ff9800';
        
        try {
            // Call Resolution Manager to change resolution
            const result = await ResolutionManager.changeResolution(newResolution);
            
            if (result.success) {
                if (result.same) {
                    statusSpan.textContent = 'Already selected';
                    statusSpan.style.color = '#666';
                } else {
                    statusSpan.textContent = result.message || 'Resolution changed';
                    statusSpan.style.color = '#4CAF50';
                    
                    // Update UI status
                    if (UIManager.showStatus) {
                        UIManager.showStatus(result.message || 'Video quality updated');
                    }
                    
                    // Auto-clear success message after 2 seconds
                    setTimeout(() => {
                        statusSpan.textContent = RESOLUTION_CONFIG.options[newResolution]?.label || '';
                        statusSpan.style.color = '#666';
                    }, 2000);
                }
            } else {
                // Revert dropdown to previous value on error
                dropdown.value = RESOLUTION_CONFIG.current;
                statusSpan.textContent = `Error: ${result.error}`;
                statusSpan.style.color = '#f44336';
                
                if (UIManager.showError) {
                    UIManager.showError(`Failed to change resolution: ${result.error}`);
                }
            }
            
        } catch (error) {
            console.error('Resolution change failed:', error);
            
            // Revert dropdown to previous value
            dropdown.value = RESOLUTION_CONFIG.current;
            statusSpan.textContent = 'Change failed';
            statusSpan.style.color = '#f44336';
            
            if (UIManager.showError) {
                UIManager.showError(`Failed to change resolution: ${error.message}`);
            }
            
        } finally {
            // Re-enable dropdown
            dropdown.disabled = false;
        }
    },
    
    // Update resolution status display
    updateResolutionStatus() {
        const dropdown = document.getElementById('resolutionSelector');
        const statusSpan = document.getElementById('resolutionStatus');
        
        if (dropdown && statusSpan) {
            dropdown.value = RESOLUTION_CONFIG.current;
            statusSpan.textContent = RESOLUTION_CONFIG.options[RESOLUTION_CONFIG.current]?.label || '';
        }
    },
    
    // Show/hide resolution controls based on permissions
    toggleResolutionControls(show) {
        const resolutionContainer = document.querySelector('.resolution-controls');
        if (resolutionContainer) {
            resolutionContainer.style.display = show ? 'flex' : 'none';
        }
    },
    
    // Add CSS styles for resolution controls
    addStyles() {
        const styleId = 'resolution-ui-styles';
        if (document.getElementById(styleId)) return;
        
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .resolution-controls select:disabled {
                opacity: 0.6;
                cursor: not-allowed;
            }
            
            .resolution-controls option {
                padding: 8px;
            }
            
            @media (max-width: 768px) {
                .resolution-controls {
                    flex-direction: column;
                    align-items: stretch;
                    gap: 8px;
                }
                
                .resolution-controls select {
                    width: 100%;
                }
                
                .resolution-controls #resolutionStatus {
                    margin-left: 0;
                    text-align: center;
                }
            }
            
            @media (max-width: 480px) {
                .resolution-controls {
                    padding: 10px;
                }
            }
        `;
        
        document.head.appendChild(style);
    }
};

// Initialize styles when loaded
ResolutionUI.addStyles();

// Export for other modules
window.ResolutionUI = ResolutionUI;
