// js/resolution-config.js - Resolution configuration for video stream
const RESOLUTION_CONFIG = {
    // Available resolution options
    options: {
        'audio-only': {
            label: 'Audio Only',
            constraints: { audio: true, video: false }
        },
        'low': {
            label: 'Low (320×240)',
            constraints: { 
                audio: true, 
                video: { 
                    width: { ideal: 320 }, 
                    height: { ideal: 240 },
                    frameRate: { ideal: 15 }
                }
            }
        },
        'medium': {
            label: 'Medium (640×480)',
            constraints: { 
                audio: true, 
                video: { 
                    width: { ideal: 640 }, 
                    height: { ideal: 480 },
                    frameRate: { ideal: 24 }
                }
            }
        },
        'high': {
            label: 'High (1280×720)',
            constraints: { 
                audio: true, 
                video: { 
                    width: { ideal: 1280 }, 
                    height: { ideal: 720 },
                    frameRate: { ideal: 30 }
                }
            }
        },
        'full-hd': {
            label: 'Full HD (1920×1080)',
            constraints: { 
                audio: true, 
                video: { 
                    width: { ideal: 1920 }, 
                    height: { ideal: 1080 },
                    frameRate: { ideal: 30 }
                }
            }
        }
    },
    
    // Default settings
    default: 'medium',
    current: 'medium',
    
    // Current constraints (will be set based on selection)
    getCurrentConstraints() {
        return this.options[this.current]?.constraints || this.options[this.default].constraints;
    },
    
    // Set current resolution
    setResolution(resolutionKey) {
        if (this.options[resolutionKey]) {
            this.current = resolutionKey;
            return true;
        }
        return false;
    },
    
    // Get all resolution options for UI
    getResolutionOptions() {
        return Object.keys(this.options).map(key => ({
            key: key,
            label: this.options[key].label,
            constraints: this.options[key].constraints
        }));
    }
};

// Export for other modules
window.RESOLUTION_CONFIG = RESOLUTION_CONFIG;