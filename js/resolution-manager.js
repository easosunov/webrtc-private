// js/resolution-manager.js - COMPLETELY NEW FILE
// This isolates resolution logic from existing code

const ResolutionManager = {
    current: 'medium',
    
    init() {
        // Load saved resolution
        const saved = localStorage.getItem('webrtc-resolution');
        if (saved && CONFIG.resolutionSettings.presets[saved]) {
            this.current = saved;
            this.updateUI();
        }
        console.log('ResolutionManager initialized:', this.current);
    },
    
    change(newResolution) {
        if (!CONFIG.resolutionSettings.presets[newResolution]) {
            console.error('Invalid resolution:', newResolution);
            return false;
        }
        
        this.current = newResolution;
        CONFIG.resolutionSettings.current = newResolution;
        localStorage.setItem('webrtc-resolution', newResolution);
        
        this.updateUI();
        console.log('Resolution changed to:', newResolution);
        return true;
    },
    
    updateUI() {
        const select = document.getElementById('resolutionSelect');
        const status = document.getElementById('resolutionStatus');
        
        if (select) select.value = this.current;
        if (status) {
            if (this.current === 'audio-only') {
                status.textContent = '✓ Audio only (next call)';
                status.style.color = '#2196F3';
            } else {
                const preset = CONFIG.resolutionSettings.presets[this.current];
                const width = preset.video?.width || 0;
                const height = preset.video?.height || 0;
                status.textContent = `✓ ${width}x${height} (next call)`;
                status.style.color = '#4CAF50';
            }
        }
    },
    
    // Get constraints for new call - DOES NOT AFFECT EXISTING STREAMS
    getCallConstraints() {
        return CONFIG.resolutionSettings.presets[this.current] || 
               CONFIG.resolutionSettings.presets.medium;
    },
    
    // Get constraints for local preview (always video enabled)
    getPreviewConstraints() {
        return { audio: true, video: true }; // Default for preview
    },
    
    // Get media stream for a CALL (uses selected resolution)
    async getCallMedia() {
        const constraints = this.getCallConstraints();
        console.log('Getting call media with constraints:', constraints);
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.logStreamDetails(stream, 'call');
            return stream;
        } catch (error) {
            console.error('Failed to get call media:', error);
            
            // Fallback strategy
            if (this.current !== 'audio-only') {
                console.log('Trying audio-only fallback...');
                try {
                    return await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                } catch (fallbackError) {
                    console.error('Fallback also failed:', fallbackError);
                }
            }
            
            throw error;
        }
    },
    
    // Get media stream for PREVIEW (always video)
    async getPreviewMedia() {
        const constraints = this.getPreviewConstraints();
        console.log('Getting preview media');
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.logStreamDetails(stream, 'preview');
            return stream;
        } catch (error) {
            console.error('Failed to get preview media:', error);
            throw error;
        }
    },
    
    logStreamDetails(stream, type) {
        console.log(`📹 ${type} stream obtained:`);
        console.log(`  Audio tracks: ${stream.getAudioTracks().length}`);
        console.log(`  Video tracks: ${stream.getVideoTracks().length}`);
        
        if (stream.getVideoTracks().length > 0) {
            const track = stream.getVideoTracks()[0];
            const settings = track.getSettings();
            console.log(`  Video: ${settings.width}x${settings.height} @${settings.frameRate}fps`);
        }
    }
};

// Global function for HTML
window.handleResolutionChange = function(resolution) {
    ResolutionManager.change(resolution);
};

// Export
window.ResolutionManager = ResolutionManager;