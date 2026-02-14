// js/webrtc-metrics.js - WebRTC peer connection metrics
const WebRTCMetrics = {
    interval: null,
    lastUpdate: 0,
    
    init() {
        console.log('Initializing WebRTC metrics...');
        DebugConsole?.info('WebRTC', 'Metrics collector initialized');
        this.startMonitoring();
    },
    
    startMonitoring() {
        if (this.interval) clearInterval(this.interval);
        
        this.interval = setInterval(() => {
            this.collectMetrics();
        }, 5000); // Update every 5 seconds
    },
    
    async collectMetrics() {
        if (!CONFIG.peerConnection || CONFIG.peerConnection.connectionState !== 'connected') {
            // No active call, clear display
            this.updateIndicator(null);
            return;
        }
        
        try {
            const stats = await CONFIG.peerConnection.getStats();
            let metrics = {
                rtt: 0,
                bandwidth: 0,
                packetsLost: 0,
                jitter: 0,
                resolution: null,
                frameRate: 0
            };
            
            stats.forEach(report => {
                // Get connection stats
                if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                    metrics.rtt = Math.round((report.currentRoundTripTime || 0) * 1000); // Convert to ms
                    metrics.bandwidth = Math.round((report.availableOutgoingBitrate || 0) / 1024); // kbps
                }
                
                // Get inbound video stats
                if (report.type === 'inbound-rtp' && report.kind === 'video') {
                    metrics.packetsLost = report.packetsLost || 0;
                    metrics.jitter = Math.round((report.jitter || 0) * 1000); // Convert to ms
                    metrics.frameRate = report.framesPerSecond || 0;
                    
                    // Get resolution if available
                    if (report.frameWidth && report.frameHeight) {
                        metrics.resolution = `${report.frameWidth}x${report.frameHeight}`;
                    }
                }
                
                // Get outbound video stats as fallback
                if (report.type === 'outbound-rtp' && report.kind === 'video' && !metrics.frameRate) {
                    metrics.frameRate = report.framesPerSecond || 0;
                }
            });
            
            this.updateIndicator(metrics);
            
            // Also log to debug console periodically
            if (metrics.rtt > 0 && Math.random() < 0.2) { // 20% chance
                DebugConsole?.network('WebRTC', `RTT: ${metrics.rtt}ms, BW: ${metrics.bandwidth}kbps, Loss: ${metrics.packetsLost}`);
            }
            
        } catch (error) {
            console.error('Failed to get WebRTC stats:', error);
        }
    },
    
    updateIndicator(metrics) {
        const indicator = document.getElementById('webrtcIndicator');
        if (!indicator) return;
        
        if (!metrics || metrics.rtt === 0) {
            indicator.innerHTML = '🔄 --ms';
            indicator.style.color = '#999';
            indicator.title = 'No active peer connection';
            return;
        }
        
        // Create detailed tooltip
        const tooltip = `Peer Connection (WebRTC)
RTT: ${metrics.rtt}ms
Bandwidth: ${metrics.bandwidth} kbps
Packet Loss: ${metrics.packetsLost}
Jitter: ${metrics.jitter}ms
Resolution: ${metrics.resolution || 'unknown'}
Frame Rate: ${metrics.frameRate} fps`;
        
        // Choose color based on RTT
        let color;
        if (metrics.rtt < 50) color = '#44aa44';      // Green - excellent
        else if (metrics.rtt < 100) color = '#88cc44'; // Light green - good
        else if (metrics.rtt < 200) color = '#ffaa44'; // Orange - fair
        else if (metrics.rtt < 300) color = '#ff7744'; // Orange-red - poor
        else color = '#ff4444';                        // Red - bad
        
        // Choose symbol based on connection
        let symbol = '🔄';
        if (metrics.bandwidth > 5000) symbol = '🚀';    // >5 Mbps
        else if (metrics.bandwidth > 2000) symbol = '📡'; // 2-5 Mbps
        else if (metrics.bandwidth > 800) symbol = '📶';  // 0.8-2 Mbps
        else symbol = '🐢';                               // <800 kbps
        
        // Display
        indicator.innerHTML = `${symbol} ${metrics.rtt}ms`;
        indicator.style.color = color;
        indicator.title = tooltip;
    },
    
    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        this.updateIndicator(null);
    }
};

// Auto-start when page loads
document.addEventListener('DOMContentLoaded', () => {
    WebRTCMetrics.init();
});

window.WebRTCMetrics = WebRTCMetrics;
